from datetime import datetime
from typing import Any, Dict, List, Optional
from uuid import UUID
from pydantic import BaseModel, ConfigDict
from app.models.audit_log import AuditAction


class AuditLogResponse(BaseModel):
    id: UUID
    timestamp: datetime
    user_id: Optional[UUID] = None
    username: str
    action: AuditAction
    table_id: Optional[UUID] = None
    table_name: Optional[str] = None
    record_id: Optional[UUID] = None
    field_name: Optional[str] = None
    old_value: Optional[str] = None
    new_value: Optional[str] = None
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    details: Optional[Dict[str, Any]] = None
    model_config = ConfigDict(from_attributes=True)


class AuditLogListResponse(BaseModel):
    items: List[AuditLogResponse]
    total: int
    page: int
    page_size: int


class AuditFilterParams(BaseModel):
    user_id: Optional[UUID] = None
    username: Optional[str] = None
    action: Optional[AuditAction] = None
    table_name: Optional[str] = None
    start_date: Optional[datetime] = None
    end_date: Optional[datetime] = None
    is_sensitive_only: bool = False
