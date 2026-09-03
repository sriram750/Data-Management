from datetime import datetime, timezone, timedelta
from typing import List
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import func, select, desc

from app.models.audit_log import AuditAction, AuditLog
from app.models.dynamic_record import DataRecord
from app.models.dynamic_table import DataTable
from app.models.import_export import ExportHistory, ImportHistory
from app.models.user import User, UserSession, UserStatus
from app.schemas.dashboard import DashboardMetricsResponse, RecentActivityItem


class DashboardService:
    @staticmethod
    async def get_dashboard_metrics(db: AsyncSession) -> DashboardMetricsResponse:
        now = datetime.now(timezone.utc)
        today_start = datetime(now.year, now.month, now.day, tzinfo=timezone.utc)
        active_session_threshold = now - timedelta(minutes=15)

        # 1. Total Tables
        tables_res = await db.execute(select(func.count(DataTable.id)).where(DataTable.is_active == True))
        total_tables = tables_res.scalar_one() or 0

        # 2. Total Records
        records_res = await db.execute(select(func.count(DataRecord.id)))
        total_records = records_res.scalar_one() or 0

        # 3. Total Users
        users_res = await db.execute(select(func.count(User.id)))
        total_users = users_res.scalar_one() or 0

        # 4. Active Users (users with recent session activity)
        active_users_res = await db.execute(
            select(func.count(func.distinct(UserSession.user_id))).where(
                UserSession.is_revoked == False,
                UserSession.expires_at > now,
                UserSession.last_activity_at >= active_session_threshold,
            )
        )
        active_users = active_users_res.scalar_one() or 0

        # 5. Changes Today (Create/Update/Delete/Table/Column changes)
        changes_res = await db.execute(
            select(func.count(AuditLog.id)).where(
                AuditLog.timestamp >= today_start,
                AuditLog.action.in_([
                    AuditAction.CREATE,
                    AuditAction.UPDATE,
                    AuditAction.DELETE,
                    AuditAction.TABLE_CREATED,
                    AuditAction.TABLE_UPDATED,
                    AuditAction.TABLE_DELETED,
                    AuditAction.COLUMN_CREATED,
                    AuditAction.COLUMN_UPDATED,
                    AuditAction.COLUMN_RENAMED,
                    AuditAction.COLUMN_DELETED,
                ])
            )
        )
        changes_today = changes_res.scalar_one() or 0

        # 6. Imports Today
        imports_res = await db.execute(
            select(func.count(ImportHistory.id)).where(ImportHistory.timestamp >= today_start)
        )
        imports_today = imports_res.scalar_one() or 0

        # 7. Exports Today
        exports_res = await db.execute(
            select(func.count(ExportHistory.id)).where(ExportHistory.timestamp >= today_start)
        )
        exports_today = exports_res.scalar_one() or 0

        # 8. Recent Activity (last 15 events)
        recent_logs_res = await db.execute(
            select(AuditLog).order_by(desc(AuditLog.timestamp)).limit(15)
        )
        recent_logs = recent_logs_res.scalars().all()

        recent_activities: List[RecentActivityItem] = []
        for log in recent_logs:
            desc_text = f"{log.action.value}"
            if log.table_name:
                desc_text += f" on {log.table_name}"
            if log.field_name:
                desc_text += f" ({log.field_name})"

            recent_activities.append(
                RecentActivityItem(
                    id=log.id,
                    timestamp=log.timestamp,
                    username=log.username,
                    action=log.action.value,
                    description=desc_text,
                    table_name=log.table_name,
                    record_id=log.record_id,
                )
            )

        return DashboardMetricsResponse(
            total_tables=total_tables,
            total_records=total_records,
            total_users=total_users,
            active_users=active_users,
            changes_today=changes_today,
            imports_today=imports_today,
            exports_today=exports_today,
            recent_activities=recent_activities,
        )


dashboard_service = DashboardService()
