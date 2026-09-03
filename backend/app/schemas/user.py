from datetime import datetime
from typing import List, Optional
from uuid import UUID
from pydantic import BaseModel, ConfigDict, EmailStr, Field
from app.models.user import UserStatus


class UserBase(BaseModel):
    username: str = Field(..., min_length=3, max_length=64)
    email: EmailStr
    full_name: str = Field(..., min_length=1, max_length=255)
    status: UserStatus = UserStatus.ACTIVE


class UserCreate(UserBase):
    password: str = Field(..., min_length=8)
    role_ids: List[UUID] = []


class UserUpdate(BaseModel):
    email: Optional[EmailStr] = None
    full_name: Optional[str] = None
    status: Optional[UserStatus] = None
    password: Optional[str] = Field(None, min_length=8)
    role_ids: Optional[List[UUID]] = None


class UserRoleBrief(BaseModel):
    id: UUID
    name: str
    display_name: str
    model_config = ConfigDict(from_attributes=True)


class UserResponse(BaseModel):
    id: UUID
    username: str
    email: str
    full_name: str
    status: UserStatus
    is_super_admin: bool
    roles: List[UserRoleBrief] = []
    last_login_at: Optional[datetime] = None
    created_at: datetime
    updated_at: datetime
    model_config = ConfigDict(from_attributes=True)


class UserListResponse(BaseModel):
    items: List[UserResponse]
    total: int
