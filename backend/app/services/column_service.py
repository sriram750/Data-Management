import re
from datetime import datetime
from typing import Any, Dict, List, Optional, Tuple
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from app.core.exceptions import ConflictException, NotFoundException, ValidationException
from app.models.audit_log import AuditAction
from app.models.dynamic_column import ColumnType, DataColumn
from app.models.dynamic_record import DataRecord
from app.models.dynamic_table import DataTable
from app.models.table_history import TableHistory
from app.models.user import User
from app.schemas.column import ColumnCreate, ColumnReorderItem, ColumnTypeCheckResponse, ColumnUpdate
from app.services.audit_service import audit_service


def slugify(text: str) -> str:
    slug = re.sub(r"[^\w\s-]", "", text).strip().lower()
    slug = re.sub(r"[-\s]+", "_", slug)
    return slug or "col"


def validate_and_convert_value_to_type(val: Any, target_type: ColumnType) -> Tuple[bool, Any]:
    """Test if a value can safely convert to target_type. Returns (is_valid, converted_val)."""
    if val is None or val == "":
        return True, None

    val_str = str(val).strip()

    # Excel error constants and empty representations
    if val_str.upper() in ("#N/A", "#VALUE!", "#REF!", "#NULL!", "#DIV/0!", "#NUM!", "#NAME?", "N/A", "NA", "NULL", "NONE"):
        if target_type in (ColumnType.NUMBER, ColumnType.DECIMAL, ColumnType.CURRENCY, ColumnType.DATE, ColumnType.DATETIME, ColumnType.BOOLEAN):
            return True, None
        elif target_type in (ColumnType.MIXED, ColumnType.ALPHANUMERIC, ColumnType.TEXT, ColumnType.LONG_TEXT):
            return True, val_str

    try:
        if target_type == ColumnType.NUMBER:
            if val_str == "-":
                return True, None
            num = int(float(val_str))
            return True, num
        elif target_type in (ColumnType.DECIMAL, ColumnType.CURRENCY):
            if val_str == "-":
                return True, None
            # Clean currency symbols
            clean_str = re.sub(r"[^\d.-]", "", val_str)
            if not clean_str or clean_str == "-":
                return True, None
            dec = float(clean_str)
            return True, dec
        elif target_type == ColumnType.BOOLEAN:
            if val_str.lower() in ("true", "1", "yes", "y", "t"):
                return True, True
            elif val_str.lower() in ("false", "0", "no", "n", "f"):
                return True, False
            return False, None
        elif target_type == ColumnType.DATE:
            # Try parsing ISO or common date formats
            for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%m/%d/%Y", "%d-%m-%Y", "%Y/%m/%d"):
                try:
                    dt = datetime.strptime(val_str[:10], fmt)
                    return True, dt.strftime("%Y-%m-%d")
                except ValueError:
                    continue
            return False, None
        elif target_type == ColumnType.DATETIME:
            try:
                dt = datetime.fromisoformat(val_str.replace("Z", "+00:00"))
                return True, dt.isoformat()
            except Exception:
                return False, None
        elif target_type == ColumnType.EMAIL:
            if re.match(r"^[^@\s]+@[^@\s]+\.[^@\s]+$", val_str):
                return True, val_str.lower()
            return False, None
        elif target_type == ColumnType.IP_ADDRESS:
            parts = val_str.split(".")
            if len(parts) == 4 and all(p.isdigit() and 0 <= int(p) <= 255 for p in parts):
                return True, val_str
            return False, None
        elif target_type == ColumnType.URL:
            if re.match(r"^(http|https)://[^\s/$.?#].[^\s]*$", val_str, re.IGNORECASE):
                return True, val_str
            return False, None
        elif target_type in (
            ColumnType.TEXT,
            ColumnType.LONG_TEXT,
            ColumnType.DROPDOWN,
            ColumnType.PASSWORD,
            ColumnType.MIXED,
            ColumnType.ALPHANUMERIC,
        ):
            return True, val_str
        elif target_type == ColumnType.MULTI_SELECT:
            if isinstance(val, list):
                return True, val
            return True, [v.strip() for v in val_str.split(",") if v.strip()]
        else:
            return True, val
    except Exception:
        return False, None


