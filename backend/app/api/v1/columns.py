from typing import List
from uuid import UUID
from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.api.deps import get_client_info, get_current_user, get_db, require_permission
from app.core.exceptions import ForbiddenException, NotFoundException
from app.models.dynamic_column import DataColumn
from app.models.rbac import ColumnPermission, ColumnPermissionLevel
from app.models.user import User
from app.schemas.column import (
    ColumnCreate,
    ColumnReorderRequest,
    ColumnResponse,
    ColumnTypeCheckRequest,
    ColumnTypeCheckResponse,
    ColumnUpdate,
)
from app.schemas.rbac import ColumnPermissionCreate, ColumnPermissionResponse
from app.services.column_service import column_service
from app.services.rbac_service import rbac_service

router = APIRouter(tags=["Columns"])


@router.post("/tables/{table_id}/columns", response_model=ColumnResponse)
async def add_column(
    table_id: UUID,
    req: ColumnCreate,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # Check table column management permission
    t_perms = await rbac_service.get_effective_table_permission(db, current_user, table_id)
    if not t_perms["can_manage_columns"]:
        raise ForbiddenException("You do not have permission to manage columns in this table.")

    ip_address, user_agent = await get_client_info(request)
    col = await column_service.add_column(
        db=db, table_id=table_id, req=req, user=current_user, ip_address=ip_address, user_agent=user_agent
    )
    return ColumnResponse.model_validate(col)


@router.put("/columns/{column_id}", response_model=ColumnResponse)
async def update_column(
    column_id: UUID,
    req: ColumnUpdate,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    col_res = await db.execute(select(DataColumn).where(DataColumn.id == column_id))
    column = col_res.scalar_one_or_none()
    if not column:
        raise NotFoundException("Column not found.")

    t_perms = await rbac_service.get_effective_table_permission(db, current_user, column.table_id)
    if not t_perms["can_manage_columns"]:
        raise ForbiddenException("You do not have permission to manage columns in this table.")

    ip_address, user_agent = await get_client_info(request)
    updated_col = await column_service.update_column(
        db=db, column_id=column_id, req=req, user=current_user, ip_address=ip_address, user_agent=user_agent
    )
    return ColumnResponse.model_validate(updated_col)


@router.post("/columns/{column_id}/check-type", response_model=ColumnTypeCheckResponse)
async def check_type_compatibility(
    column_id: UUID,
    req: ColumnTypeCheckRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    return await column_service.check_type_compatibility(db, column_id=column_id, target_type=req.target_type)


@router.delete("/columns/{column_id}")
async def delete_column(
    column_id: UUID,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    col_res = await db.execute(select(DataColumn).where(DataColumn.id == column_id))
    column = col_res.scalar_one_or_none()
    if not column:
        raise NotFoundException("Column not found.")

    t_perms = await rbac_service.get_effective_table_permission(db, current_user, column.table_id)
    if not t_perms["can_manage_columns"]:
        raise ForbiddenException("You do not have permission to delete columns in this table.")

    ip_address, user_agent = await get_client_info(request)
    await column_service.delete_column(
        db=db, column_id=column_id, user=current_user, ip_address=ip_address, user_agent=user_agent
    )
    return {"message": "Column deleted successfully"}


@router.post("/tables/{table_id}/columns/reorder")
async def reorder_columns(
    table_id: UUID,
    req: ColumnReorderRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    t_perms = await rbac_service.get_effective_table_permission(db, current_user, table_id)
    if not t_perms["can_manage_columns"]:
        raise ForbiddenException("You do not have permission to reorder columns in this table.")

    await column_service.reorder_columns(db, table_id=table_id, reorders=req.columns, user=current_user)
    return {"message": "Columns reordered successfully"}


@router.post("/columns/{column_id}/permissions", response_model=ColumnPermissionResponse)
async def set_column_permission(
    column_id: UUID,
    req: ColumnPermissionCreate,
    current_user: User = Depends(require_permission("table:manage_permissions")),
    db: AsyncSession = Depends(get_db),
):
    col_res = await db.execute(select(DataColumn).where(DataColumn.id == column_id))
    col = col_res.scalar_one_or_none()
    if not col:
        raise NotFoundException("Column not found.")

    query = select(ColumnPermission).where(ColumnPermission.column_id == column_id)
    if req.role_id:
        query = query.where(ColumnPermission.role_id == req.role_id)
    elif req.user_id:
        query = query.where(ColumnPermission.user_id == req.user_id)

    res = await db.execute(query)
    perm = res.scalar_one_or_none()

    if not perm:
        perm = ColumnPermission(
            column_id=column_id,
            role_id=req.role_id,
            user_id=req.user_id,
        )
        db.add(perm)

    perm.permission_level = req.permission_level
    await db.commit()
    await db.refresh(perm)

    return ColumnPermissionResponse(
        id=perm.id,
        column_id=perm.column_id,
        column_name=col.name,
        role_id=perm.role_id,
        user_id=perm.user_id,
        permission_level=perm.permission_level,
    )
