import io
import os
import re
import tempfile
import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple
from uuid import UUID
import openpyxl
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.encryption import encryption_service
from app.core.exceptions import ConflictException, NotFoundException, ValidationException
from app.models.audit_log import AuditAction
from app.models.dynamic_column import ColumnType, DataColumn
from app.models.dynamic_record import DataRecord
from app.models.dynamic_table import DataTable
from app.models.import_export import ImportHistory, ImportStatus
from app.models.record_version import ChangeType, RecordVersion
from app.models.table_history import TableHistory
from app.models.user import User
from app.schemas.import_export import (
    BatchImportExecuteRequest,
    BatchImportExecuteResponse,
    BatchImportTableResult,
    ColumnMappingConfig,
    DetectedColumn,
    ExcelPreviewResponse,
    ImportExecuteRequest,
    ImportRowError,
    ImportValidationSummary,
)
from app.services.audit_service import audit_service
from app.services.column_service import validate_and_convert_value_to_type
from app.services.rbac_service import rbac_service
from app.services.table_service import slugify


# In-memory / temp storage for uploaded import files awaiting confirmation
TEMP_UPLOAD_DIR = tempfile.gettempdir()


def _is_number(val: Any) -> bool:
    try:
        s = str(val).strip()
        if not s or s.upper() in ("#N/A", "#VALUE!", "#REF!", "#NULL!", "N/A", "NA", "NULL", "NONE", "-"):
            return False
        float(s)
        return True
    except (ValueError, TypeError):
        return False


