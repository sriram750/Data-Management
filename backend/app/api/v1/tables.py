from typing import List, Optional
from uuid import UUID
from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.api.deps import get_client_info, get_current_user, get_db, require_permission
from app.models.dynamic_table import DataTable
from app.models.rbac import TablePermission
from app.models.user import User
from app.schemas.column import ColumnResponse
from app.schemas.rbac import TablePermissionCreate, TablePermissionResponse
from app.schemas.table import TableCreate, TableHistoryResponse, TableListResponse, TableResponse, TableUpdate
from app.services.rbac_service import rbac_service
from app.services.table_service import table_service

router = APIRouter(prefix="/tables", tags=["Dynamic Tables"])


@router.get("", response_model=TableListResponse)
async def list_tables(
    search: Optional[str] = None,
    only_favorites: bool = False,
    current_user: User = Depends(require_permission("table:read")),
    db: AsyncSession = Depends(get_db),
):
    table_rows = await table_service.get_tables(db, search=search, only_favorites=only_favorites)

    items = []
    for table, rec_count in table_rows:
        # Check if user has view permission on this table
        t_perms = await rbac_service.get_effective_table_permission(db, current_user, table.id)
        if not t_perms["can_view_records"]:
            continue

        cols = [ColumnResponse.model_validate(c) for c in table.columns]
        items.append(
            TableResponse(
                id=table.id,
                name=table.name,
                display_name=table.display_name,
                description=table.description,
                is_active=table.is_active,
                is_favorite=table.is_favorite,
                columns=cols,
                record_count=rec_count,
                created_at=table.created_at,
                updated_at=table.updated_at,
                created_by_id=table.created_by_id,
            )
        )

    return TableListResponse(items=items, total=len(items))


@router.get("/trash", response_model=TableListResponse)
async def list_trash_tables(
    search: Optional[str] = None,
    current_user: User = Depends(require_permission("table:read")),
    db: AsyncSession = Depends(get_db),
):
    """Lists soft-deleted tables."""
    table_rows = await table_service.get_trash_tables(db, search=search)

    items = []
    for table, rec_count in table_rows:
        cols = [ColumnResponse.model_validate(c) for c in table.columns]
        items.append(
            TableResponse(
                id=table.id,
                name=table.name,
                display_name=table.display_name,
                description=table.description,
                is_active=table.is_active,
                is_favorite=table.is_favorite,
                columns=cols,
                record_count=rec_count,
                created_at=table.created_at,
                updated_at=table.updated_at,
                created_by_id=table.created_by_id,
            )
        )

    return TableListResponse(items=items, total=len(items))


@router.post("", response_model=TableResponse)
async def create_table(
    req: TableCreate,
    request: Request,
    current_user: User = Depends(require_permission("table:create")),
    db: AsyncSession = Depends(get_db),
):
    ip_address, user_agent = await get_client_info(request)
    table = await table_service.create_table(
        db=db, req=req, user=current_user, ip_address=ip_address, user_agent=user_agent
    )
    cols = [ColumnResponse.model_validate(c) for c in table.columns]
    return TableResponse(
        id=table.id,
        name=table.name,
        display_name=table.display_name,
        description=table.description,
        is_active=table.is_active,
        is_favorite=table.is_favorite,
        columns=cols,
        record_count=0,
        created_at=table.created_at,
        updated_at=table.updated_at,
        created_by_id=table.created_by_id,
    )


@router.get("/{table_id}", response_model=TableResponse)
async def get_table(
    table_id: UUID,
    current_user: User = Depends(require_permission("table:read")),
    db: AsyncSession = Depends(get_db),
):
    table = await table_service.get_table_by_id(db, table_id)
    cols = [ColumnResponse.model_validate(c) for c in table.columns]
    return TableResponse(
        id=table.id,
        name=table.name,
        display_name=table.display_name,
        description=table.description,
        is_active=table.is_active,
        is_favorite=table.is_favorite,
        columns=cols,
        record_count=0,
        created_at=table.created_at,
        updated_at=table.updated_at,
        created_by_id=table.created_by_id,
    )


@router.put("/{table_id}", response_model=TableResponse)
async def update_table(
    table_id: UUID,
    req: TableUpdate,
    request: Request,
    current_user: User = Depends(require_permission("table:update")),
    db: AsyncSession = Depends(get_db),
):
    ip_address, user_agent = await get_client_info(request)
    table = await table_service.update_table(
        db=db, table_id=table_id, req=req, user=current_user, ip_address=ip_address, user_agent=user_agent
    )
    cols = [ColumnResponse.model_validate(c) for c in table.columns]
    return TableResponse(
        id=table.id,
        name=table.name,
        display_name=table.display_name,
        description=table.description,
        is_active=table.is_active,
        is_favorite=table.is_favorite,
        columns=cols,
        record_count=0,
        created_at=table.created_at,
        updated_at=table.updated_at,
        created_by_id=table.created_by_id,
    )


