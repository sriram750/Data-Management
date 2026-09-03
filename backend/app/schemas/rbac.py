from datetime import datetime
from typing import Any, Dict, List, Optional
from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field
from app.models.rbac import ColumnPermissionLevel


class PermissionResponse(BaseModel):
    id: UUID
    code: str
    name: str
    category: str
    description: Optional[str] = None
    model_config = ConfigDict(from_attributes=True)


class RoleBase(BaseModel):
    name: str = Field(..., min_length=2, max_length=64)
    display_name: str = Field(..., min_length=1, max_length=128)
    description: Optional[str] = None


class RoleCreate(RoleBase):
    permission_ids: List[UUID] = []


class RoleUpdate(BaseModel):
    display_name: Optional[str] = None
    description: Optional[str] = None
    permission_ids: Optional[List[UUID]] = None


class RoleResponse(BaseModel):
    id: UUID
    name: str
    display_name: str
    description: Optional[str] = None
    is_system: bool
    permissions: List[PermissionResponse] = []
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


class TablePermissionCreate(BaseModel):
    role_id: Optional[UUID] = None
    user_id: Optional[UUID] = None
    can_view_records: bool = True
    can_add_records: bool = False
    can_edit_records: bool = False
    can_delete_records: bool = False
    can_manage_columns: bool = False
    can_manage_permissions: bool = False
    can_import: bool = False
    can_export: bool = False


class TablePermissionResponse(BaseModel):
    id: UUID
    table_id: UUID
    role_id: Optional[UUID] = None
    role_name: Optional[str] = None
    user_id: Optional[UUID] = None
    username: Optional[str] = None
    can_view_records: bool
    can_add_records: bool
    can_edit_records: bool
    can_delete_records: bool
    can_manage_columns: bool
    can_manage_permissions: bool
    can_import: bool
    can_export: bool
    model_config = ConfigDict(from_attributes=True)


class ColumnPermissionCreate(BaseModel):
    column_id: UUID
    role_id: Optional[UUID] = None
    user_id: Optional[UUID] = None
    permission_level: ColumnPermissionLevel = ColumnPermissionLevel.VIEW


class ColumnPermissionResponse(BaseModel):
    id: UUID
    column_id: UUID
    column_name: str
    role_id: Optional[UUID] = None
    role_name: Optional[str] = None
    user_id: Optional[UUID] = None
    username: Optional[str] = None
    permission_level: ColumnPermissionLevel
    model_config = ConfigDict(from_attributes=True)


class RecordLevelRuleCreate(BaseModel):
    role_id: Optional[UUID] = None
    user_id: Optional[UUID] = None
    rule_name: str
    rule_expression: Dict[str, Any]


class RecordLevelRuleResponse(BaseModel):
    id: UUID
    table_id: UUID
    role_id: Optional[UUID] = None
    user_id: Optional[UUID] = None
    rule_name: str
    rule_expression: Dict[str, Any]
    model_config = ConfigDict(from_attributes=True)
