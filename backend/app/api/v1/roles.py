from typing import List
from uuid import UUID
from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.api.deps import get_client_info, get_current_user, get_db, require_permission
from app.core.exceptions import ConflictException, NotFoundException
from app.models.audit_log import AuditAction
from app.models.rbac import Permission, Role, RolePermission
from app.models.user import User
from app.schemas.rbac import PermissionResponse, RoleCreate, RoleResponse, RoleUpdate
from app.services.audit_service import audit_service

router = APIRouter(tags=["Roles & Permissions"])


@router.get("/permissions", response_model=List[PermissionResponse])
async def list_permissions(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Permission).order_by(Permission.category, Permission.name))
    return list(result.scalars().all())


@router.get("/roles", response_model=List[RoleResponse])
async def list_roles(
    current_user: User = Depends(require_permission("role:read")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Role).options(selectinload(Role.role_permissions).selectinload(RolePermission.permission)).order_by(Role.name)
    )
    roles = result.scalars().all()

    output = []
    for r in roles:
        perms = [PermissionResponse.model_validate(rp.permission) for rp in r.role_permissions if rp.permission]
        output.append(
            RoleResponse(
                id=r.id,
                name=r.name,
                display_name=r.display_name,
                description=r.description,
                is_system=r.is_system,
                permissions=perms,
                created_at=r.created_at,
            )
        )
    return output


@router.post("/roles", response_model=RoleResponse)
async def create_role(
    req: RoleCreate,
    request: Request,
    current_user: User = Depends(require_permission("role:manage")),
    db: AsyncSession = Depends(get_db),
):
    existing = await db.execute(select(Role).where(Role.name == req.name.strip().upper()))
    if existing.scalar_one_or_none():
        raise ConflictException("A role with this name already exists.")

    role = Role(
        name=req.name.strip().upper(),
        display_name=req.display_name.strip(),
        description=req.description.strip() if req.description else None,
        is_system=False,
    )
    db.add(role)
    await db.flush()

    for p_id in req.permission_ids:
        rp = RolePermission(role_id=role.id, permission_id=p_id)
        db.add(rp)

    ip_address, user_agent = await get_client_info(request)
    await audit_service.log_event(
        db=db,
        action=AuditAction.ROLE_CREATED,
        username=current_user.username,
        user_id=current_user.id,
        ip_address=ip_address,
        user_agent=user_agent,
        details={"role_name": role.name, "permissions": [str(pid) for pid in req.permission_ids]},
    )
    await db.commit()
    await db.refresh(role)

    return await get_role_by_id(role.id, current_user, db)


@router.get("/roles/{role_id}", response_model=RoleResponse)
async def get_role_by_id(
    role_id: UUID,
    current_user: User = Depends(require_permission("role:read")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Role).options(selectinload(Role.role_permissions).selectinload(RolePermission.permission)).where(Role.id == role_id)
    )
    r = result.scalar_one_or_none()
    if not r:
        raise NotFoundException("Role not found.")

    perms = [PermissionResponse.model_validate(rp.permission) for rp in r.role_permissions if rp.permission]
    return RoleResponse(
        id=r.id,
        name=r.name,
        display_name=r.display_name,
        description=r.description,
        is_system=r.is_system,
        permissions=perms,
        created_at=r.created_at,
    )


@router.put("/roles/{role_id}", response_model=RoleResponse)
async def update_role(
    role_id: UUID,
    req: RoleUpdate,
    request: Request,
    current_user: User = Depends(require_permission("role:manage")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Role).options(selectinload(Role.role_permissions)).where(Role.id == role_id)
    )
    role = result.scalar_one_or_none()
    if not role:
        raise NotFoundException("Role not found.")

    if req.display_name is not None:
        role.display_name = req.display_name.strip()
    if req.description is not None:
        role.description = req.description.strip()

    if req.permission_ids is not None:
        role.role_permissions.clear()
        for p_id in req.permission_ids:
            rp = RolePermission(role_id=role.id, permission_id=p_id)
            db.add(rp)

    ip_address, user_agent = await get_client_info(request)
    await audit_service.log_event(
        db=db,
        action=AuditAction.ROLE_UPDATED,
        username=current_user.username,
        user_id=current_user.id,
        ip_address=ip_address,
        user_agent=user_agent,
        details={"role_name": role.name},
    )
    await db.commit()
    return await get_role_by_id(role.id, current_user, db)


@router.delete("/roles/{role_id}")
async def delete_role(
    role_id: UUID,
    request: Request,
    current_user: User = Depends(require_permission("role:manage")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Role).where(Role.id == role_id))
    role = result.scalar_one_or_none()
    if not role:
        raise NotFoundException("Role not found.")

    if role.is_system:
        raise ConflictException("System default roles cannot be deleted.")

    role_name = role.name
    await db.delete(role)

    ip_address, user_agent = await get_client_info(request)
    await audit_service.log_event(
        db=db,
        action=AuditAction.ROLE_DELETED,
        username=current_user.username,
        user_id=current_user.id,
        ip_address=ip_address,
        user_agent=user_agent,
        details={"deleted_role": role_name},
    )
    await db.commit()
    return {"message": f"Role {role_name} deleted successfully"}
