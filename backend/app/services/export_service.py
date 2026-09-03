import csv
import io
from typing import Any, Dict, List, Optional, Tuple
from uuid import UUID
import openpyxl
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.core.encryption import encryption_service
from app.core.exceptions import ForbiddenException, NotFoundException
from app.models.audit_log import AuditAction
from app.models.dynamic_column import ColumnType, DataColumn
from app.models.dynamic_record import DataRecord
from app.models.dynamic_table import DataTable
from app.models.import_export import ExportFormat, ExportHistory
from app.models.rbac import ColumnPermissionLevel
from app.models.user import User
from app.schemas.import_export import ExportRequest
from app.services.audit_service import audit_service
from app.services.rbac_service import rbac_service


class ExportService:
    @staticmethod
    async def export_data(
        db: AsyncSession,
        req: ExportRequest,
        user: User,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
    ) -> Tuple[bytes, str, str]:
        """Export table records to XLSX or CSV honoring caller's Table and Column permissions.
        Returns (file_bytes, media_type, filename)
        """
        # 1. Fetch table and columns
        table_res = await db.execute(
            select(DataTable).options(selectinload(DataTable.columns)).where(DataTable.id == req.table_id)
        )
        table = table_res.scalar_one_or_none()
        if not table:
            raise NotFoundException("Table not found.")

        # 2. Check table export permission
        t_perms = await rbac_service.get_effective_table_permission(db, user, table.id)
        if not t_perms["can_export"]:
            raise ForbiddenException("You do not have permission to export data from this table.")

        col_perms = await rbac_service.get_effective_column_permissions(db, user, table.id)
        user_perms = await rbac_service.get_user_permissions(db, user)
        can_view_secrets = user.is_super_admin or "secret:view" in user_perms

        # 3. Filter permitted columns
        permitted_columns: List[DataColumn] = []
        for col in table.columns:
            if req.selected_column_ids and col.id not in req.selected_column_ids:
                continue
            perm = col_perms.get(col.id, ColumnPermissionLevel.VIEW_EDIT)
            if not user.is_super_admin and perm == ColumnPermissionLevel.DENIED:
                continue
            permitted_columns.append(col)

        if not permitted_columns:
            raise ForbiddenException("No permitted columns available for export.")

        # 4. Fetch records
        records_res = await db.execute(
            select(DataRecord).where(DataRecord.table_id == table.id).order_by(DataRecord.created_at.asc())
        )
        records = records_res.scalars().all()

        headers = [col.display_name for col in permitted_columns]
        rows_data = []

        for rec in records:
            data = rec.data or {}
            row_cells = []
            for col in permitted_columns:
                val = data.get(col.name)
                if col.is_sensitive or col.is_encrypted or col.data_type == ColumnType.PASSWORD:
                    if can_view_secrets and not col_perms.get(col.id) == ColumnPermissionLevel.DENIED:
                        # Decrypt if authorized
                        row_cells.append(encryption_service.decrypt(val, context=col.name))
                    else:
                        # Mask for unauthorized export
                        row_cells.append("••••••••")
                else:
                    if isinstance(val, (dict, list)):
                        row_cells.append(str(val))
                    else:
                        row_cells.append(val if val is not None else "")
            rows_data.append(row_cells)

        # 5. Generate File
        if req.export_format == ExportFormat.XLSX:
            wb = openpyxl.Workbook()
            ws = wb.active
            ws.title = table.name[:31]  # Sheet name max 31 chars
            ws.append(headers)
            for r in rows_data:
                ws.append(r)

            out = io.BytesIO()
            wb.save(out)
            file_bytes = out.getvalue()
            media_type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            filename = f"{table.name}_export.xlsx"
        else:
            # CSV
            out = io.StringIO()
            writer = csv.writer(out)
            writer.writerow(headers)
            for r in rows_data:
                writer.writerow(r)
            file_bytes = out.getvalue().encode("utf-8")
            media_type = "text/csv"
            filename = f"{table.name}_export.csv"

        # 6. Record Export History
        export_history = ExportHistory(
            table_id=table.id,
            table_name=table.name,
            export_format=req.export_format,
            total_rows=len(rows_data),
            exported_columns=[c.name for c in permitted_columns],
            exported_by_id=user.id,
            exported_by_username=user.username,
        )
        db.add(export_history)

        # 7. Audit
        await audit_service.log_event(
            db=db,
            action=AuditAction.EXPORT,
            username=user.username,
            user_id=user.id,
            table_id=table.id,
            table_name=table.name,
            ip_address=ip_address,
            user_agent=user_agent,
            details={
                "format": req.export_format.value,
                "row_count": len(rows_data),
                "columns": [c.name for c in permitted_columns],
            },
        )
        await db.commit()

        return file_bytes, media_type, filename

    @staticmethod
    async def get_export_history(db: AsyncSession, table_id: Optional[UUID] = None) -> List[ExportHistory]:
        query = select(ExportHistory).order_by(ExportHistory.timestamp.desc())
        if table_id:
            query = query.where(ExportHistory.table_id == table_id)
        result = await db.execute(query)
        return list(result.scalars().all())


export_service = ExportService()