@router.delete("/{table_id}")
async def delete_table(
    table_id: UUID,
    request: Request,
    current_user: User = Depends(require_permission("table:delete")),
    db: AsyncSession = Depends(get_db),
):
    ip_address, user_agent = await get_client_info(request)
    await table_service.delete_table(
        db=db, table_id=table_id, user=current_user, ip_address=ip_address, user_agent=user_agent
    )
    return {"message": "Table moved to trash successfully"}


@router.post("/{table_id}/restore", response_model=TableResponse)
async def restore_table(
    table_id: UUID,
    request: Request,
    current_user: User = Depends(require_permission("table:create")),
    db: AsyncSession = Depends(get_db),
):
    ip_address, user_agent = await get_client_info(request)
    table = await table_service.restore_table(
        db=db, table_id=table_id, user=current_user, ip_address=ip_address, user_agent=user_agent
    )
    cols = [ColumnResponse.model_validate(c) for c in table.columns]
    return TableResponse(
        id=table.id,
        name=table.name,
        display_name=table.display_name,
        description=table.description,
        is_active=table.is_active,
        is_favorite=table.is_favorite,
        columns=cols,
        record_count=0,
        created_at=table.created_at,
        updated_at=table.updated_at,
        created_by_id=table.created_by_id,
    )


@router.delete("/{table_id}/permanent")
async def permanent_delete_table(
    table_id: UUID,
    request: Request,
    current_user: User = Depends(require_permission("table:delete")),
    db: AsyncSession = Depends(get_db),
):
    ip_address, user_agent = await get_client_info(request)
    await table_service.permanent_delete_table(
        db=db, table_id=table_id, user=current_user, ip_address=ip_address, user_agent=user_agent
    )
    return {"message": "Table permanently deleted"}


@router.get("/{table_id}/history", response_model=List[TableHistoryResponse])
async def get_table_history(
    table_id: UUID,
    current_user: User = Depends(require_permission("table:read")),
    db: AsyncSession = Depends(get_db),
):
    history = await table_service.get_table_history(db, table_id)
    return [TableHistoryResponse.model_validate(h) for h in history]


@router.get("/{table_id}/permissions", response_model=List[TablePermissionResponse])
async def get_table_permissions(
    table_id: UUID,
    current_user: User = Depends(require_permission("table:manage_permissions")),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(TablePermission)
        .options(selectinload(TablePermission.role), selectinload(TablePermission.user))
        .where(TablePermission.table_id == table_id)
    )
    perms = result.scalars().all()
    output = []
    for p in perms:
        output.append(
            TablePermissionResponse(
                id=p.id,
                table_id=p.table_id,
                role_id=p.role_id,
                role_name=p.role.name if p.role else None,
                user_id=p.user_id,
                username=p.user.username if p.user else None,
                can_view_records=p.can_view_records,
                can_add_records=p.can_add_records,
                can_edit_records=p.can_edit_records,
                can_delete_records=p.can_delete_records,
                can_manage_columns=p.can_manage_columns,
                can_manage_permissions=p.can_manage_permissions,
                can_import=p.can_import,
                can_export=p.can_export,
            )
        )
    return output


@router.post("/{table_id}/permissions", response_model=TablePermissionResponse)
async def set_table_permission(
    table_id: UUID,
    req: TablePermissionCreate,
    current_user: User = Depends(require_permission("table:manage_permissions")),
    db: AsyncSession = Depends(get_db),
):
    # Upsert permission
    query = select(TablePermission).where(TablePermission.table_id == table_id)
    if req.role_id:
        query = query.where(TablePermission.role_id == req.role_id)
    elif req.user_id:
        query = query.where(TablePermission.user_id == req.user_id)

    res = await db.execute(query)
    perm = res.scalar_one_or_none()

    if not perm:
        perm = TablePermission(
            table_id=table_id,
            role_id=req.role_id,
            user_id=req.user_id,
        )
        db.add(perm)

    perm.can_view_records = req.can_view_records
    perm.can_add_records = req.can_add_records
    perm.can_edit_records = req.can_edit_records
    perm.can_delete_records = req.can_delete_records
    perm.can_manage_columns = req.can_manage_columns
    perm.can_manage_permissions = req.can_manage_permissions
    perm.can_import = req.can_import
    perm.can_export = req.can_export

    await db.commit()
    await db.refresh(perm)

    return TablePermissionResponse(
        id=perm.id,
        table_id=perm.table_id,
        role_id=perm.role_id,
        user_id=perm.user_id,
        can_view_records=perm.can_view_records,
        can_add_records=perm.can_add_records,
        can_edit_records=perm.can_edit_records,
        can_delete_records=perm.can_delete_records,
        can_manage_columns=perm.can_manage_columns,
        can_manage_permissions=perm.can_manage_permissions,
        can_import=perm.can_import,
        can_export=perm.can_export,
    )


@router.delete("/{table_id}/permissions/{perm_id}")
async def delete_table_permission(
    table_id: UUID,
    perm_id: UUID,
    db: AsyncSession = Depends(get_db),
    current_user: User = Depends(require_permission("table:manage_permissions")),
):
    perm = await db.get(TablePermission, perm_id)
    if not perm or perm.table_id != table_id:
        raise NotFoundException("Table permission not found")
    await db.delete(perm)
    await db.commit()
    return {"message": "Permission rule removed successfully"}
