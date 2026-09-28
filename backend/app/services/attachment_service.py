import hashlib
import os
import shutil
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional, Tuple
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import desc, func, or_, select

from app.core.config import settings
from app.core.exceptions import ForbiddenException, NotFoundException, ValidationException
from app.models.audit_log import AuditAction, AuditLog
from app.models.file_attachment import AttachmentVersion, FileAttachment
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
        table_id: Optional[UUID],
        record_id: Optional[UUID],
        column_id: Optional[UUID],
        filename: str,
        content_type: str,
        file_bytes: bytes,
        user: User,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
    ) -> FileAttachment:
        max_bytes = settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024
        if len(file_bytes) > max_bytes:
            raise ValidationException(f"File size exceeds maximum limit of {settings.MAX_UPLOAD_SIZE_MB}MB.")

        ext = filename.split(".")[-1].lower() if "." in filename else ""
        if ext not in settings.ALLOWED_FILE_TYPES:
            raise ValidationException(
                f"File extension '.{ext}' is not permitted. Allowed: {', '.join(settings.ALLOWED_FILE_TYPES)}"
            )

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
            version=1,
            uploaded_by_id=user.id,
        )
        db.add(attachment)
        await db.flush()

        # Create initial Version 1 snapshot
        initial_version = AttachmentVersion(
            attachment_id=attachment.id,
            version_number=1,
            stored_filename=unique_stored_name,
            file_size_bytes=len(file_bytes),
            sha256_hash=sha256,
            change_summary="Initial upload",
            created_by_id=user.id,
        )
        db.add(initial_version)

        await audit_service.log_event(
            db=db,
            action=AuditAction.FILE_UPLOADED,
            username=user.username,
            user_id=user.id,
            table_id=table_id,
            record_id=record_id,
            ip_address=ip_address,
            user_agent=user_agent,
            details={"filename": filename, "size": len(file_bytes), "hash": sha256, "version": 1},
        )
        await db.commit()
        await db.refresh(attachment)
        return attachment

    @staticmethod
    async def get_attachment(
        db: AsyncSession,
        attachment_id: UUID,
        user: User,
        version_number: Optional[int] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
    ) -> Tuple[bytes, str, str]:
        res = await db.execute(select(FileAttachment).where(FileAttachment.id == attachment_id))
        att = res.scalar_one_or_none()
        if not att:
            raise NotFoundException("File attachment not found.")

        upload_dir = AttachmentService._ensure_upload_dir()
        target_filename = att.stored_filename

        if version_number and version_number != att.version:
            v_res = await db.execute(
                select(AttachmentVersion).where(
                    AttachmentVersion.attachment_id == attachment_id,
                    AttachmentVersion.version_number == version_number,
                )
            )
            v_obj = v_res.scalar_one_or_none()
            if not v_obj:
                raise NotFoundException(f"Version {version_number} of file not found.")
            target_filename = v_obj.stored_filename

        file_path = os.path.join(upload_dir, target_filename)
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
            details={
                "filename": att.original_filename,
                "size": len(data),
                "version": version_number or att.version,
            },
        )
        await db.commit()

        return data, att.content_type, att.original_filename

    @staticmethod
    async def get_attachment_preview(
        db: AsyncSession,
        attachment_id: UUID,
        user: User,
        version_number: Optional[int] = None,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
    ) -> Tuple[str, str, str]:
        """Return (file_path, content_type, original_filename) for inline previewing without full memory loading."""
        res = await db.execute(select(FileAttachment).where(FileAttachment.id == attachment_id))
        att = res.scalar_one_or_none()
        if not att:
            raise NotFoundException("File attachment not found.")

        upload_dir = AttachmentService._ensure_upload_dir()
        target_filename = att.stored_filename

        if version_number and version_number != att.version:
            v_res = await db.execute(
                select(AttachmentVersion).where(
                    AttachmentVersion.attachment_id == attachment_id,
                    AttachmentVersion.version_number == version_number,
                )
            )
            v_obj = v_res.scalar_one_or_none()
            if not v_obj:
                raise NotFoundException(f"Version {version_number} not found.")
            target_filename = v_obj.stored_filename

        file_path = os.path.join(upload_dir, target_filename)
        if not os.path.exists(file_path):
            raise NotFoundException("Attachment file not found on disk.")

        await audit_service.log_event(
            db=db,
            action=AuditAction.DOCUMENT_VIEWED,
            username=user.username,
            user_id=user.id,
            table_id=att.table_id,
            record_id=att.record_id,
            ip_address=ip_address,
            user_agent=user_agent,
            details={
                "filename": att.original_filename,
                "version": version_number or att.version,
                "type": att.content_type,
            },
        )
        await db.commit()
        return file_path, att.content_type, att.original_filename

    @staticmethod
    async def save_edited_document(
        db: AsyncSession,
        attachment_id: UUID,
        file_bytes: bytes,
        change_summary: Optional[str],
        user: User,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
    ) -> FileAttachment:
        res = await db.execute(select(FileAttachment).where(FileAttachment.id == attachment_id))
        att = res.scalar_one_or_none()
        if not att:
            raise NotFoundException("Document not found.")

        max_bytes = settings.MAX_UPLOAD_SIZE_MB * 1024 * 1024
        if len(file_bytes) > max_bytes:
            raise ValidationException(f"File size exceeds maximum limit of {settings.MAX_UPLOAD_SIZE_MB}MB.")

        sha256 = hashlib.sha256(file_bytes).hexdigest()
        new_version_num = att.version + 1
        new_stored_name = f"{uuid.uuid4().hex}_v{new_version_num}_{att.original_filename}"
        upload_dir = AttachmentService._ensure_upload_dir()
        new_file_path = os.path.join(upload_dir, new_stored_name)

        with open(new_file_path, "wb") as f:
            f.write(file_bytes)

        # Update attachment active pointer
        att.stored_filename = new_stored_name
        att.file_size_bytes = len(file_bytes)
        att.sha256_hash = sha256
        att.version = new_version_num

        # Create new version record
        new_version = AttachmentVersion(
            attachment_id=att.id,
            version_number=new_version_num,
            stored_filename=new_stored_name,
            file_size_bytes=len(file_bytes),
            sha256_hash=sha256,
            change_summary=change_summary or f"Updated via Document Studio (v{new_version_num})",
            created_by_id=user.id,
        )
        db.add(new_version)

        await audit_service.log_event(
            db=db,
            action=AuditAction.DOCUMENT_EDITED,
            username=user.username,
            user_id=user.id,
            table_id=att.table_id,
            record_id=att.record_id,
            ip_address=ip_address,
            user_agent=user_agent,
            details={
                "filename": att.original_filename,
                "version": new_version_num,
                "summary": change_summary,
                "size": len(file_bytes),
            },
        )
        await db.commit()
        await db.refresh(att)
        return att

    @staticmethod
    async def revert_to_version(
        db: AsyncSession,
        attachment_id: UUID,
        version_id: UUID,
        user: User,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
    ) -> FileAttachment:
        res = await db.execute(select(FileAttachment).where(FileAttachment.id == attachment_id))
        att = res.scalar_one_or_none()
        if not att:
            raise NotFoundException("Document not found.")

        v_res = await db.execute(
            select(AttachmentVersion).where(
                AttachmentVersion.attachment_id == attachment_id,
                AttachmentVersion.id == version_id,
            )
        )
        target_version = v_res.scalar_one_or_none()
        if not target_version:
            raise NotFoundException("Target version snapshot not found.")

        upload_dir = AttachmentService._ensure_upload_dir()
        source_path = os.path.join(upload_dir, target_version.stored_filename)
        if not os.path.exists(source_path):
            raise NotFoundException("Source snapshot file not found on disk.")

        with open(source_path, "rb") as f:
            target_bytes = f.read()

        new_version_num = att.version + 1
        new_stored_name = f"{uuid.uuid4().hex}_v{new_version_num}_{att.original_filename}"
        new_file_path = os.path.join(upload_dir, new_stored_name)

        with open(new_file_path, "wb") as f:
            f.write(target_bytes)

        att.stored_filename = new_stored_name
        att.file_size_bytes = len(target_bytes)
        att.sha256_hash = target_version.sha256_hash
        att.version = new_version_num

        revert_version = AttachmentVersion(
            attachment_id=att.id,
            version_number=new_version_num,
            stored_filename=new_stored_name,
            file_size_bytes=len(target_bytes),
            sha256_hash=target_version.sha256_hash,
            change_summary=f"Reverted to version {target_version.version_number}",
            created_by_id=user.id,
        )
        db.add(revert_version)

        await audit_service.log_event(
            db=db,
            action=AuditAction.DOCUMENT_REVERTED,
            username=user.username,
            user_id=user.id,
            table_id=att.table_id,
            record_id=att.record_id,
            ip_address=ip_address,
            user_agent=user_agent,
            details={
                "filename": att.original_filename,
                "reverted_from_version": target_version.version_number,
                "new_version": new_version_num,
            },
        )
        await db.commit()
        await db.refresh(att)
        return att

    @staticmethod
    async def list_attachments(
        db: AsyncSession,
        table_id: Optional[UUID] = None,
        search: Optional[str] = None,
        file_type: Optional[str] = None,
        is_deleted: Optional[bool] = False,
        skip: int = 0,
        limit: int = 50,
    ) -> Tuple[List[FileAttachment], int]:
        query = select(FileAttachment)
        if is_deleted is not None:
            query = query.where(FileAttachment.is_deleted == is_deleted)
        if table_id:
            query = query.where(FileAttachment.table_id == table_id)
        if search:
            query = query.where(FileAttachment.original_filename.ilike(f"%{search}%"))
        if file_type:
            ft = file_type.lower()
            if ft == "pdf":
                query = query.where(
                    or_(
                        FileAttachment.content_type.ilike("%pdf%"),
                        FileAttachment.original_filename.ilike("%.pdf"),
                    )
                )
            elif ft in ("word", "docx"):
                query = query.where(
                    or_(
                        FileAttachment.content_type.ilike("%word%"),
                        FileAttachment.content_type.ilike("%officedocument%"),
                        FileAttachment.original_filename.ilike("%.docx"),
                    )
                )

        count_query = select(func.count()).select_from(query.subquery())
        total_res = await db.execute(count_query)
        total = total_res.scalar() or 0

        query = query.order_by(desc(FileAttachment.created_at)).offset(skip).limit(limit)
        res = await db.execute(query)
        items = res.scalars().all()
        return items, total

    @staticmethod
    async def delete_attachment(
        db: AsyncSession,
        attachment_id: UUID,
        user: User,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
    ) -> bool:
        """Soft deletes an attachment by marking is_deleted = True."""
        res = await db.execute(select(FileAttachment).where(FileAttachment.id == attachment_id))
        att = res.scalar_one_or_none()
        if not att:
            raise NotFoundException("Document not found.")

        att.is_deleted = True
        att.deleted_at = datetime.now(timezone.utc)
        att.deleted_by_id = user.id

        await audit_service.log_event(
            db=db,
            action=AuditAction.DOCUMENT_DELETED,
            username=user.username,
            user_id=user.id,
            table_id=att.table_id,
            record_id=att.record_id,
            ip_address=ip_address,
            user_agent=user_agent,
            details={"filename": att.original_filename, "action": "MOVE_TO_TRASH"},
        )

        await db.commit()
        return True

    @staticmethod
    async def restore_attachment(
        db: AsyncSession,
        attachment_id: UUID,
        user: User,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
    ) -> FileAttachment:
        """Restores a soft-deleted attachment back to active status."""
        res = await db.execute(select(FileAttachment).where(FileAttachment.id == attachment_id))
        att = res.scalar_one_or_none()
        if not att:
            raise NotFoundException("Document not found.")

        att.is_deleted = False
        att.deleted_at = None
        att.deleted_by_id = None

        await audit_service.log_event(
            db=db,
            action=AuditAction.DOCUMENT_EDITED,
            username=user.username,
            user_id=user.id,
            table_id=att.table_id,
            record_id=att.record_id,
            ip_address=ip_address,
            user_agent=user_agent,
            details={"filename": att.original_filename, "action": "RESTORED_FROM_TRASH"},
        )

        await db.commit()
        await db.refresh(att)
        return att

    @staticmethod
    async def permanent_delete_attachment(
        db: AsyncSession,
        attachment_id: UUID,
        user: User,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
    ) -> bool:
        """Permanently deletes document file from disk and database."""
        res = await db.execute(select(FileAttachment).where(FileAttachment.id == attachment_id))
        att = res.scalar_one_or_none()
        if not att:
            raise NotFoundException("Document not found.")

        upload_dir = AttachmentService._ensure_upload_dir()
        main_path = os.path.join(upload_dir, att.stored_filename)
        if os.path.exists(main_path):
            try:
                os.remove(main_path)
            except Exception:
                pass

        for v in att.versions:
            v_path = os.path.join(upload_dir, v.stored_filename)
            if os.path.exists(v_path) and v_path != main_path:
                try:
                    os.remove(v_path)
                except Exception:
                    pass

        await audit_service.log_event(
            db=db,
            action=AuditAction.DOCUMENT_DELETED,
            username=user.username,
            user_id=user.id,
            table_id=att.table_id,
            record_id=att.record_id,
            ip_address=ip_address,
            user_agent=user_agent,
            details={"filename": att.original_filename, "action": "PERMANENT_ERASE"},
        )

        await db.delete(att)
        await db.commit()
        return True

    @staticmethod
    async def get_attachment_audit_logs(
        db: AsyncSession,
        limit: int = 150,
    ) -> List[Dict[str, Any]]:
        """Fetches document-related activity & deletion logs."""
        doc_actions = [
            AuditAction.DOCUMENT_DELETED,
            AuditAction.DOCUMENT_EDITED,
            AuditAction.DOCUMENT_REVERTED,
            AuditAction.FILE_UPLOADED,
        ]
        q = (
            select(AuditLog)
            .where(AuditLog.action.in_(doc_actions))
            .order_by(desc(AuditLog.timestamp))
            .limit(limit)
        )
        res = await db.execute(q)
        logs = res.scalars().all()
        out = []
        for l in logs:
            filename = None
            if l.details and isinstance(l.details, dict):
                filename = l.details.get("filename")
            out.append({
                "id": l.id,
                "timestamp": l.timestamp,
                "action": l.action.value,
                "username": l.username,
                "filename": filename,
                "details": l.details,
                "ip_address": l.ip_address,
            })
        return out


attachment_service = AttachmentService()
