from typing import Optional
from uuid import UUID
from fastapi import APIRouter, Depends, File, Form, Request, Response, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.deps import get_client_info, get_current_user, get_db
from app.models.user import User
from app.services.attachment_service import attachment_service

router = APIRouter(prefix="/attachments", tags=["File Attachments"])


@router.post("/upload")
async def upload_attachment(
    table_id: UUID = Form(...),
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
        content_type=file.content_type,
        file_bytes=file_bytes,
        user=current_user,
        ip_address=ip_address,
        user_agent=user_agent,
    )

    return {
        "id": attachment.id,
        "original_filename": attachment.original_filename,
        "file_size_bytes": attachment.file_size_bytes,
        "content_type": attachment.content_type,
    }


@router.get("/{attachment_id}/download")
async def download_attachment(
    attachment_id: UUID,
    request: Request,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    ip_address, user_agent = await get_client_info(request)
    data, content_type, filename = await attachment_service.get_attachment(
        db=db, attachment_id=attachment_id, user=current_user, ip_address=ip_address, user_agent=user_agent
    )
    return Response(
        content=data,
        media_type=content_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
