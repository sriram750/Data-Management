from datetime import datetime
from typing import Any, Dict, List, Optional
from uuid import UUID
from pydantic import BaseModel, ConfigDict


class AttachmentVersionResponse(BaseModel):
    id: UUID
    version_number: int
    file_size_bytes: int
    sha256_hash: str
    change_summary: Optional[str] = None
    created_at: datetime
    created_by_username: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)


class AttachmentResponse(BaseModel):
    id: UUID
    original_filename: str
    file_size_bytes: int
    content_type: str
    sha256_hash: str
    version: int
    is_deleted: bool = False
    deleted_at: Optional[datetime] = None
    deleted_by_username: Optional[str] = None
    table_id: Optional[UUID] = None
    record_id: Optional[UUID] = None
    column_id: Optional[UUID] = None
    created_at: datetime
    updated_at: datetime
    uploaded_by_username: Optional[str] = None
    versions: List[AttachmentVersionResponse] = []

    model_config = ConfigDict(from_attributes=True)


class AttachmentListResponse(BaseModel):
    items: List[AttachmentResponse]
    total: int


class BulkAttachmentActionRequest(BaseModel):
    attachment_ids: List[UUID]


class AttachmentAuditLogItem(BaseModel):
    id: UUID
    timestamp: datetime
    action: str
    username: str
    filename: Optional[str] = None
    details: Optional[Dict[str, Any]] = None
    ip_address: Optional[str] = None

    model_config = ConfigDict(from_attributes=True)

