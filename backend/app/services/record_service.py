import json
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import func, select, desc
from sqlalchemy.orm import selectinload

from app.core.encryption import SensitiveEncryptionService, encryption_service
from app.core.exceptions import ForbiddenException, NotFoundException, ValidationException
from app.core.security import verify_password
from app.models.audit_log import AuditAction
from app.models.dynamic_column import ColumnType, DataColumn
from app.models.dynamic_record import DataRecord
from app.models.dynamic_table import DataTable
from app.models.rbac import ColumnPermissionLevel
from app.models.record_version import ChangeType, RecordVersion
from app.models.user import User
from app.schemas.record import RecordCreate, RecordUpdate, RevealSecretResponse
from app.services.audit_service import audit_service
from app.services.column_service import validate_and_convert_value_to_type
from app.services.rbac_service import rbac_service


def sanitize_value_for_audit(val: Any, is_sensitive: bool) -> str:
    """Safely format values for audit logging without ever leaking secrets."""
    if is_sensitive:
        return "[SENSITIVE_REDACTED]"
    if val is None:
        return ""
    if isinstance(val, (dict, list)):
        return json.dumps(val)
    return str(val)


class RecordService:
    @staticmethod
    def _validate_record_data(
        data: Dict[str, Any], columns: List[DataColumn]
    ) -> Tuple[Dict[str, Any], Dict[str, Any]]:
        """Validate and prepare record payload:
        - Checks required columns
        - Validates and coerces types
        - Encrypts sensitive/password fields
        Returns (processed_data, raw_unencrypted_for_diff)
        """
        processed = {}
        raw_values = {}

        col_map = {c.name: c for c in columns}

        for col in columns:
            val = data.get(col.name)
            
            # Check required
            if col.is_required and (val is None or val == ""):
                raise ValidationException(f"Field '{col.display_name}' ({col.name}) is required.")

            if val is not None and val != "":
                # Validate & coerce type
                if not col.is_sensitive:
                    is_valid, converted = validate_and_convert_value_to_type(val, col.data_type)
                    if not is_valid:
                        raise ValidationException(
                            f"Invalid value '{val}' for field '{col.display_name}' of type {col.data_type.value}."
                        )
                    val = converted

                raw_values[col.name] = val

                # Encrypt if sensitive or password
                if col.is_sensitive or col.is_encrypted or col.data_type == ColumnType.PASSWORD:
                    # If incoming value is not already an encrypted envelope, encrypt it
                    if not encryption_service.is_encrypted_envelope(val):
                        processed[col.name] = encryption_service.encrypt(val, context=col.name)
                    else:
                        processed[col.name] = val
                else:
                    processed[col.name] = val
            else:
                # Default value if available
                if col.default_value is not None and col.default_value != "":
                    processed[col.name] = col.default_value
                    raw_values[col.name] = col.default_value
                else:
                    processed[col.name] = None
                    raw_values[col.name] = None

        return processed, raw_values

    @staticmethod
    def _filter_record_data_for_user(
        record_data: Dict[str, Any],
        columns: List[DataColumn],
        col_perms: Dict[UUID, ColumnPermissionLevel],
        is_super_admin: bool,
    ) -> Dict[str, Any]:
        """Apply column-level security filters:
        - Strips DENIED columns
        - Masks Sensitive/Password columns as '••••••••'
        """
        filtered = {}
        for col in columns:
            perm = col_perms.get(col.id, ColumnPermissionLevel.VIEW_EDIT)
            if not is_super_admin and perm == ColumnPermissionLevel.DENIED:
                continue  # Exclude denied column completely

            val = record_data.get(col.name)
            if col.is_sensitive or col.is_encrypted or col.data_type == ColumnType.PASSWORD:
                filtered[col.name] = encryption_service.mask_value(val)
            else:
                filtered[col.name] = val

        return filtered

    @staticmethod
    async def get_records(
        db: AsyncSession,
        table_id: UUID,
        user: User,
        page: int = 1,
        page_size: int = 50,
        search: Optional[str] = None,
        filters: Optional[Dict[str, Any]] = None,
        sort_by: Optional[str] = None,
        sort_desc: bool = False,
        table_password: Optional[str] = None,
    ) -> Tuple[List[Dict[str, Any]], int]:
        # 1. Fetch table and columns
        table_res = await db.execute(
            select(DataTable).options(selectinload(DataTable.columns)).where(DataTable.id == table_id)
        )
        table = table_res.scalar_one_or_none()
        if not table:
            raise NotFoundException("Table not found.")

        # 2. Check table permissions
        t_perms = await rbac_service.get_effective_table_permission(db, user, table_id)
        if not t_perms["can_view_records"]:
            raise ForbiddenException("You do not have permission to view records in this table.")

        # 2b. Check table password lock if configured (even super admin must enter password)
        if table.is_locked and table.password_hash:
            if not table_password or not verify_password(table_password.strip(), table.password_hash):
                raise ForbiddenException("TABLE_LOCKED: Valid table password is required to access records.")

        col_perms = await rbac_service.get_effective_column_permissions(db, user, table_id)

        # 3. Build query (only active, non-deleted records)
        query = select(DataRecord).where(DataRecord.table_id == table_id, DataRecord.is_deleted == False)

        # Total count query
        count_q = select(func.count(DataRecord.id)).where(DataRecord.table_id == table_id, DataRecord.is_deleted == False)
        total_res = await db.execute(count_q)
        total = total_res.scalar_one()

        # Sorting
        if sort_desc:
            query = query.order_by(desc(DataRecord.created_at))
        else:
            query = query.order_by(DataRecord.created_at.asc())

        # Pagination
        query = query.offset((page - 1) * page_size).limit(page_size)

        result = await db.execute(query)
        records = result.scalars().all()

        # Batch lookup creator and updater usernames
        user_ids = {r.created_by_id for r in records if r.created_by_id} | {r.updated_by_id for r in records if r.updated_by_id}
        user_names_map = {}
        if user_ids:
            u_res = await db.execute(select(User.id, User.full_name, User.username).where(User.id.in_(user_ids)))
            for uid, fname, uname in u_res.all():
                user_names_map[uid] = fname or uname

        output_items = []
        for rec in records:
            masked_data = RecordService._filter_record_data_for_user(
                rec.data or {}, table.columns, col_perms, user.is_super_admin
            )
            # In-memory search filtering if search term provided
            if search:
                search_lower = search.lower()
                matches = any(search_lower in str(v).lower() for v in masked_data.values() if v is not None)
                if not matches:
                    continue

            output_items.append({
                "id": rec.id,
                "table_id": rec.table_id,
                "data": masked_data,
                "version": rec.version,
                "created_at": rec.created_at,
                "updated_at": rec.updated_at,
                "created_by_id": rec.created_by_id,
                "updated_by_id": rec.updated_by_id,
                "created_by_name": user_names_map.get(rec.created_by_id) if rec.created_by_id else None,
                "updated_by_name": user_names_map.get(rec.updated_by_id) if rec.updated_by_id else None,
            })

        return output_items, total

    @staticmethod
    async def create_record(
        db: AsyncSession,
        table_id: UUID,
        req: RecordCreate,
        user: User,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
    ) -> DataRecord:
        table_res = await db.execute(
            select(DataTable).options(selectinload(DataTable.columns)).where(DataTable.id == table_id)
        )
        table = table_res.scalar_one_or_none()
        if not table:
            raise NotFoundException("Table not found.")

        t_perms = await rbac_service.get_effective_table_permission(db, user, table_id)
        if not t_perms["can_add_records"]:
            raise ForbiddenException("You do not have permission to add records to this table.")

        processed_data, raw_data = RecordService._validate_record_data(req.data, table.columns)

        record = DataRecord(
            table_id=table_id,
            data=processed_data,
            version=1,
            created_by_id=user.id,
            updated_by_id=user.id,
        )
        db.add(record)
        await db.flush()

        # Create Version 1 snapshot
        version_snapshot = RecordVersion(
            record_id=record.id,
            table_id=table_id,
            version_number=1,
            data_snapshot=processed_data,
            delta=None,
            change_type=ChangeType.CREATE,
            changed_by_id=user.id,
        )
        db.add(version_snapshot)

        # Audit
        await audit_service.log_event(
            db=db,
            action=AuditAction.CREATE,
            username=user.username,
            user_id=user.id,
            table_id=table_id,
            table_name=table.name,
            record_id=record.id,
            ip_address=ip_address,
            user_agent=user_agent,
            details={"version": 1},
        )
        await db.commit()
        await db.refresh(record)
        return record

    @staticmethod
    async def update_record(
        db: AsyncSession,
        record_id: UUID,
        req: RecordUpdate,
        user: User,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
    ) -> DataRecord:
        record_res = await db.execute(
            select(DataRecord)
            .options(selectinload(DataRecord.table).selectinload(DataTable.columns))
            .where(DataRecord.id == record_id)
        )
        record = record_res.scalar_one_or_none()
        if not record:
            raise NotFoundException("Record not found.")

        table = record.table
        t_perms = await rbac_service.get_effective_table_permission(db, user, table.id)
        if not t_perms["can_edit_records"]:
            raise ForbiddenException("You do not have permission to edit records in this table.")

        col_perms = await rbac_service.get_effective_column_permissions(db, user, table.id)

        old_data = dict(record.data or {})
        new_data = dict(old_data)
        delta = {}
        col_map = {c.name: c for c in table.columns}

        # Validate incoming fields
        for field_name, new_val in req.data.items():
            col = col_map.get(field_name)
            if not col:
                continue

            # Check column permission
            perm = col_perms.get(col.id, ColumnPermissionLevel.VIEW_EDIT)
            if not user.is_super_admin and perm != ColumnPermissionLevel.VIEW_EDIT:
                raise ForbiddenException(f"You do not have edit permission for column '{col.display_name}'.")

            # Check if mask was submitted unchanged
            if (col.is_sensitive or col.data_type == ColumnType.PASSWORD) and new_val == "••••••••":
                continue  # Unchanged secret

            # Validate & convert
            if not col.is_sensitive and new_val is not None:
                is_valid, conv_val = validate_and_convert_value_to_type(new_val, col.data_type)
                if not is_valid:
                    raise ValidationException(f"Invalid value for '{col.display_name}'.")
                new_val = conv_val

            old_val = old_data.get(field_name)

            # Encrypt if needed
            if col.is_sensitive or col.is_encrypted or col.data_type == ColumnType.PASSWORD:
                if new_val is not None and not encryption_service.is_encrypted_envelope(new_val):
                    enc_val = encryption_service.encrypt(new_val, context=col.name)
                    new_data[field_name] = enc_val
                else:
                    new_data[field_name] = new_val
                delta[field_name] = {
                    "old": sanitize_value_for_audit(old_val, is_sensitive=True),
                    "new": sanitize_value_for_audit(new_val, is_sensitive=True),
                }
            else:
                new_data[field_name] = new_val
                delta[field_name] = {
                    "old": sanitize_value_for_audit(old_val, is_sensitive=False),
                    "new": sanitize_value_for_audit(new_val, is_sensitive=False),
                }

        record.data = new_data
        record.version += 1
        record.updated_by_id = user.id

        # Add RecordVersion
        version_entry = RecordVersion(
            record_id=record.id,
            table_id=table.id,
            version_number=record.version,
            data_snapshot=new_data,
            delta=delta,
            change_type=ChangeType.UPDATE,
            changed_by_id=user.id,
        )
        db.add(version_entry)

        # Audit
        await audit_service.log_event(
            db=db,
            action=AuditAction.UPDATE,
            username=user.username,
            user_id=user.id,
            table_id=table.id,
            table_name=table.name,
            record_id=record.id,
            ip_address=ip_address,
            user_agent=user_agent,
            details={"version": record.version, "changed_fields": list(delta.keys())},
        )
        await db.commit()
        await db.refresh(record)
        return record

    @staticmethod
    async def delete_record(
        db: AsyncSession,
        record_id: UUID,
        user: User,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
    ) -> None:
        """Soft-deletes record by setting is_deleted = True and logging version."""
        record_res = await db.execute(
            select(DataRecord).options(selectinload(DataRecord.table)).where(DataRecord.id == record_id)
        )
        record = record_res.scalar_one_or_none()
        if not record:
            raise NotFoundException("Record not found.")

        t_perms = await rbac_service.get_effective_table_permission(db, user, record.table_id)
        if not t_perms["can_delete_records"]:
            raise ForbiddenException("You do not have permission to delete records from this table.")

        table_name = record.table.name if record.table else ""
        table_id = record.table_id

        record.is_deleted = True
        record.version += 1
        record.updated_by_id = user.id

        del_version = RecordVersion(
            record_id=record.id,
            table_id=table_id,
            version_number=record.version,
            data_snapshot=record.data,
            delta={"action": "DELETED"},
            change_type=ChangeType.DELETE,
            changed_by_id=user.id,
        )
        db.add(del_version)

        await audit_service.log_event(
            db=db,
            action=AuditAction.DELETE,
            username=user.username,
            user_id=user.id,
            table_id=table_id,
            table_name=table_name,
            record_id=record_id,
            ip_address=ip_address,
            user_agent=user_agent,
        )
        await db.commit()

    @staticmethod
    async def get_deleted_records(
        db: AsyncSession,
        table_id: UUID,
        user: User,
    ) -> List[Dict[str, Any]]:
        """Returns all soft-deleted records for a specific table."""
        table_res = await db.execute(
            select(DataTable).options(selectinload(DataTable.columns)).where(DataTable.id == table_id)
        )
        table = table_res.scalar_one_or_none()
        if not table:
            raise NotFoundException("Table not found.")

        t_perms = await rbac_service.get_effective_table_permission(db, user, table_id)
        if not t_perms["can_view_records"]:
            raise ForbiddenException("Permission denied.")

        q = (
            select(DataRecord)
            .where(DataRecord.table_id == table_id, DataRecord.is_deleted == True)
            .order_by(desc(DataRecord.updated_at))
        )
        res = await db.execute(q)
        records = res.scalars().all()

        user_ids = {r.updated_by_id for r in records if r.updated_by_id} | {r.created_by_id for r in records if r.created_by_id}
        user_names = {}
        if user_ids:
            u_res = await db.execute(select(User.id, User.full_name, User.username).where(User.id.in_(user_ids)))
            for uid, fname, uname in u_res.all():
                user_names[uid] = fname or uname

        out = []
        for r in records:
            out.append({
                "id": r.id,
                "record_id": r.id,
                "table_id": r.table_id,
                "table_name": table.name,
                "table_display_name": table.display_name,
                "version_number": r.version,
                "data_snapshot": r.data,
                "deleted_by_id": r.updated_by_id,
                "deleted_by_name": user_names.get(r.updated_by_id) or user_names.get(r.created_by_id) or "Admin",
                "deleted_at": r.updated_at,
            })
        return out

    @staticmethod
    async def get_all_deleted_records(
        db: AsyncSession,
        user: User,
    ) -> List[Dict[str, Any]]:
        """Returns all soft-deleted records across all tables."""
        q = (
            select(DataRecord, DataTable)
            .join(DataTable, DataTable.id == DataRecord.table_id)
            .where(DataRecord.is_deleted == True)
            .order_by(desc(DataRecord.updated_at))
            .limit(200)
        )
        res = await db.execute(q)
        rows = res.all()

        user_ids = {r[0].updated_by_id for r in rows if r[0].updated_by_id} | {r[0].created_by_id for r in rows if r[0].created_by_id}
        user_names = {}
        if user_ids:
            u_res = await db.execute(select(User.id, User.full_name, User.username).where(User.id.in_(user_ids)))
            for uid, fname, uname in u_res.all():
                user_names[uid] = fname or uname

        out = []
        for rec, tbl in rows:
            out.append({
                "id": rec.id,
                "record_id": rec.id,
                "table_id": rec.table_id,
                "table_name": tbl.name,
                "table_display_name": tbl.display_name,
                "version_number": rec.version,
                "data_snapshot": rec.data,
                "deleted_by_id": rec.updated_by_id,
                "deleted_by_name": user_names.get(rec.updated_by_id) or user_names.get(rec.created_by_id) or "Admin",
                "deleted_at": rec.updated_at,
            })
        return out

    @staticmethod
    async def restore_deleted_record(
        db: AsyncSession,
        record_id: UUID,
        user: User,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
    ) -> DataRecord:
        """Restores a soft-deleted record back to active state."""
        record_res = await db.execute(
            select(DataRecord).options(selectinload(DataRecord.table)).where(DataRecord.id == record_id)
        )
        record = record_res.scalar_one_or_none()
        if not record:
            raise NotFoundException("Record not found.")

        t_perms = await rbac_service.get_effective_table_permission(db, user, record.table_id)
        if not t_perms["can_edit_records"]:
            raise ForbiddenException("You do not have permission to restore records in this table.")

        record.is_deleted = False
        record.version += 1
        record.updated_by_id = user.id

        new_version = RecordVersion(
            record_id=record.id,
            table_id=record.table_id,
            version_number=record.version,
            data_snapshot=record.data,
            delta={"action": "RESTORE_FROM_DELETED"},
            change_type=ChangeType.RESTORE,
            changed_by_id=user.id,
        )
        db.add(new_version)

        await audit_service.log_event(
            db=db,
            action=AuditAction.UPDATE,
            username=user.username,
            user_id=user.id,
            table_id=record.table_id,
            table_name=record.table.name if record.table else "",
            record_id=record.id,
            ip_address=ip_address,
            user_agent=user_agent,
            details={"action": "RESTORE_DELETED_RECORD", "version": record.version},
        )
        await db.commit()
        await db.refresh(record)
        return record

    @staticmethod
    async def permanent_delete_record(
        db: AsyncSession,
        record_id: UUID,
        user: User,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
    ) -> None:
        """Permanently hard-deletes a record from database."""
        record_res = await db.execute(
            select(DataRecord).options(selectinload(DataRecord.table)).where(DataRecord.id == record_id)
        )
        record = record_res.scalar_one_or_none()
        if not record:
            raise NotFoundException("Record not found.")

        t_perms = await rbac_service.get_effective_table_permission(db, user, record.table_id)
        if not t_perms["can_delete_records"]:
            raise ForbiddenException("Permission denied.")

        table_name = record.table.name if record.table else ""
        table_id = record.table_id

        await db.delete(record)
        await audit_service.log_event(
            db=db,
            action=AuditAction.DELETE,
            username=user.username,
            user_id=user.id,
            table_id=table_id,
            table_name=table_name,
            record_id=record_id,
            ip_address=ip_address,
            user_agent=user_agent,
            details={"action": "PERMANENT_DELETE_RECORD"},
        )
        await db.commit()

    @staticmethod
    async def get_record_versions(
        db: AsyncSession, record_id: UUID, user: User
    ) -> List[RecordVersion]:
        record_res = await db.execute(
            select(DataRecord).options(selectinload(DataRecord.table)).where(DataRecord.id == record_id)
        )
        record = record_res.scalar_one_or_none()
        if not record:
            raise NotFoundException("Record not found.")

        t_perms = await rbac_service.get_effective_table_permission(db, user, record.table_id)
        if not t_perms["can_view_records"]:
            raise ForbiddenException("Permission denied.")

        result = await db.execute(
            select(RecordVersion)
            .where(RecordVersion.record_id == record_id)
            .order_by(desc(RecordVersion.version_number))
        )
        return list(result.scalars().all())

    @staticmethod
    async def restore_record_version(
        db: AsyncSession,
        record_id: UUID,
        version_number: int,
        user: User,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
    ) -> DataRecord:
        record_res = await db.execute(
            select(DataRecord).options(selectinload(DataRecord.table)).where(DataRecord.id == record_id)
        )
        record = record_res.scalar_one_or_none()
        if not record:
            raise NotFoundException("Record not found.")

        t_perms = await rbac_service.get_effective_table_permission(db, user, record.table_id)
        if not t_perms["can_edit_records"]:
            raise ForbiddenException("You do not have permission to edit records in this table.")

        ver_res = await db.execute(
            select(RecordVersion).where(
                RecordVersion.record_id == record_id, RecordVersion.version_number == version_number
            )
        )
        target_version = ver_res.scalar_one_or_none()
        if not target_version:
            raise NotFoundException(f"Version {version_number} not found.")

        record.data = target_version.data_snapshot
        record.version += 1
        record.updated_by_id = user.id

        new_version = RecordVersion(
            record_id=record.id,
            table_id=record.table_id,
            version_number=record.version,
            data_snapshot=record.data,
            delta={"restored_from_version": version_number},
            change_type=ChangeType.RESTORE,
            changed_by_id=user.id,
        )
        db.add(new_version)

        await audit_service.log_event(
            db=db,
            action=AuditAction.UPDATE,
            username=user.username,
            user_id=user.id,
            table_id=record.table_id,
            table_name=record.table.name if record.table else None,
            record_id=record.id,
            ip_address=ip_address,
            user_agent=user_agent,
            details={"action": "RESTORE_VERSION", "from_version": version_number, "new_version": record.version},
        )
        await db.commit()
        await db.refresh(record)
        return record

    @staticmethod
    async def reveal_secret_field(
        db: AsyncSession,
        table_id: UUID,
        record_id: UUID,
        column_id: UUID,
        user: User,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
    ) -> RevealSecretResponse:
        """Decrypt sensitive/password field with strict authorization and mandatory PASSWORD_VIEWED audit."""
        # 1. Fetch record & table
        record_res = await db.execute(
            select(DataRecord)
            .options(selectinload(DataRecord.table).selectinload(DataTable.columns))
            .where(DataRecord.id == record_id, DataRecord.table_id == table_id)
        )
        record = record_res.scalar_one_or_none()
        if not record:
            raise NotFoundException("Record not found.")

        col = next((c for c in record.table.columns if c.id == column_id), None)
        if not col:
            raise NotFoundException("Column not found in this table.")

        # 2. Check user permissions
        perms = await rbac_service.get_user_permissions(db, user)
        if not user.is_super_admin and "secret:view" not in perms:
            raise ForbiddenException("You do not have permission to view sensitive secrets.")

        col_perms = await rbac_service.get_effective_column_permissions(db, user, table_id)
        if not user.is_super_admin and col_perms.get(column_id) == ColumnPermissionLevel.DENIED:
            raise ForbiddenException(f"Access to column '{col.display_name}' is denied.")

        encrypted_payload = (record.data or {}).get(col.name)
        plaintext = encryption_service.decrypt(encrypted_payload, context=col.name)

        # 3. Mandatory PASSWORD_VIEWED audit logging
        await audit_service.log_event(
            db=db,
            action=AuditAction.PASSWORD_VIEWED,
            username=user.username,
            user_id=user.id,
            table_id=table_id,
            table_name=record.table.name,
            record_id=record.id,
            field_name=col.name,
            ip_address=ip_address,
            user_agent=user_agent,
            details={"column_id": str(col.id), "column_name": col.name},
        )
        await db.commit()

        return RevealSecretResponse(
            column_id=col.id,
            column_name=col.name,
            plaintext_value=plaintext,
            expires_in_seconds=30,
        )


record_service = RecordService()
