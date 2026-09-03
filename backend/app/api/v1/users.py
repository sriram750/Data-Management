from typing import Optional
from uuid import UUID
from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from app.api.deps import get_client_info, get_current_user, get_db, require_permission
from app.core.exceptions import ConflictException, NotFoundException
from app.core.security import hash_password
from app.models.audit_log import AuditAction
from app.models.rbac import Role, UserRole
from app.models.user import User, UserStatus
from app.schemas.user import UserCreate, UserListResponse, UserResponse, UserRoleBrief, UserUpdate
from app.services.audit_service import audit_service

router = APIRouter(prefix="/users", tags=["Users"])


@router.get("", response_model=UserListResponse)
async def list_users(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    search: Optional[str] = None,
    status: Optional[UserStatus] = None,
    current_user: User = Depends(require_permission("user:read")),
    db: AsyncSession = Depends(get_db),
):
    query = select(User).options(selectinload(User.roles).selectinload(UserRole.role))

    if search:
        query = query.where(
            (User.username.ilike(f"%{search}%"))
            | (User.full_name.ilike(f"%{search}%"))
            | (User.email.ilike(f"%{search}%"))
        )
    if status:
        query = query.where(User.status == status)

    count_q = select(func.count(User.id))
    if search:
        count_q = count_q.where(
            (User.username.ilike(f"%{search}%"))
            | (User.full_name.ilike(f"%{search}%"))
            | (User.email.ilike(f"%{search}%"))
        )
    if status:
        count_q = count_q.where(User.status == status)

    total_res = await db.execute(count_q)
    total = total_res.scalar_one()

    query = query.order_by(User.created_at.desc()).offset((page - 1) * page_size).limit(page_size)
    result = await db.execute(query)
    users = result.scalars().all()

    items = []
    for u in users:
        roles_brief = [UserRoleBrief(id=ur.role.id, name=ur.role.name, display_name=ur.role.display_name) for ur in u.roles if ur.role]
        items.append(
            UserResponse(
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
        )

    return UserListResponse(items=items, total=total)


@router.post("", response_model=UserResponse)
async def create_user(
    req: UserCreate,
    request: Request,
    current_user: User = Depends(require_permission("user:create")),
    db: AsyncSession = Depends(get_db),
):
    # Check username / email uniqueness
    existing = await db.execute(
        select(User).where((User.username == req.username.strip()) | (User.email == req.email.lower().strip()))
    )
    if existing.scalar_one_or_none():
        raise ConflictException("Username or Email already registered.")

    new_user = User(
        username=req.username.strip(),
        full_name=req.full_name.strip(),
        email=req.email.lower().strip(),
        password_hash=hash_password(req.password),
        status=req.status,
    )
    db.add(new_user)
    await db.flush()

    # Assign roles
    if req.role_ids:
        for r_id in req.role_ids:
            ur = UserRole(user_id=new_user.id, role_id=r_id)
            db.add(ur)

    ip_address, user_agent = await get_client_info(request)
    await audit_service.log_event(
        db=db,
        action=AuditAction.USER_CREATED,
        username=current_user.username,
        user_id=current_user.id,
        ip_address=ip_address,
        user_agent=user_agent,
        details={"created_user": new_user.username, "roles": [str(rid) for rid in req.role_ids]},
    )
    await db.commit()
    await db.refresh(new_user)

    # Return refreshed user
    return await get_user_by_id(new_user.id, current_user, db)


@router.get("/{user_id}", response_model=UserResponse)
async def get_user_by_id(
    user_id: UUID,
    current_user: User = Depends(require_permission("user:read")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(User).options(selectinload(User.roles).selectinload(UserRole.role)).where(User.id == user_id)
    )
    u = result.scalar_one_or_none()
    if not u:
        raise NotFoundException("User not found.")

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


@router.put("/{user_id}", response_model=UserResponse)
async def update_user(
    user_id: UUID,
    req: UserUpdate,
    request: Request,
    current_user: User = Depends(require_permission("user:update")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(User).options(selectinload(User.roles)).where(User.id == user_id)
    )
    user = result.scalar_one_or_none()
    if not user:
        raise NotFoundException("User not found.")

    if req.email is not None:
        user.email = req.email.lower().strip()
    if req.full_name is not None:
        user.full_name = req.full_name.strip()
    if req.status is not None:
        user.status = req.status
        if req.status == UserStatus.ACTIVE:
            user.failed_login_attempts = 0
            user.lockout_until = None
    if req.password is not None:
        user.password_hash = hash_password(req.password)

    if req.role_ids is not None:
        # Re-assign roles
        user.roles.clear()
        for r_id in req.role_ids:
            ur = UserRole(user_id=user.id, role_id=r_id)
            db.add(ur)

    ip_address, user_agent = await get_client_info(request)
    await audit_service.log_event(
        db=db,
        action=AuditAction.USER_UPDATED,
        username=current_user.username,
        user_id=current_user.id,
        ip_address=ip_address,
        user_agent=user_agent,
        details={"target_user": user.username, "updated_fields": list(req.model_dump(exclude_unset=True).keys())},
    )
    await db.commit()

    return await get_user_by_id(user.id, current_user, db)


@router.delete("/{user_id}")
async def delete_user(
    user_id: UUID,
    request: Request,
    current_user: User = Depends(require_permission("user:delete")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if not user:
        raise NotFoundException("User not found.")

    if user.is_super_admin:
        raise ConflictException("Super Administrator account cannot be deleted.")

    username = user.username
    await db.delete(user)

    ip_address, user_agent = await get_client_info(request)
    await audit_service.log_event(
        db=db,
        action=AuditAction.USER_DELETED,
        username=current_user.username,
        user_id=current_user.id,
        ip_address=ip_address,
        user_agent=user_agent,
        details={"deleted_user": username},
    )
    await db.commit()
    return {"message": f"User {username} deleted successfully"}
