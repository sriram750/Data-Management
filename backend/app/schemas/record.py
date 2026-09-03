from datetime import datetime
from typing import Any, Dict, List, Optional
from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field
from app.models.record_version import ChangeType


class RecordCreate(BaseModel):
    data: Dict[str, Any] = Field(default_factory=dict)


class RecordUpdate(BaseModel):
    data: Dict[str, Any] = Field(default_factory=dict)


class RecordResponse(BaseModel):
    id: UUID
    table_id: UUID
    data: Dict[str, Any]
    version: int
    created_at: datetime
    updated_at: datetime
    created_by_id: Optional[UUID] = None
    updated_by_id: Optional[UUID] = None
    created_by_name: Optional[str] = None
    updated_by_name: Optional[str] = None
    model_config = ConfigDict(from_attributes=True)


class DeletedRecordResponse(BaseModel):
    id: UUID
    record_id: UUID
    table_id: UUID
    table_name: Optional[str] = None
    table_display_name: Optional[str] = None
    version_number: int
    data_snapshot: Dict[str, Any]
    deleted_by_id: Optional[UUID] = None
    deleted_by_name: Optional[str] = None
    deleted_at: datetime
    model_config = ConfigDict(from_attributes=True)


class RecordListResponse(BaseModel):
    items: List[RecordResponse]
    total: int
    page: int
    page_size: int


class RecordVersionResponse(BaseModel):
    id: UUID
    record_id: UUID
    table_id: UUID
    version_number: int
    data_snapshot: Dict[str, Any]
    delta: Optional[Dict[str, Any]] = None
    change_type: ChangeType
    changed_by_id: Optional[UUID] = None
    changed_by_username: Optional[str] = None
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


class RecordBulkDeleteRequest(BaseModel):
    record_ids: List[UUID]


class RecordBulkUpdateRequest(BaseModel):
    record_ids: List[UUID]
    updates: Dict[str, Any]


class RevealSecretRequest(BaseModel):
    confirm_password: Optional[str] = None


class RevealSecretResponse(BaseModel):
    column_id: UUID
    column_name: str
    plaintext_value: Optional[str]
    expires_in_seconds: int = 30
