from datetime import datetime
from typing import Optional
from uuid import UUID
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_current_user, get_db, require_permission
from app.models.audit_log import AuditAction
from app.models.user import User
from app.schemas.audit import AuditFilterParams, AuditLogListResponse, AuditLogResponse
from app.services.audit_service import audit_service

router = APIRouter(prefix="/audit", tags=["Audit & Governance"])


@router.get("/logs", response_model=AuditLogListResponse)
async def get_audit_logs(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    username: Optional[str] = None,
    action: Optional[AuditAction] = None,
    table_name: Optional[str] = None,
    start_date: Optional[datetime] = None,
    end_date: Optional[datetime] = None,
    is_sensitive_only: bool = False,
    current_user: User = Depends(require_permission("audit:read")),
    db: AsyncSession = Depends(get_db),
):
    filters = AuditFilterParams(
        username=username,
        action=action,
        table_name=table_name,
        start_date=start_date,
        end_date=end_date,
        is_sensitive_only=is_sensitive_only,
    )
    items, total = await audit_service.query_logs(db, filters=filters, page=page, page_size=page_size)
    return AuditLogListResponse(
        items=[AuditLogResponse.model_validate(i) for i in items],
        total=total,
        page=page,
        page_size=page_size,
    )
