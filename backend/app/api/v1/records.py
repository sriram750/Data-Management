from typing import Any, Dict, List, Optional
from uuid import UUID
from fastapi import APIRouter, Depends, Header, Query, Request
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.api.deps import get_client_info, get_current_user, get_db
from app.models.dynamic_record import DataRecord
from app.models.user import User
from app.schemas.record import (
    DeletedRecordResponse,
    RecordBulkDeleteRequest,
    RecordCreate,
    RecordListResponse,
    RecordResponse,
    RecordUpdate,
    RecordVersionResponse,
    RevealSecretRequest,
    RevealSecretResponse,
)
from app.services.record_service import record_service

router = APIRouter(tags=["Records"])


@router.get("/tables/{table_id}/records", response_model=RecordListResponse)
async def list_records(
    table_id: UUID,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100000),
    search: Optional[str] = None,
    sort_by: Optional[str] = None,
    sort_desc: bool = False,
    x_table_password: Optional[str] = Header(None, alias="X-Table-Password"),
    table_password: Optional[str] = Query(None),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    effective_password = x_table_password or table_password
    items, total = await record_service.get_records(
        db=db,
        table_id=table_id,
        user=current_user,
        page=page,
        page_size=page_size,
        search=search,
        sort_by=sort_by,
        sort_desc=sort_desc,
        table_password=effective_password,
    )
    return RecordListResponse(items=items, total=total, page=page, page_size=page_size)


@router.post("/tables/{table_id}/records", response_model=RecordResponse)
async def create_record(
    table_id: UUID,
    req: RecordCreate,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    ip_address, user_agent = await get_client_info(request)
    rec = await record_service.create_record(
        db=db, table_id=table_id, req=req, user=current_user, ip_address=ip_address, user_agent=user_agent
    )
    return RecordResponse(
        id=rec.id,
        table_id=rec.table_id,
        data=rec.data,
        version=rec.version,
        created_at=rec.created_at,
        updated_at=rec.updated_at,
        created_by_id=rec.created_by_id,
        updated_by_id=rec.updated_by_id,
    )


@router.put("/records/{record_id}", response_model=RecordResponse)
async def update_record(
    record_id: UUID,
    req: RecordUpdate,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    ip_address, user_agent = await get_client_info(request)
    rec = await record_service.update_record(
        db=db, record_id=record_id, req=req, user=current_user, ip_address=ip_address, user_agent=user_agent
    )
    return RecordResponse(
        id=rec.id,
        table_id=rec.table_id,
        data=rec.data,
        version=rec.version,
        created_at=rec.created_at,
        updated_at=rec.updated_at,
        created_by_id=rec.created_by_id,
        updated_by_id=rec.updated_by_id,
        created_by_name=current_user.full_name or current_user.username,
        updated_by_name=current_user.full_name or current_user.username,
    )


@router.delete("/records/{record_id}")
async def delete_record(
    record_id: UUID,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    ip_address, user_agent = await get_client_info(request)
    await record_service.delete_record(
        db=db, record_id=record_id, user=current_user, ip_address=ip_address, user_agent=user_agent
    )
    return {"message": "Record moved to trash successfully"}


@router.get("/tables/{table_id}/deleted-records", response_model=List[DeletedRecordResponse])
async def get_table_deleted_records(
    table_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Lists soft-deleted records for a specific table."""
    records = await record_service.get_deleted_records(db, table_id=table_id, user=current_user)
    return [DeletedRecordResponse.model_validate(r) for r in records]


@router.get("/records/all-deleted", response_model=List[DeletedRecordResponse])
async def get_all_deleted_records(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Lists soft-deleted records across all tables."""
    records = await record_service.get_all_deleted_records(db, user=current_user)
    return [DeletedRecordResponse.model_validate(r) for r in records]


@router.post("/tables/{table_id}/records/{record_id}/restore-deleted", response_model=RecordResponse)
async def restore_deleted_record(
    table_id: UUID,
    record_id: UUID,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    ip_address, user_agent = await get_client_info(request)
    rec = await record_service.restore_deleted_record(
        db=db, record_id=record_id, user=current_user, ip_address=ip_address, user_agent=user_agent
    )
    return RecordResponse(
        id=rec.id,
        table_id=rec.table_id,
        data=rec.data,
        version=rec.version,
        created_at=rec.created_at,
        updated_at=rec.updated_at,
        created_by_id=rec.created_by_id,
        updated_by_id=rec.updated_by_id,
        created_by_name=current_user.full_name or current_user.username,
        updated_by_name=current_user.full_name or current_user.username,
    )


@router.delete("/tables/{table_id}/records/{record_id}/permanent")
async def permanent_delete_record(
    table_id: UUID,
    record_id: UUID,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    ip_address, user_agent = await get_client_info(request)
    await record_service.permanent_delete_record(
        db=db, record_id=record_id, user=current_user, ip_address=ip_address, user_agent=user_agent
    )
    return {"message": "Record permanently deleted"}


@router.post("/tables/{table_id}/records/bulk-delete")
async def bulk_delete_records(
    table_id: UUID,
    req: RecordBulkDeleteRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    ip_address, user_agent = await get_client_info(request)
    for rid in req.record_ids:
        await record_service.delete_record(
            db=db, record_id=rid, user=current_user, ip_address=ip_address, user_agent=user_agent
        )
    return {"message": f"Successfully moved {len(req.record_ids)} records to trash."}


@router.get("/records/{record_id}/history", response_model=List[RecordVersionResponse])
async def get_record_history(
    record_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    versions = await record_service.get_record_versions(db, record_id=record_id, user=current_user)
    return [RecordVersionResponse.model_validate(v) for v in versions]


@router.post("/records/{record_id}/restore/{version_number}", response_model=RecordResponse)
async def restore_record_version(
    record_id: UUID,
    version_number: int,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    ip_address, user_agent = await get_client_info(request)
    rec = await record_service.restore_record_version(
        db=db,
        record_id=record_id,
        version_number=version_number,
        user=current_user,
        ip_address=ip_address,
        user_agent=user_agent,
    )
    return RecordResponse(
        id=rec.id,
        table_id=rec.table_id,
        data=rec.data,
        version=rec.version,
        created_at=rec.created_at,
        updated_at=rec.updated_at,
        created_by_id=rec.created_by_id,
        updated_by_id=rec.updated_by_id,
    )


@router.post("/tables/{table_id}/records/{record_id}/columns/{column_id}/reveal-secret", response_model=RevealSecretResponse)
async def reveal_secret(
    table_id: UUID,
    record_id: UUID,
    column_id: UUID,
    req: RevealSecretRequest,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    ip_address, user_agent = await get_client_info(request)
    return await record_service.reveal_secret_field(
        db=db,
        table_id=table_id,
        record_id=record_id,
        column_id=column_id,
        user=current_user,
        ip_address=ip_address,
        user_agent=user_agent,
    )
