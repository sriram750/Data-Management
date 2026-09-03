import re
from typing import List, Optional, Tuple
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import func, select, desc
from sqlalchemy.orm import selectinload

from app.core.exceptions import ConflictException, NotFoundException, ValidationException
from app.models.audit_log import AuditAction
from app.models.dynamic_column import DataColumn
from app.models.dynamic_record import DataRecord
from app.models.dynamic_table import DataTable
from app.models.table_history import TableHistory
from app.models.user import User
from app.schemas.table import TableCreate, TableResponse, TableUpdate
from app.services.audit_service import audit_service


def slugify(text: str) -> str:
    """Sanitize and format string to a safe unique database identifier."""
    slug = re.sub(r"[^\w\s-]", "", text).strip().lower()
    slug = re.sub(r"[-\s]+", "_", slug)
    return slug or "table"


class TableService:
    @staticmethod
    async def create_table(
        db: AsyncSession,
        req: TableCreate,
        user: User,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
    ) -> DataTable:
        # Check name uniqueness
        clean_name = slugify(req.name)
        existing = await db.execute(select(DataTable).where(DataTable.name == clean_name))
        if existing.scalar_one_or_none():
            raise ConflictException(f"A table with the identifier '{clean_name}' already exists.")

        table = DataTable(
            name=clean_name,
            display_name=req.display_name.strip(),
            description=req.description.strip() if req.description else None,
            is_active=True,
            is_favorite=False,
            created_by_id=user.id,
            updated_by_id=user.id,
        )
        db.add(table)
        await db.flush()

        # Add initial columns
        created_columns = []
        for idx, col_in in enumerate(req.columns):
            col_name = slugify(col_in.name)
            col = DataColumn(
                table_id=table.id,
                name=col_name,
                display_name=col_in.display_name.strip(),
                data_type=col_in.data_type,
                is_required=col_in.is_required,
                is_sensitive=col_in.is_sensitive,
                is_encrypted=col_in.is_encrypted or col_in.is_sensitive,  # sensitive columns automatically encrypted
                is_hidden=col_in.is_hidden,
                default_value=col_in.default_value,
                validation_rules=col_in.validation_rules,
                display_order=col_in.display_order if col_in.display_order else idx,
            )
            db.add(col)
            created_columns.append(col)

        # Log table history
        history = TableHistory(
            table_id=table.id,
            action="TABLE_CREATED",
            details={
                "table_name": table.name,
                "display_name": table.display_name,
                "column_count": len(req.columns),
                "columns": [c.name for c in created_columns],
            },
            changed_by_id=user.id,
            changed_by_username=user.username,
        )
        db.add(history)

        # Audit log
        await audit_service.log_event(
            db=db,
            action=AuditAction.TABLE_CREATED,
            username=user.username,
            user_id=user.id,
            table_id=table.id,
            table_name=table.name,
            ip_address=ip_address,
            user_agent=user_agent,
            details={"display_name": table.display_name, "column_count": len(req.columns)},
        )
        await db.commit()
        await db.refresh(table)
        return table

    @staticmethod
    async def get_tables(
        db: AsyncSession,
        search: Optional[str] = None,
        only_favorites: bool = False,
        include_inactive: bool = False,
    ) -> List[Tuple[DataTable, int]]:
        query = (
            select(
                DataTable,
                func.count(DataRecord.id).label("record_count")
            )
            .options(selectinload(DataTable.columns))
            .outerjoin(DataRecord, DataRecord.table_id == DataTable.id)
            .group_by(DataTable.id)
            .order_by(DataTable.is_favorite.desc(), DataTable.created_at.desc())
        )

        if not include_inactive:
            query = query.where(DataTable.is_active == True)

        if search:
            query = query.where(
                (DataTable.display_name.ilike(f"%{search}%")) | (DataTable.name.ilike(f"%{search}%"))
            )
        if only_favorites:
            query = query.where(DataTable.is_favorite == True)

        result = await db.execute(query)
        rows = result.all()
        return [(row[0], row[1]) for row in rows]

    @staticmethod
    async def get_trash_tables(
        db: AsyncSession,
        search: Optional[str] = None,
    ) -> List[Tuple[DataTable, int]]:
        """Returns soft-deleted tables (is_active == False)."""
        query = (
            select(
                DataTable,
                func.count(DataRecord.id).label("record_count")
            )
            .options(selectinload(DataTable.columns))
            .outerjoin(DataRecord, DataRecord.table_id == DataTable.id)
            .where(DataTable.is_active == False)
            .group_by(DataTable.id)
            .order_by(DataTable.updated_at.desc())
        )

        if search:
            query = query.where(
                (DataTable.display_name.ilike(f"%{search}%")) | (DataTable.name.ilike(f"%{search}%"))
            )

        result = await db.execute(query)
        rows = result.all()
        return [(row[0], row[1]) for row in rows]

    @staticmethod
    async def get_table_by_id(db: AsyncSession, table_id: UUID) -> DataTable:
        result = await db.execute(
            select(DataTable)
            .options(selectinload(DataTable.columns))
            .where(DataTable.id == table_id)
        )
        table = result.scalar_one_or_none()
        if not table:
            raise NotFoundException("Table not found.")
        return table

    @staticmethod
    async def update_table(
        db: AsyncSession,
        table_id: UUID,
        req: TableUpdate,
        user: User,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
    ) -> DataTable:
        table = await TableService.get_table_by_id(db, table_id)
        old_display = table.display_name
        old_desc = table.description

        if req.display_name is not None:
            table.display_name = req.display_name.strip()
        if req.description is not None:
            table.description = req.description.strip()
        if req.is_active is not None:
            table.is_active = req.is_active
        if req.is_favorite is not None:
            table.is_favorite = req.is_favorite

        table.updated_by_id = user.id

        history = TableHistory(
            table_id=table.id,
            action="TABLE_UPDATED",
            details={
                "old_display_name": old_display,
                "new_display_name": table.display_name,
                "old_description": old_desc,
                "new_description": table.description,
            },
            changed_by_id=user.id,
            changed_by_username=user.username,
        )
        db.add(history)

        await audit_service.log_event(
            db=db,
            action=AuditAction.TABLE_UPDATED,
            username=user.username,
            user_id=user.id,
            table_id=table.id,
            table_name=table.name,
            ip_address=ip_address,
            user_agent=user_agent,
            details={"changes": req.model_dump(exclude_unset=True)},
        )
        await db.commit()
        await db.refresh(table)
        return table

    @staticmethod
    async def delete_table(
        db: AsyncSession,
        table_id: UUID,
        user: User,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
    ) -> None:
        """Soft deletes table by setting is_active = False."""
        table = await TableService.get_table_by_id(db, table_id)
        table_name = table.name
        table.is_active = False
        table.updated_by_id = user.id

        history = TableHistory(
            table_id=table.id,
            action="TABLE_DELETED",
            details={"display_name": table.display_name, "status": "MOVED_TO_TRASH"},
            changed_by_id=user.id,
            changed_by_username=user.username,
        )
        db.add(history)

        await audit_service.log_event(
            db=db,
            action=AuditAction.TABLE_DELETED,
            username=user.username,
            user_id=user.id,
            table_id=table_id,
            table_name=table_name,
            ip_address=ip_address,
            user_agent=user_agent,
        )
        await db.commit()

    @staticmethod
    async def restore_table(
        db: AsyncSession,
        table_id: UUID,
        user: User,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
    ) -> DataTable:
        """Restores a soft-deleted table by setting is_active = True."""
        table = await TableService.get_table_by_id(db, table_id)
        table.is_active = True
        table.updated_by_id = user.id

        history = TableHistory(
            table_id=table.id,
            action="TABLE_RESTORED",
            details={"display_name": table.display_name, "status": "RESTORED"},
            changed_by_id=user.id,
            changed_by_username=user.username,
        )
        db.add(history)

        await audit_service.log_event(
            db=db,
            action=AuditAction.TABLE_UPDATED,
            username=user.username,
            user_id=user.id,
            table_id=table.id,
            table_name=table.name,
            ip_address=ip_address,
            user_agent=user_agent,
            details={"action": "RESTORE_TABLE"},
        )
        await db.commit()
        await db.refresh(table)
        return table

    @staticmethod
    async def permanent_delete_table(
        db: AsyncSession,
        table_id: UUID,
        user: User,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
    ) -> None:
        """Permanently deletes a table and all its data."""
        table = await TableService.get_table_by_id(db, table_id)
        table_name = table.name

        await db.delete(table)

        await audit_service.log_event(
            db=db,
            action=AuditAction.TABLE_DELETED,
            username=user.username,
            user_id=user.id,
            table_id=table_id,
            table_name=table_name,
            ip_address=ip_address,
            user_agent=user_agent,
            details={"action": "PERMANENT_DELETE"},
        )
        await db.commit()

    @staticmethod
    async def get_table_history(db: AsyncSession, table_id: UUID) -> List[TableHistory]:
        result = await db.execute(
            select(TableHistory)
            .where(TableHistory.table_id == table_id)
            .order_by(desc(TableHistory.timestamp))
        )
        return list(result.scalars().all())


table_service = TableService()
