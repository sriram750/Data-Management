from typing import List, Optional
from uuid import UUID
from fastapi import APIRouter, Depends, File, Form, Query, Request, Response, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_client_info, get_current_user, get_db
from app.models.user import User
from app.schemas.attachment import (
    AttachmentAuditLogItem,
    AttachmentListResponse,
    AttachmentResponse,
    AttachmentVersionResponse,
    BulkAttachmentActionRequest,
)
from app.services.attachment_service import attachment_service

router = APIRouter(prefix="/attachments", tags=["File Attachments & Documents"])


@router.get("", response_model=AttachmentListResponse)
async def list_attachments(
    table_id: Optional[UUID] = Query(None),
    search: Optional[str] = Query(None),
    file_type: Optional[str] = Query(None, description="pdf or word or docx"),
    is_deleted: Optional[bool] = Query(False, description="Filter active (false) or trash (true)"),
    skip: int = Query(0, ge=0),
    limit: int = Query(100, ge=1, le=1000),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    items, total = await attachment_service.list_attachments(
        db=db,
        table_id=table_id,
        search=search,
        file_type=file_type,
        is_deleted=is_deleted,
        skip=skip,
        limit=limit,
    )
    formatted = []
    for it in items:
        versions_list = [
            AttachmentVersionResponse(
                id=v.id,
                version_number=v.version_number,
                file_size_bytes=v.file_size_bytes,
                sha256_hash=v.sha256_hash,
                change_summary=v.change_summary,
                created_at=v.created_at,
                created_by_username=v.creator.username if v.creator else None,
            )
            for v in (it.versions or [])
        ]
        formatted.append(
            AttachmentResponse(
                id=it.id,
                original_filename=it.original_filename,
                file_size_bytes=it.file_size_bytes,
                content_type=it.content_type,
                sha256_hash=it.sha256_hash,
                version=it.version,
                is_deleted=it.is_deleted,
                deleted_at=it.deleted_at,
                deleted_by_username=it.deleter.username if it.deleter else None,
                table_id=it.table_id,
                record_id=it.record_id,
                column_id=it.column_id,
                created_at=it.created_at,
                updated_at=it.updated_at,
                uploaded_by_username=it.uploader.username if it.uploader else None,
                versions=versions_list,
            )
        )
    return AttachmentListResponse(items=formatted, total=total)


@router.post("/upload", response_model=AttachmentResponse)
async def upload_attachment(
    table_id: Optional[UUID] = Form(None),
    record_id: Optional[UUID] = Form(None),
    column_id: Optional[UUID] = Form(None),
    file: UploadFile = File(...),
    request: Request = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    file_bytes = await file.read()
    ip_address, user_agent = await get_client_info(request) if request else (None, None)

    attachment = await attachment_service.save_attachment(
        db=db,
        table_id=table_id,
        record_id=record_id,
        column_id=column_id,
        filename=file.filename,
        content_type=file.content_type or "application/octet-stream",
        file_bytes=file_bytes,
        user=current_user,
        ip_address=ip_address,
        user_agent=user_agent,
    )

    return AttachmentResponse(
        id=attachment.id,
        original_filename=attachment.original_filename,
        file_size_bytes=attachment.file_size_bytes,
        content_type=attachment.content_type,
        sha256_hash=attachment.sha256_hash,
        version=attachment.version,
        table_id=attachment.table_id,
        record_id=attachment.record_id,
        column_id=attachment.column_id,
        created_at=attachment.created_at,
        updated_at=attachment.updated_at,
        uploaded_by_username=current_user.username,
        versions=[
            AttachmentVersionResponse(
                id=v.id,
                version_number=v.version_number,
                file_size_bytes=v.file_size_bytes,
                sha256_hash=v.sha256_hash,
                change_summary=v.change_summary,
                created_at=v.created_at,
                created_by_username=current_user.username,
            )
            for v in attachment.versions
        ],
    )


@router.get("/audit-logs", response_model=List[AttachmentAuditLogItem])
async def get_attachment_audit_logs(
    limit: int = Query(150, ge=1, le=1000),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Retrieve document deletion and modification audit trail logs."""
    logs = await attachment_service.get_attachment_audit_logs(db=db, limit=limit)
    return [AttachmentAuditLogItem.model_validate(l) for l in logs]


@router.post("/bulk-delete")
async def bulk_delete_attachments(
    payload: BulkAttachmentActionRequest,
    request: Request = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Move multiple documents to trash."""
    ip_address, user_agent = await get_client_info(request) if request else (None, None)
    for aid in payload.attachment_ids:
        try:
            await attachment_service.delete_attachment(
                db=db, attachment_id=aid, user=current_user, ip_address=ip_address, user_agent=user_agent
            )
        except Exception:
            pass
    return {"status": "success", "message": f"Moved {len(payload.attachment_ids)} documents to trash."}


@router.post("/bulk-restore")
async def bulk_restore_attachments(
    payload: BulkAttachmentActionRequest,
    request: Request = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Restore multiple documents from trash back to active."""
    ip_address, user_agent = await get_client_info(request) if request else (None, None)
    for aid in payload.attachment_ids:
        try:
            await attachment_service.restore_attachment(
                db=db, attachment_id=aid, user=current_user, ip_address=ip_address, user_agent=user_agent
            )
        except Exception:
            pass
    return {"status": "success", "message": f"Restored {len(payload.attachment_ids)} documents successfully."}


@router.post("/bulk-permanent")
async def bulk_permanent_delete_attachments(
    payload: BulkAttachmentActionRequest,
    request: Request = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Permanently delete multiple documents from trash."""
    ip_address, user_agent = await get_client_info(request) if request else (None, None)
    for aid in payload.attachment_ids:
        try:
            await attachment_service.permanent_delete_attachment(
                db=db, attachment_id=aid, user=current_user, ip_address=ip_address, user_agent=user_agent
            )
        except Exception:
            pass
    return {"status": "success", "message": f"Permanently deleted {len(payload.attachment_ids)} documents."}


@router.get("/{attachment_id}", response_model=AttachmentResponse)
async def get_attachment_info(
    attachment_id: UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    items, _ = await attachment_service.list_attachments(db=db, limit=1)
    # direct query
    from sqlalchemy import select
    from app.core.exceptions import NotFoundException
    from app.models.file_attachment import FileAttachment

    res = await db.execute(select(FileAttachment).where(FileAttachment.id == attachment_id))
    it = res.scalar_one_or_none()
    if not it:
        raise NotFoundException("Document not found.")

    versions_list = [
        AttachmentVersionResponse(
            id=v.id,
            version_number=v.version_number,
            file_size_bytes=v.file_size_bytes,
            sha256_hash=v.sha256_hash,
            change_summary=v.change_summary,
            created_at=v.created_at,
            created_by_username=v.creator.username if v.creator else None,
        )
        for v in (it.versions or [])
    ]
    return AttachmentResponse(
        id=it.id,
        original_filename=it.original_filename,
        file_size_bytes=it.file_size_bytes,
        content_type=it.content_type,
        sha256_hash=it.sha256_hash,
        version=it.version,
        table_id=it.table_id,
        record_id=it.record_id,
        column_id=it.column_id,
        created_at=it.created_at,
        updated_at=it.updated_at,
        uploaded_by_username=it.uploader.username if it.uploader else None,
        versions=versions_list,
    )


@router.get("/{attachment_id}/preview")
async def preview_attachment(
    attachment_id: UUID,
    version: Optional[int] = Query(None),
    request: Request = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Inline streaming endpoint for PDF and Word previews with range support."""
    ip_address, user_agent = await get_client_info(request) if request else (None, None)
    file_path, content_type, filename = await attachment_service.get_attachment_preview(
        db=db,
        attachment_id=attachment_id,
        user=current_user,
        version_number=version,
        ip_address=ip_address,
        user_agent=user_agent,
    )

    return FileResponse(
        path=file_path,
        media_type=content_type,
        filename=filename,
        content_disposition_type="inline",
        headers={
            "Accept-Ranges": "bytes",
            "Cache-Control": "private, max-age=300",
        },
    )


@router.get("/{attachment_id}/download")
async def download_attachment(
    attachment_id: UUID,
    version: Optional[int] = Query(None),
    request: Request = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    ip_address, user_agent = await get_client_info(request) if request else (None, None)
    data, content_type, filename = await attachment_service.get_attachment(
        db=db,
        attachment_id=attachment_id,
        user=current_user,
        version_number=version,
        ip_address=ip_address,
        user_agent=user_agent,
    )
    return Response(
        content=data,
        media_type=content_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


@router.put("/{attachment_id}/save", response_model=AttachmentResponse)
async def save_document(
    attachment_id: UUID,
    file: UploadFile = File(...),
    change_summary: Optional[str] = Form(None),
    request: Request = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Save an edited Word or PDF document, creating a new version snapshot."""
    file_bytes = await file.read()
    ip_address, user_agent = await get_client_info(request) if request else (None, None)

    updated = await attachment_service.save_edited_document(
        db=db,
        attachment_id=attachment_id,
        file_bytes=file_bytes,
        change_summary=change_summary,
        user=current_user,
        ip_address=ip_address,
        user_agent=user_agent,
    )

    versions_list = [
        AttachmentVersionResponse(
            id=v.id,
            version_number=v.version_number,
            file_size_bytes=v.file_size_bytes,
            sha256_hash=v.sha256_hash,
            change_summary=v.change_summary,
            created_at=v.created_at,
            created_by_username=v.creator.username if v.creator else None,
        )
        for v in (updated.versions or [])
    ]

    return AttachmentResponse(
        id=updated.id,
        original_filename=updated.original_filename,
        file_size_bytes=updated.file_size_bytes,
        content_type=updated.content_type,
        sha256_hash=updated.sha256_hash,
        version=updated.version,
        table_id=updated.table_id,
        record_id=updated.record_id,
        column_id=updated.column_id,
        created_at=updated.created_at,
        updated_at=updated.updated_at,
        uploaded_by_username=current_user.username,
        versions=versions_list,
    )


@router.post("/{attachment_id}/revert/{version_id}", response_model=AttachmentResponse)
async def revert_document_version(
    attachment_id: UUID,
    version_id: UUID,
    request: Request = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    ip_address, user_agent = await get_client_info(request) if request else (None, None)
    reverted = await attachment_service.revert_to_version(
        db=db,
        attachment_id=attachment_id,
        version_id=version_id,
        user=current_user,
        ip_address=ip_address,
        user_agent=user_agent,
    )

    versions_list = [
        AttachmentVersionResponse(
            id=v.id,
            version_number=v.version_number,
            file_size_bytes=v.file_size_bytes,
            sha256_hash=v.sha256_hash,
            change_summary=v.change_summary,
            created_at=v.created_at,
            created_by_username=v.creator.username if v.creator else None,
        )
        for v in (reverted.versions or [])
    ]

    return AttachmentResponse(
        id=reverted.id,
        original_filename=reverted.original_filename,
        file_size_bytes=reverted.file_size_bytes,
        content_type=reverted.content_type,
        sha256_hash=reverted.sha256_hash,
        version=reverted.version,
        table_id=reverted.table_id,
        record_id=reverted.record_id,
        column_id=reverted.column_id,
        created_at=reverted.created_at,
        updated_at=reverted.updated_at,
        uploaded_by_username=current_user.username,
        versions=versions_list,
    )


@router.post("/{attachment_id}/restore", response_model=AttachmentResponse)
async def restore_attachment(
    attachment_id: UUID,
    request: Request = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Restore a document from trash back to active."""
    ip_address, user_agent = await get_client_info(request) if request else (None, None)
    att = await attachment_service.restore_attachment(
        db=db, attachment_id=attachment_id, user=current_user, ip_address=ip_address, user_agent=user_agent
    )
    return AttachmentResponse(
        id=att.id,
        original_filename=att.original_filename,
        file_size_bytes=att.file_size_bytes,
        content_type=att.content_type,
        sha256_hash=att.sha256_hash,
        version=att.version,
        is_deleted=att.is_deleted,
        deleted_at=att.deleted_at,
        table_id=att.table_id,
        record_id=att.record_id,
        column_id=att.column_id,
        created_at=att.created_at,
        updated_at=att.updated_at,
        uploaded_by_username=att.uploader.username if att.uploader else None,
    )


@router.delete("/{attachment_id}")
async def delete_attachment(
    attachment_id: UUID,
    request: Request = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Soft delete document to trash."""
    ip_address, user_agent = await get_client_info(request) if request else (None, None)
    await attachment_service.delete_attachment(
        db=db,
        attachment_id=attachment_id,
        user=current_user,
        ip_address=ip_address,
        user_agent=user_agent,
    )
    return {"status": "success", "message": "Document moved to trash successfully."}


@router.delete("/{attachment_id}/permanent")
async def permanent_delete_attachment(
    attachment_id: UUID,
    request: Request = None,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Permanently erase document from disk and database."""
    ip_address, user_agent = await get_client_info(request) if request else (None, None)
    await attachment_service.permanent_delete_attachment(
        db=db,
        attachment_id=attachment_id,
        user=current_user,
        ip_address=ip_address,
        user_agent=user_agent,
    )
    return {"status": "success", "message": "Document permanently deleted."}
