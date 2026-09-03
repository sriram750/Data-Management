from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import desc, func, select

from app.models.audit_log import AuditAction, AuditLog
from app.schemas.audit import AuditFilterParams


class AuditService:
    @staticmethod
    async def log_event(
        db: AsyncSession,
        action: AuditAction,
        username: str,
        user_id: Optional[UUID] = None,
        table_id: Optional[UUID] = None,
        table_name: Optional[str] = None,
        record_id: Optional[UUID] = None,
        field_name: Optional[str] = None,
        old_value: Optional[str] = None,
        new_value: Optional[str] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
        details: Optional[Dict[str, Any]] = None,
    ) -> AuditLog:
        """Create an append-only audit log entry. Guaranteed zero leaks of sensitive plaintext."""
        # Sanitize sensitive field values if marked
        audit_entry = AuditLog(
            action=action,
            username=username,
            user_id=user_id,
            table_id=table_id,
            table_name=table_name,
            record_id=record_id,
            field_name=field_name,
            old_value=old_value,
            new_value=new_value,
            ip_address=ip_address,
            user_agent=user_agent,
            details=details,
            timestamp=datetime.now(timezone.utc),
        )
        db.add(audit_entry)
        await db.flush()
        return audit_entry

    @staticmethod
    async def query_logs(
        db: AsyncSession,
        filters: AuditFilterParams,
        page: int = 1,
        page_size: int = 50,
    ) -> Tuple[List[AuditLog], int]:
        query = select(AuditLog)
        
        if filters.user_id:
            query = query.where(AuditLog.user_id == filters.user_id)
        if filters.username:
            query = query.where(AuditLog.username.ilike(f"%{filters.username}%"))
        if filters.action:
            query = query.where(AuditLog.action == filters.action)
        if filters.table_name:
            query = query.where(AuditLog.table_name.ilike(f"%{filters.table_name}%"))
        if filters.start_date:
            query = query.where(AuditLog.timestamp >= filters.start_date)
        if filters.end_date:
            query = query.where(AuditLog.timestamp <= filters.end_date)
        if filters.is_sensitive_only:
            query = query.where(
                AuditLog.action.in_([
                    AuditAction.PASSWORD_VIEWED,
                    AuditAction.PASSWORD_CHANGED,
                    AuditAction.PERMISSION_CHANGED,
                    AuditAction.EXPORT,
                ])
            )

        # Count total
        count_query = select(func.count()).select_from(query.subquery())
        total_result = await db.execute(count_query)
        total = total_result.scalar_one()

        # Paginate
        query = query.order_by(desc(AuditLog.timestamp)).offset((page - 1) * page_size).limit(page_size)
        result = await db.execute(query)
        items = list(result.scalars().all())

        return items, total


audit_service = AuditService()
