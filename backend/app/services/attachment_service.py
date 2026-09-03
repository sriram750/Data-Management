import hashlib
import os
import uuid
from typing import Optional, Tuple
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.config import settings
from app.core.exceptions import ForbiddenException, NotFoundException, ValidationException
from app.models.audit_log import AuditAction
from app.models.file_attachment import FileAttachment
from app.models.user import User
from app.services.audit_service import audit_service


class AttachmentService:
    @staticmethod
    def _ensure_upload_dir() -> str:
        upload_path = os.path.abspath(settings.UPLOAD_STORAGE_PATH)
        os.makedirs(upload_path, exist_ok=True)
        return upload_path

    @staticmethod
    async def save_attachment(
        db: AsyncSession,
        table_id: UUID,
        record_id: Optional[UUID],
        column_id: Optional[UUID],
        filename: str,
        content_type: str,
        file_bytes: bytes,
        user: User,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
    ) -> FileAttachment:
        # Check size
        max_bytes = settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024
        if len(file_bytes) > max_bytes:
            raise ValidationException(f"File size exceeds maximum limit of {settings.MAX_UPLOAD_SIZE_MB}MB.")

        # Check extension
        ext = filename.split(".")[-1].lower() if "." in filename else ""
        if ext not in settings.ALLOWED_FILE_TYPES:
            raise ValidationException(f"File extension '.{ext}' is not permitted. Allowed: {', '.join(settings.ALLOWED_FILE_TYPES)}")

        sha256 = hashlib.sha256(file_bytes).hexdigest()
        unique_stored_name = f"{uuid.uuid4().hex}_{filename}"
        upload_dir = AttachmentService._ensure_upload_dir()
        file_path = os.path.join(upload_dir, unique_stored_name)

        with open(file_path, "wb") as f:
            f.write(file_bytes)

        attachment = FileAttachment(
            table_id=table_id,
            record_id=record_id,
            column_id=column_id,
            original_filename=filename,
            stored_filename=unique_stored_name,
            file_size_bytes=len(file_bytes),
            content_type=content_type or "application/octet-stream",
            sha256_hash=sha256,
            uploaded_by_id=user.id,
        )
        db.add(attachment)

        await audit_service.log_event(
            db=db,
            action=AuditAction.FILE_UPLOADED,
            username=user.username,
            user_id=user.id,
            table_id=table_id,
            record_id=record_id,
            ip_address=ip_address,
            user_agent=user_agent,
            details={"filename": filename, "size": len(file_bytes), "hash": sha256},
        )
        await db.commit()
        await db.refresh(attachment)
        return attachment

    @staticmethod
    async def get_attachment(
        db: AsyncSession,
        attachment_id: UUID,
        user: User,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
    ) -> Tuple[bytes, str, str]:
        res = await db.execute(select(FileAttachment).where(FileAttachment.id == attachment_id))
        att = res.scalar_one_or_none()
        if not att:
            raise NotFoundException("File attachment not found.")

        upload_dir = AttachmentService._ensure_upload_dir()
        file_path = os.path.join(upload_dir, att.stored_filename)
        if not os.path.exists(file_path):
            raise NotFoundException("Attachment file not found on disk.")

        with open(file_path, "rb") as f:
            data = f.read()

        await audit_service.log_event(
            db=db,
            action=AuditAction.FILE_DOWNLOADED,
            username=user.username,
            user_id=user.id,
            table_id=att.table_id,
            record_id=att.record_id,
            ip_address=ip_address,
            user_agent=user_agent,
            details={"filename": att.original_filename, "size": att.file_size_bytes},
        )
        await db.commit()

        return data, att.content_type, att.original_filename


attachment_service = AttachmentService()
