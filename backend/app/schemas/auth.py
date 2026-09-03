from datetime import datetime
from typing import List, Optional
from uuid import UUID
from pydantic import BaseModel, EmailStr, Field


class LoginRequest(BaseModel):
    username: str = Field(..., min_length=1)
    password: str = Field(..., min_length=1)


class UserInfo(BaseModel):
    id: UUID
    username: str
    full_name: str
    email: EmailStr
    is_super_admin: bool
    roles: List[str]
    permissions: List[str]


class LoginResponse(BaseModel):
    token: str
    token_type: str = "Bearer"
    expires_at: datetime
    user: UserInfo


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str = Field(..., min_length=8)


class SessionResponse(BaseModel):
    id: UUID
    ip_address: Optional[str] = None
    user_agent: Optional[str] = None
    expires_at: datetime
    last_activity_at: Optional[datetime] = None
    created_at: datetime
    is_current: bool = False


class SetupStatusResponse(BaseModel):
    setup_required: bool
    total_users: int


class InitialAdminSetupRequest(BaseModel):
    username: str = Field(..., min_length=3, max_length=64)
    full_name: str = Field(..., min_length=1, max_length=255)
    email: EmailStr
    password: str = Field(..., min_length=8)
    confirm_password: str
