from typing import List, Tuple
from uuid import UUID
from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_client_info, get_current_user, get_current_user_and_session, get_db
from app.models.user import User, UserSession
from app.schemas.auth import ChangePasswordRequest, LoginRequest, LoginResponse, SessionResponse, UserInfo
from app.services.auth_service import auth_service
from app.services.rbac_service import rbac_service

router = APIRouter(prefix="/auth", tags=["Authentication"])


@router.post("/login", response_model=LoginResponse)
async def login(
    req: LoginRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    ip_address, user_agent = await get_client_info(request)
    return await auth_service.authenticate_user(
        db=db, req=req, ip_address=ip_address, user_agent=user_agent
    )


@router.post("/logout")
async def logout(
    request: Request,
    user_and_session: Tuple[User, UserSession] = Depends(get_current_user_and_session),
    db: AsyncSession = Depends(get_db),
):
    user, session = user_and_session
    ip_address, user_agent = await get_client_info(request)
    await auth_service.logout(db=db, session=session, user=user, ip_address=ip_address, user_agent=user_agent)
    return {"message": "Logged out successfully"}


@router.get("/me", response_model=UserInfo)
async def get_my_profile(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    user_roles = [ur.role.name for ur in current_user.roles if ur.role]
    permissions = list(await rbac_service.get_user_permissions(db, current_user))
    return UserInfo(
        id=current_user.id,
        username=current_user.username,
        full_name=current_user.full_name,
        email=current_user.email,
        is_super_admin=current_user.is_super_admin,
        roles=user_roles,
        permissions=permissions,
    )


@router.post("/change-password")
async def change_password(
    req: ChangePasswordRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    ip_address, user_agent = await get_client_info(request)
    await auth_service.change_password(
        db=db,
        user=current_user,
        current_password=req.current_password,
        new_password=req.new_password,
        ip_address=ip_address,
        user_agent=user_agent,
    )
    return {"message": "Password updated successfully"}


@router.get("/sessions", response_model=List[SessionResponse])
async def get_active_sessions(
    user_and_session: Tuple[User, UserSession] = Depends(get_current_user_and_session),
    db: AsyncSession = Depends(get_db),
):
    user, session = user_and_session
    return await auth_service.get_user_sessions(db, user, current_session_id=session.id)


@router.delete("/sessions/{session_id}")
async def revoke_session(
    session_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    await auth_service.revoke_session(db, current_user, session_id)
    return {"message": "Session revoked"}
