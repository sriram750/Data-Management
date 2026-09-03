from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.api.deps import get_client_info, get_db
from app.models.rbac import UserRole
from app.models.user import User
from app.schemas.auth import InitialAdminSetupRequest, SetupStatusResponse
from app.schemas.user import UserResponse, UserRoleBrief
from app.services.auth_service import auth_service

router = APIRouter(prefix="/setup", tags=["Setup Wizard"])


@router.get("/status", response_model=SetupStatusResponse)
async def get_setup_status(db: AsyncSession = Depends(get_db)):
    """Check if the system is fresh and requires initial Super Admin setup."""
    is_required = await auth_service.is_setup_required(db)
    total_users = await auth_service.get_total_users(db)
    return SetupStatusResponse(setup_required=is_required, total_users=total_users)


@router.post("/initialize-admin", response_model=UserResponse)
async def initialize_admin(
    req: InitialAdminSetupRequest,
    request: Request,
    db: AsyncSession = Depends(get_db),
):
    """Create the initial Super Administrator account. Locked once any user exists."""
    ip_address, user_agent = await get_client_info(request)
    admin_user = await auth_service.initialize_admin(
        db=db, req=req, ip_address=ip_address, user_agent=user_agent
    )

    # Re-fetch admin user with roles populated
    res = await db.execute(
        select(User).options(selectinload(User.roles).selectinload(UserRole.role)).where(User.id == admin_user.id)
    )
    u = res.scalar_one()

    roles_brief = [UserRoleBrief(id=ur.role.id, name=ur.role.name, display_name=ur.role.display_name) for ur in u.roles if ur.role]
    return UserResponse(
        id=u.id,
        username=u.username,
        email=u.email,
        full_name=u.full_name,
        status=u.status,
        is_super_admin=u.is_super_admin,
        roles=roles_brief,
        last_login_at=u.last_login_at,
        created_at=u.created_at,
        updated_at=u.updated_at,
    )
