from datetime import datetime
from typing import Any, Dict, List, Optional
from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field
from app.schemas.column import ColumnCreate, ColumnResponse


class TableBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=128)
    display_name: str = Field(..., min_length=1, max_length=255)
    description: Optional[str] = None


class TableCreate(TableBase):
    columns: List[ColumnCreate] = []


class TableUpdate(BaseModel):
    display_name: Optional[str] = None
    description: Optional[str] = None
    is_active: Optional[bool] = None
    is_favorite: Optional[bool] = None


class TableResponse(TableBase):
    id: UUID
    is_active: bool
    is_favorite: bool
    columns: List[ColumnResponse] = []
    record_count: int = 0
    created_at: datetime
    updated_at: datetime
    created_by_id: Optional[UUID] = None
    model_config = ConfigDict(from_attributes=True)


class TableListResponse(BaseModel):
    items: List[TableResponse]
    total: int


class TableHistoryResponse(BaseModel):
    id: UUID
    table_id: UUID
    action: str
    details: Dict[str, Any]
    changed_by_username: Optional[str] = None
    timestamp: datetime
    model_config = ConfigDict(from_attributes=True)
