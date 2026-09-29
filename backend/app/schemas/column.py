from datetime import datetime
from typing import Any, Dict, List, Optional
from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field, field_validator
from app.models.dynamic_column import ColumnType


class ColumnBase(BaseModel):
    name: str = Field(..., min_length=1, max_length=128)
    display_name: str = Field(..., min_length=1, max_length=255)
    data_type: ColumnType = ColumnType.TEXT
    is_required: bool = False
    is_sensitive: bool = False
    is_encrypted: bool = False
    is_hidden: bool = False
    default_value: Optional[str] = None
    validation_rules: Optional[Dict[str, Any]] = None
    display_order: int = 0

    @field_validator("name", mode="before")
    @classmethod
    def sanitize_name(cls, v: Any) -> str:
        s = str(v).strip() if v is not None else ""
        return s if s else "column"

    @field_validator("display_name", mode="before")
    @classmethod
    def sanitize_display_name(cls, v: Any) -> str:
        s = str(v).strip() if v is not None else ""
        return s if s else "Column"


class ColumnCreate(ColumnBase):
    pass


class ColumnUpdate(BaseModel):
    display_name: Optional[str] = None
    data_type: Optional[ColumnType] = None
    is_required: Optional[bool] = None
    is_sensitive: Optional[bool] = None
    is_encrypted: Optional[bool] = None
    is_hidden: Optional[bool] = None
    default_value: Optional[str] = None
    validation_rules: Optional[Dict[str, Any]] = None
    display_order: Optional[int] = None


class ColumnResponse(ColumnBase):
    id: UUID
    table_id: UUID
    created_at: datetime
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)


class ColumnReorderItem(BaseModel):
    id: UUID
    display_order: int


class ColumnReorderRequest(BaseModel):
    columns: List[ColumnReorderItem]


class ColumnTypeCheckRequest(BaseModel):
    target_type: ColumnType


class ColumnTypeCheckResponse(BaseModel):
    column_id: UUID
    current_type: ColumnType
    target_type: ColumnType
    total_records: int
    compatible_count: int
    incompatible_count: int
    is_safe: bool
    sample_incompatible_values: List[Any] = []