def infer_column_type_from_samples(values: List[Any]) -> ColumnType:
    """Infer the most appropriate ColumnType from a list of non-empty sample values."""
    if not values:
        return ColumnType.TEXT

    non_empty = [v for v in values if v is not None and str(v).strip() != ""]
    if not non_empty:
        return ColumnType.TEXT

    # Check for mixed numbers and text/symbols or Excel error values
    has_mixed_errors = any(
        str(v).strip().upper() in ("#N/A", "#VALUE!", "#REF!", "#NULL!", "#DIV/0!", "N/A", "NA")
        for v in non_empty
    )
    numeric_count = sum(1 for v in non_empty if _is_number(v))
    non_numeric_count = len(non_empty) - numeric_count

    # If column contains both numbers and text/symbols, infer MIXED
    if (numeric_count > 0 and non_numeric_count > 0) or (has_mixed_errors and numeric_count > 0):
        return ColumnType.MIXED

    # If ALL non-empty values are pure numbers
    if numeric_count == len(non_empty):
        is_all_int = all(str(v).strip().lstrip("-").isdigit() for v in non_empty)
        if is_all_int:
            return ColumnType.NUMBER
        return ColumnType.DECIMAL

    # Check boolean
    if all(str(v).strip().lower() in ("true", "false", "0", "1", "yes", "no") for v in non_empty):
        return ColumnType.BOOLEAN

    # Check email
    if all(re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", str(v).strip()) for v in non_empty):
        return ColumnType.EMAIL

    # Check IP
    if all(
        len(str(v).strip().split(".")) == 4 and all(p.isdigit() and 0 <= int(p) <= 255 for p in str(v).strip().split("."))
        for v in non_empty
    ):
        return ColumnType.IP_ADDRESS

    # Check date
    date_matches = 0
    for v in non_empty:
        v_str = str(v).strip()[:10]
        for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%m/%d/%Y", "%d-%m-%Y"):
            try:
                dt = datetime.strptime(v_str, fmt)
                date_matches += 1
                break
            except ValueError:
                pass
    if date_matches == len(non_empty):
        return ColumnType.DATE

    # Check alphanumeric codes (digits mixed with letters / symbols)
    if any(re.search(r"\d", str(v)) and re.search(r"[a-zA-Z@#$!%&*_-]", str(v)) for v in non_empty):
        return ColumnType.MIXED

    return ColumnType.TEXT


class ImportService:
    @staticmethod
    def save_temp_file(file_bytes: bytes, original_filename: str) -> str:
        """Saves uploaded excel bytes to temp storage and returns file token."""
        file_token = str(uuid.uuid4())
        file_path = os.path.join(TEMP_UPLOAD_DIR, f"import_{file_token}.xlsx")
        with open(file_path, "wb") as f:
            f.write(file_bytes)
        return file_token

    @staticmethod
    def get_temp_file_path(file_token: str) -> str:
        file_path = os.path.join(TEMP_UPLOAD_DIR, f"import_{file_token}.xlsx")
        if not os.path.exists(file_path):
            raise NotFoundException("Uploaded file session expired or not found. Please upload again.")
        return file_path

    @staticmethod
    def parse_and_preview(
        file_token: str,
        original_filename: str,
        sheet_name: Optional[str] = None,
    ) -> ExcelPreviewResponse:
        file_path = ImportService.get_temp_file_path(file_token)
        wb = openpyxl.load_workbook(file_path, read_only=True, data_only=True)
        sheets = wb.sheetnames
        selected_sheet = sheet_name if sheet_name and sheet_name in sheets else sheets[0]
        ws = wb[selected_sheet]

        rows_iter = ws.iter_rows(values_only=True)
        headers_raw = next(rows_iter, None)
        if not headers_raw:
            wb.close()
            raise ValidationException("The selected sheet appears to be empty.")

        # Clean headers
        headers = [str(h).strip() if h is not None else f"Column_{i+1}" for i, h in enumerate(headers_raw)]
        
        column_samples: Dict[str, List[Any]] = {h: [] for h in headers}
        preview_rows: List[Dict[str, Any]] = []
        total_rows = 0

        for row in rows_iter:
            if not any(cell is not None and str(cell).strip() != "" for cell in row):
                continue
            total_rows += 1
            row_dict = {}
            for i, header in enumerate(headers):
                val = row[i] if i < len(row) else None
                row_dict[header] = val
                if len(column_samples[header]) < 100 and val is not None:
                    column_samples[header].append(val)
            if len(preview_rows) < 10:
                preview_rows.append(row_dict)

        wb.close()

        # Build detected columns
        detected_columns = []
        for header in headers:
            samples = column_samples.get(header, [])
            suggested_type = infer_column_type_from_samples(samples)
            
            # Check if header hints at password/secret
            is_sensitive = any(kw in header.lower() for kw in ("password", "secret", "token", "key", "pin"))
            if is_sensitive and suggested_type == ColumnType.TEXT:
                suggested_type = ColumnType.PASSWORD

            detected_columns.append(
                DetectedColumn(
                    original_name=header,
                    suggested_name=slugify(header),
                    suggested_type=suggested_type,
                    sample_values=samples[:5],
                    is_required=False,
                    is_sensitive=is_sensitive,
                )
            )

        file_size = os.path.getsize(file_path)

        return ExcelPreviewResponse(
            file_token=file_token,
            file_name=original_filename,
            file_size_bytes=file_size,
            sheets=sheets,
            selected_sheet=selected_sheet,
            total_rows=total_rows,
            total_columns=len(headers),
            detected_columns=detected_columns,
            preview_rows=preview_rows,
        )

    @staticmethod
    def validate_rows(
        file_token: str,
        sheet_name: str,
        column_configs: List[ColumnMappingConfig],
    ) -> ImportValidationSummary:
        file_path = ImportService.get_temp_file_path(file_token)
        wb = openpyxl.load_workbook(file_path, read_only=True, data_only=True)
        ws = wb[sheet_name]
        rows_iter = ws.iter_rows(values_only=True)

        headers_raw = next(rows_iter, None)
        if not headers_raw:
            wb.close()
            return ImportValidationSummary(total_rows=0, valid_rows=0, warning_rows=0, error_rows=0, is_valid=True)

        header_idx_map = {str(h).strip(): i for i, h in enumerate(headers_raw) if h is not None}

        total_rows = 0
        valid_rows = 0
        warning_rows = 0
        error_rows = 0
        errors: List[ImportRowError] = []
        warnings: List[ImportRowError] = []

        row_num = 1  # 1 is header
        for row in rows_iter:
            if not any(cell is not None and str(cell).strip() != "" for cell in row):
                continue
            row_num += 1
            total_rows += 1
            has_error = False
            has_warning = False

            for cfg in column_configs:
                idx = header_idx_map.get(cfg.source_column)
                cell_val = row[idx] if idx is not None and idx < len(row) else None

                # Check required
                if cfg.is_required and (cell_val is None or str(cell_val).strip() == ""):
                    errors.append(
                        ImportRowError(
                            row_number=row_num,
                            column_name=cfg.target_column,
                            error_type="REQUIRED_FIELD_MISSING",
                            message=f"Required field '{cfg.target_column}' is missing or empty.",
                            raw_value=cell_val,
                        )
                    )
                    has_error = True
                    continue

                if cell_val is not None and str(cell_val).strip() != "":
                    if not cfg.is_sensitive:
                        is_valid, _ = validate_and_convert_value_to_type(cell_val, cfg.data_type)
                        if not is_valid:
                            errors.append(
                                ImportRowError(
                                    row_number=row_num,
                                    column_name=cfg.target_column,
                                    error_type="TYPE_CONVERSION_ERROR",
                                    message=f"Value '{cell_val}' cannot be converted to {cfg.data_type.value}.",
                                    raw_value=str(cell_val),
                                )
                            )
                            has_error = True

            if has_error:
                error_rows += 1
            elif has_warning:
                warning_rows += 1
            else:
                valid_rows += 1

        wb.close()

        return ImportValidationSummary(
            total_rows=total_rows,
            valid_rows=valid_rows,
            warning_rows=warning_rows,
            error_rows=error_rows,
            is_valid=(error_rows == 0),
            errors=errors[:100],  # Cap response errors for performance
            warnings=warnings[:100],
        )

    @staticmethod
    async def execute_import(
        db: AsyncSession,
        req: ImportExecuteRequest,
        original_filename: str,
        user: User,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
    ) -> ImportHistory:
        """ACID Transactional Excel Importer with rollback guarantee."""
        file_path = ImportService.get_temp_file_path(req.file_token)
        wb = openpyxl.load_workbook(file_path, read_only=True, data_only=True)
        ws = wb[req.sheet_name]
        rows_iter = ws.iter_rows(values_only=True)

        headers_raw = next(rows_iter, None)
        if not headers_raw:
            wb.close()
            raise ValidationException("Selected sheet has no rows.")

        header_idx_map = {str(h).strip(): i for i, h in enumerate(headers_raw) if h is not None}
        file_size = os.path.getsize(file_path)

        table: Optional[DataTable] = None

        if req.mode == "INSERT_NEW_TABLE":
            # Create new DataTable
            if not req.new_table_name or not req.new_table_display_name:
                raise ValidationException("New table name and display name are required.")

            table_slug = slugify(req.new_table_name)
            existing = await db.execute(select(DataTable).where(DataTable.name == table_slug))
            if existing.scalar_one_or_none():
                raise ConflictException(f"Table '{table_slug}' already exists.")

            table = DataTable(
                name=table_slug,
                display_name=req.new_table_display_name.strip(),
                description=req.new_table_description.strip() if req.new_table_description else None,
                is_active=True,
                created_by_id=user.id,
                updated_by_id=user.id,
            )
            db.add(table)
            await db.flush()

            # Create columns
            columns = []
            for idx, col_cfg in enumerate(req.columns):
                col = DataColumn(
                    table_id=table.id,
                    name=slugify(col_cfg.target_column),
                    display_name=col_cfg.target_column.strip(),
                    data_type=col_cfg.data_type,
                    is_required=col_cfg.is_required,
                    is_sensitive=col_cfg.is_sensitive,
                    is_encrypted=col_cfg.is_encrypted or col_cfg.is_sensitive or col_cfg.data_type == ColumnType.PASSWORD,
                    display_order=idx,
                    validation_rules=col_cfg.validation_rules,
                )
                db.add(col)
                columns.append(col)
            await db.flush()

        else:
            # Existing Table
            if not req.existing_table_id:
                raise ValidationException("Existing table ID is required.")

            table_res = await db.execute(
                select(DataTable).options(selectinload(DataTable.columns)).where(DataTable.id == req.existing_table_id)
            )
            table = table_res.scalar_one_or_none()
            if not table:
                raise NotFoundException("Target table not found.")

            # Check import permission
            t_perms = await rbac_service.get_effective_table_permission(db, user, table.id)
            if not t_perms["can_import"]:
                raise ForbiddenException("You do not have permission to import into this table.")

            columns = table.columns

        col_map = {c.name: c for c in columns}

        # Validate matching key column for UPDATE and UPSERT
        if req.mode in ("UPDATE_EXISTING", "UPSERT_EXISTING"):
            if not req.matching_key_column or req.matching_key_column not in col_map:
                raise ValidationException("A valid matching key column is required for update/upsert modes.")

        imported_count = 0
        warning_count = 0
        error_count = 0
        row_errors = []

        row_num = 1
        for row in rows_iter:
            if not any(cell is not None and str(cell).strip() != "" for cell in row):
                continue
            row_num += 1

            record_payload = {}
            has_error = False

            for col_cfg in req.columns:
                target_name = slugify(col_cfg.target_column)
                col = col_map.get(target_name)
                if not col:
                    continue

                idx = header_idx_map.get(col_cfg.source_column)
                raw_val = row[idx] if idx is not None and idx < len(row) else None

                if col.is_required and (raw_val is None or str(raw_val).strip() == ""):
                    has_error = True
                    row_errors.append(f"Row {row_num}: Missing required field '{col.display_name}'")
                    break

                if raw_val is not None and str(raw_val).strip() != "":
                    if not col.is_sensitive:
                        is_valid, conv = validate_and_convert_value_to_type(raw_val, col.data_type)
                        if not is_valid:
                            has_error = True
                            row_errors.append(f"Row {row_num}: Invalid value '{raw_val}' for '{col.display_name}'")
                            break
                        val_to_store = conv
                    else:
                        val_to_store = str(raw_val)

                    # Encrypt if needed
                    if col.is_sensitive or col.is_encrypted or col.data_type == ColumnType.PASSWORD:
                        record_payload[target_name] = encryption_service.encrypt(val_to_store, context=target_name)
                    else:
                        record_payload[target_name] = val_to_store
                else:
                    record_payload[target_name] = None

            if has_error:
                error_count += 1
                continue

            # Insert / Update logic
            if req.mode in ("UPDATE_EXISTING", "UPSERT_EXISTING") and req.matching_key_column:
                key_val = record_payload.get(req.matching_key_column)
                # Find matching record
                match_res = await db.execute(
                    select(DataRecord).where(DataRecord.table_id == table.id)
                )
                existing_records = match_res.scalars().all()
                matched_rec = next(
                    (r for r in existing_records if (r.data or {}).get(req.matching_key_column) == key_val), None
                )

                if matched_rec:
                    # Update
                    merged_data = dict(matched_rec.data or {})
                    merged_data.update(record_payload)
                    matched_rec.data = merged_data
                    matched_rec.version += 1
                    matched_rec.updated_by_id = user.id

                    v_snap = RecordVersion(
                        record_id=matched_rec.id,
                        table_id=table.id,
                        version_number=matched_rec.version,
                        data_snapshot=merged_data,
                        change_type=ChangeType.UPDATE,
                        changed_by_id=user.id,
                    )
                    db.add(v_snap)
                    imported_count += 1
                elif req.mode == "UPSERT_EXISTING":
                    # Insert new
                    new_rec = DataRecord(
                        table_id=table.id,
                        data=record_payload,
                        version=1,
                        created_by_id=user.id,
                        updated_by_id=user.id,
                    )
                    db.add(new_rec)
                    await db.flush()
                    v_snap = RecordVersion(
                        record_id=new_rec.id,
                        table_id=table.id,
                        version_number=1,
                        data_snapshot=record_payload,
                        change_type=ChangeType.CREATE,
                        changed_by_id=user.id,
                    )
                    db.add(v_snap)
                    imported_count += 1
            else:
                # Direct Insert
                new_rec = DataRecord(
                    table_id=table.id,
                    data=record_payload,
                    version=1,
                    created_by_id=user.id,
                    updated_by_id=user.id,
                )
                db.add(new_rec)
                await db.flush()

                v_snap = RecordVersion(
                    record_id=new_rec.id,
                    table_id=table.id,
                    version_number=1,
                    data_snapshot=record_payload,
                    change_type=ChangeType.CREATE,
                    changed_by_id=user.id,
                )
                db.add(v_snap)
                imported_count += 1

        wb.close()

        # Record Import History
        import_history = ImportHistory(
            table_id=table.id,
            table_name=table.name,
            file_name=original_filename,
            file_size_bytes=file_size,
            total_rows=imported_count + error_count,
            imported_rows=imported_count,
            warning_rows=warning_count,
            error_rows=error_count,
            status=ImportStatus.COMPLETED if error_count == 0 else ImportStatus.COMPLETED_WITH_WARNINGS,
            validation_summary={"total": imported_count + error_count, "imported": imported_count, "errors": error_count},
            error_details={"sample_errors": row_errors[:50]} if row_errors else None,
            imported_by_id=user.id,
            imported_by_username=user.username,
        )
        db.add(import_history)

        # Audit
        await audit_service.log_event(
            db=db,
            action=AuditAction.IMPORT,
            username=user.username,
            user_id=user.id,
            table_id=table.id,
            table_name=table.name,
            ip_address=ip_address,
            user_agent=user_agent,
            details={
                "file_name": original_filename,
                "mode": req.mode,
                "imported_rows": imported_count,
                "error_rows": error_count,
            },
        )

        await db.commit()
        await db.refresh(import_history)

        # Clean up temp file
        try:
            if os.path.exists(file_path):
                os.remove(file_path)
        except Exception:
            pass

        return import_history

    @staticmethod
    async def batch_import_sheets(
        db: AsyncSession,
        req: BatchImportExecuteRequest,
        original_filename: str,
        user: User,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
    ) -> BatchImportExecuteResponse:
        """Batch imports multiple worksheets creating distinct dynamic tables in one operation."""
        file_path = ImportService.get_temp_file_path(req.file_token)
        wb = openpyxl.load_workbook(file_path, read_only=True, data_only=True)
        available_sheets = wb.sheetnames

        successful_tables: List[BatchImportTableResult] = []
        failed_sheets: List[BatchImportTableResult] = []

        for sheet_cfg in req.sheets:
            if sheet_cfg.sheet_name not in available_sheets:
                failed_sheets.append(
                    BatchImportTableResult(
                        sheet_name=sheet_cfg.sheet_name,
                        table_name=sheet_cfg.table_name,
                        table_display_name=sheet_cfg.table_display_name,
                        status="FAILED",
                        error_message=f"Sheet '{sheet_cfg.sheet_name}' not found in Excel workbook.",
                    )
                )
                continue

            try:
                ws = wb[sheet_cfg.sheet_name]
                rows_iter = ws.iter_rows(values_only=True)
                headers_raw = next(rows_iter, None)
                if not headers_raw:
                    failed_sheets.append(
                        BatchImportTableResult(
                            sheet_name=sheet_cfg.sheet_name,
                            table_name=sheet_cfg.table_name,
                            table_display_name=sheet_cfg.table_display_name,
                            status="FAILED",
                            error_message="Sheet is empty or has no header row.",
                        )
                    )
                    continue

                # Ensure unique table slug
                base_slug = slugify(sheet_cfg.table_name or sheet_cfg.sheet_name)
                candidate_slug = base_slug
                suffix_idx = 1
                while True:
                    existing = (
                        await db.execute(select(DataTable).where(DataTable.name == candidate_slug))
                    ).scalar_one_or_none()
                    if not existing:
                        break
                    candidate_slug = f"{base_slug}_{suffix_idx}"
                    suffix_idx += 1

                # Clean headers and read rows
                headers = [str(h).strip() if h is not None else f"Column_{i+1}" for i, h in enumerate(headers_raw)]
                rows_data: List[List[Any]] = []
                col_samples: Dict[str, List[Any]] = {h: [] for h in headers}

                for row in rows_iter:
                    if not any(cell is not None and str(cell).strip() != "" for cell in row):
                        continue
                    rows_data.append(list(row))
                    for i, h in enumerate(headers):
                        val = row[i] if i < len(row) else None
                        if val is not None and len(col_samples[h]) < 100:
                            col_samples[h].append(val)

                # Create DataTable
                table = DataTable(
                    name=candidate_slug,
                    display_name=sheet_cfg.table_display_name.strip() or sheet_cfg.sheet_name,
                    description=f"Imported from sheet '{sheet_cfg.sheet_name}' in {original_filename}",
                    is_active=True,
                    created_by_id=user.id,
                    updated_by_id=user.id,
                )
                db.add(table)
                await db.flush()

                # Infer types and create columns
                col_entities: List[DataColumn] = []
                for idx, h in enumerate(headers):
                    samples = col_samples.get(h, [])
                    inferred_type = infer_column_type_from_samples(samples)
                    is_sensitive = any(kw in h.lower() for kw in ("password", "secret", "token", "key", "pin"))
                    if is_sensitive and inferred_type == ColumnType.TEXT:
                        inferred_type = ColumnType.PASSWORD

                    col_slug = slugify(h)
                    if any(c.name == col_slug for c in col_entities):
                        col_slug = f"{col_slug}_{idx+1}"

                    col_obj = DataColumn(
                        table_id=table.id,
                        name=col_slug,
                        display_name=h,
                        data_type=inferred_type,
                        is_required=False,
                        is_sensitive=is_sensitive,
                        is_encrypted=is_sensitive or inferred_type == ColumnType.PASSWORD,
                        display_order=idx,
                    )
                    db.add(col_obj)
                    col_entities.append(col_obj)
                await db.flush()

                # Insert records
                imported_rows = 0
                for r in rows_data:
                    record_dict = {}
                    for idx, col_obj in enumerate(col_entities):
                        raw_val = r[idx] if idx < len(r) else None
                        if raw_val is not None and str(raw_val).strip() != "":
                            if not col_obj.is_sensitive:
                                is_valid, conv = validate_and_convert_value_to_type(raw_val, col_obj.data_type)
                                val_to_store = conv if is_valid else str(raw_val)
                            else:
                                val_to_store = str(raw_val)

                            if col_obj.is_sensitive or col_obj.is_encrypted or col_obj.data_type == ColumnType.PASSWORD:
                                record_dict[col_obj.name] = encryption_service.encrypt(val_to_store, context=col_obj.name)
                            else:
                                record_dict[col_obj.name] = val_to_store
                        else:
                            record_dict[col_obj.name] = None

                    record_entity = DataRecord(
                        table_id=table.id,
                        data=record_dict,
                        version=1,
                        is_deleted=False,
                        created_by_id=user.id,
                        updated_by_id=user.id,
                    )
                    db.add(record_entity)
                    await db.flush()

                    rec_ver = RecordVersion(
                        record_id=record_entity.id,
                        table_id=table.id,
                        version_number=1,
                        data_snapshot=record_dict,
                        change_type=ChangeType.CREATE,
                        changed_by_id=user.id,
                    )
                    db.add(rec_ver)
                    imported_rows += 1

                # Table history & audit
                t_hist = TableHistory(
                    table_id=table.id,
                    action="TABLE_CREATED_VIA_MULTI_SHEET_IMPORT",
                    details=f"Created from worksheet '{sheet_cfg.sheet_name}' with {len(col_entities)} columns and {imported_rows} rows.",
                    changed_by_id=user.id,
                    changed_by_username=user.username,
                )
                db.add(t_hist)

                # Record Import History
                import_history = ImportHistory(
                    table_id=table.id,
                    table_name=table.name,
                    file_name=original_filename,
                    file_size_bytes=os.path.getsize(file_path),
                    total_rows=imported_rows,
                    imported_rows=imported_rows,
                    warning_rows=0,
                    error_rows=0,
                    status=ImportStatus.COMPLETED,
                    validation_summary={"total": imported_rows, "imported": imported_rows, "sheet": sheet_cfg.sheet_name},
                    imported_by_id=user.id,
                    imported_by_username=user.username,
                )
                db.add(import_history)

                await audit_service.log_event(
                    db=db,
                    action=AuditAction.IMPORT,
                    username=user.username,
                    user_id=user.id,
                    table_id=table.id,
                    table_name=table.name,
                    ip_address=ip_address,
                    user_agent=user_agent,
                    details={
                        "file_name": original_filename,
                        "sheet_name": sheet_cfg.sheet_name,
                        "imported_rows": imported_rows,
                        "mode": "BATCH_MULTI_SHEET_NEW_TABLE",
                    },
                )

                await db.commit()

                successful_tables.append(
                    BatchImportTableResult(
                        sheet_name=sheet_cfg.sheet_name,
                        table_id=table.id,
                        table_name=table.name,
                        table_display_name=table.display_name,
                        total_columns=len(col_entities),
                        imported_rows=imported_rows,
                        status="SUCCESS",
                    )
                )

            except Exception as e:
                await db.rollback()
                failed_sheets.append(
                    BatchImportTableResult(
                        sheet_name=sheet_cfg.sheet_name,
                        table_name=sheet_cfg.table_name,
                        table_display_name=sheet_cfg.table_display_name,
                        status="FAILED",
                        error_message=str(e),
                    )
                )

        wb.close()

        # Clean up temp file
        try:
            if os.path.exists(file_path):
                os.remove(file_path)
        except Exception:
            pass

        return BatchImportExecuteResponse(
            total_sheets_processed=len(req.sheets),
            successful_tables=successful_tables,
            failed_sheets=failed_sheets,
        )

    @staticmethod
    async def get_import_history(db: AsyncSession, table_id: Optional[UUID] = None) -> List[ImportHistory]:
        query = select(ImportHistory).order_by(ImportHistory.timestamp.desc())
        if table_id:
            query = query.where(ImportHistory.table_id == table_id)
        result = await db.execute(query)
        return list(result.scalars().all())


import_service = ImportService()