class ColumnService:
    @staticmethod
    async def add_column(
        db: AsyncSession,
        table_id: UUID,
        req: ColumnCreate,
        user: User,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
    ) -> DataColumn:
        table_res = await db.execute(select(DataTable).where(DataTable.id == table_id))
        table = table_res.scalar_one_or_none()
        if not table:
            raise NotFoundException("Table not found.")

        col_name = slugify(req.name)
        existing = await db.execute(
            select(DataColumn).where(DataColumn.table_id == table_id, DataColumn.name == col_name)
        )
        if existing.scalar_one_or_none():
            raise ConflictException(f"A column named '{col_name}' already exists in this table.")

        # Determine display order if not specified
        order = req.display_order
        if order == 0:
            max_order_res = await db.execute(
                select(func.coalesce(func.max(DataColumn.display_order), 0)).where(DataColumn.table_id == table_id)
            )
            order = max_order_res.scalar_one() + 1

        column = DataColumn(
            table_id=table_id,
            name=col_name,
            display_name=req.display_name.strip(),
            data_type=req.data_type,
            is_required=req.is_required,
            is_sensitive=req.is_sensitive,
            is_encrypted=req.is_encrypted or req.is_sensitive,
            is_hidden=req.is_hidden,
            default_value=req.default_value,
            validation_rules=req.validation_rules,
            display_order=order,
        )
        db.add(column)

        # Log table history
        history = TableHistory(
            table_id=table_id,
            action="COLUMN_ADDED",
            details={
                "column_name": column.name,
                "display_name": column.display_name,
                "data_type": column.data_type.value,
                "is_sensitive": column.is_sensitive,
            },
            changed_by_id=user.id,
            changed_by_username=user.username,
        )
        db.add(history)

        # Audit
        await audit_service.log_event(
            db=db,
            action=AuditAction.COLUMN_CREATED,
            username=user.username,
            user_id=user.id,
            table_id=table_id,
            table_name=table.name,
            field_name=column.name,
            ip_address=ip_address,
            user_agent=user_agent,
            details={"column_id": str(column.id), "type": column.data_type.value},
        )
        await db.commit()
        await db.refresh(column)
        return column

    @staticmethod
    async def update_column(
        db: AsyncSession,
        column_id: UUID,
        req: ColumnUpdate,
        user: User,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
    ) -> DataColumn:
        result = await db.execute(
            select(DataColumn).options(selectinload(DataColumn.table)).where(DataColumn.id == column_id)
        )
        column = result.scalar_one_or_none()
        if not column:
            raise NotFoundException("Column not found.")

        old_type = column.data_type
        old_name = column.name

        # If data type changed, apply conversions to all records
        if req.data_type is not None and req.data_type != column.data_type:
            # Check and convert existing data
            records_res = await db.execute(
                select(DataRecord).where(DataRecord.table_id == column.table_id)
            )
            records = records_res.scalars().all()
            for rec in records:
                cur_data = dict(rec.data) if rec.data else {}
                if column.name in cur_data:
                    raw_val = cur_data[column.name]
                    is_valid, conv_val = validate_and_convert_value_to_type(raw_val, req.data_type)
                    cur_data[column.name] = conv_val
                    rec.data = cur_data

            column.data_type = req.data_type

            # Table history
            history = TableHistory(
                table_id=column.table_id,
                action="COLUMN_TYPE_CHANGED",
                details={
                    "column_name": column.name,
                    "old_type": old_type.value,
                    "new_type": req.data_type.value,
                },
                changed_by_id=user.id,
                changed_by_username=user.username,
            )
            db.add(history)

        if req.display_name is not None:
            column.display_name = req.display_name.strip()
        if req.is_required is not None:
            column.is_required = req.is_required
        if req.is_sensitive is not None:
            column.is_sensitive = req.is_sensitive
            if req.is_sensitive:
                column.is_encrypted = True
        if req.is_encrypted is not None:
            column.is_encrypted = req.is_encrypted
        if req.is_hidden is not None:
            column.is_hidden = req.is_hidden
        if req.default_value is not None:
            column.default_value = req.default_value
        if req.validation_rules is not None:
            column.validation_rules = req.validation_rules
        if req.display_order is not None:
            column.display_order = req.display_order

        await audit_service.log_event(
            db=db,
            action=AuditAction.COLUMN_UPDATED,
            username=user.username,
            user_id=user.id,
            table_id=column.table_id,
            table_name=column.table.name if column.table else None,
            field_name=column.name,
            ip_address=ip_address,
            user_agent=user_agent,
            details=req.model_dump(exclude_unset=True),
        )
        await db.commit()
        await db.refresh(column)
        return column

    @staticmethod
    async def check_type_compatibility(
        db: AsyncSession, column_id: UUID, target_type: ColumnType
    ) -> ColumnTypeCheckResponse:
        """Analyze existing records for type conversion safety before user commits."""
        result = await db.execute(select(DataColumn).where(DataColumn.id == column_id))
        column = result.scalar_one_or_none()
        if not column:
            raise NotFoundException("Column not found.")

        records_res = await db.execute(
            select(DataRecord).where(DataRecord.table_id == column.table_id)
        )
        records = records_res.scalars().all()

        total = len(records)
        compatible = 0
        incompatible = 0
        samples = []

        for rec in records:
            data = rec.data or {}
            val = data.get(column.name)
            is_valid, _ = validate_and_convert_value_to_type(val, target_type)
            if is_valid:
                compatible += 1
            else:
                incompatible += 1
                if len(samples) < 5:
                    samples.append(val)

        return ColumnTypeCheckResponse(
            column_id=column.id,
            current_type=column.data_type,
            target_type=target_type,
            total_records=total,
            compatible_count=compatible,
            incompatible_count=incompatible,
            is_safe=(incompatible == 0),
            sample_incompatible_values=samples,
        )

    @staticmethod
    async def delete_column(
        db: AsyncSession,
        column_id: UUID,
        user: User,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
    ) -> None:
        result = await db.execute(
            select(DataColumn).options(selectinload(DataColumn.table)).where(DataColumn.id == column_id)
        )
        column = result.scalar_one_or_none()
        if not column:
            raise NotFoundException("Column not found.")

        col_name = column.name
        table_id = column.table_id
        table_name = column.table.name if column.table else ""

        # Clean up column key from all record JSON payloads in table
        records_res = await db.execute(select(DataRecord).where(DataRecord.table_id == table_id))
        records = records_res.scalars().all()
        for rec in records:
            if rec.data and col_name in rec.data:
                updated_data = dict(rec.data)
                del updated_data[col_name]
                rec.data = updated_data

        await db.delete(column)

        # Log table history
        history = TableHistory(
            table_id=table_id,
            action="COLUMN_DELETED",
            details={"column_name": col_name},
            changed_by_id=user.id,
            changed_by_username=user.username,
        )
        db.add(history)

        # Audit
        await audit_service.log_event(
            db=db,
            action=AuditAction.COLUMN_DELETED,
            username=user.username,
            user_id=user.id,
            table_id=table_id,
            table_name=table_name,
            field_name=col_name,
            ip_address=ip_address,
            user_agent=user_agent,
        )
        await db.commit()

    @staticmethod
    async def reorder_columns(
        db: AsyncSession,
        table_id: UUID,
        reorders: List[ColumnReorderItem],
        user: User,
    ) -> None:
        for item in reorders:
            col_res = await db.execute(
                select(DataColumn).where(DataColumn.id == item.id, DataColumn.table_id == table_id)
            )
            col = col_res.scalar_one_or_none()
            if col:
                col.display_order = item.display_order
        await db.commit()


column_service = ColumnService()
