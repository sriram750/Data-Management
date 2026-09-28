from sqlalchemy import BigInteger, Boolean, Column, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from app.core.database import Base
from app.models.base import GUID, TimestampMixin, UUIDMixin


class FileAttachment(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "file_attachments"

    table_id = Column(GUID(), ForeignKey("data_tables.id", ondelete="CASCADE"), nullable=True, index=True)
    record_id = Column(GUID(), ForeignKey("data_records.id", ondelete="CASCADE"), nullable=True, index=True)
    column_id = Column(GUID(), ForeignKey("data_columns.id", ondelete="CASCADE"), nullable=True, index=True)
    
    original_filename = Column(String(255), nullable=False)
    stored_filename = Column(String(255), nullable=False, unique=True)
    file_size_bytes = Column(BigInteger, nullable=False)
    content_type = Column(String(128), nullable=False)
    sha256_hash = Column(String(64), nullable=False)
    version = Column(Integer, nullable=False, default=1)
    
    is_deleted = Column(Boolean, default=False, nullable=False, index=True)
    deleted_at = Column(DateTime(timezone=True), nullable=True)
    deleted_by_id = Column(GUID(), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    uploaded_by_id = Column(GUID(), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    # Relationships
    uploader = relationship("User", foreign_keys=[uploaded_by_id], lazy="selectin")
    deleter = relationship("User", foreign_keys=[deleted_by_id], lazy="selectin")
    versions = relationship(
        "AttachmentVersion",
        back_populates="attachment",
        cascade="all, delete-orphan",
        order_by="desc(AttachmentVersion.version_number)",
        lazy="selectin",
    )


class AttachmentVersion(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "attachment_versions"

    attachment_id = Column(GUID(), ForeignKey("file_attachments.id", ondelete="CASCADE"), nullable=False, index=True)
    version_number = Column(Integer, nullable=False)
    stored_filename = Column(String(255), nullable=False)
    file_size_bytes = Column(BigInteger, nullable=False)
    sha256_hash = Column(String(64), nullable=False)
    change_summary = Column(String(255), nullable=True)

    created_by_id = Column(GUID(), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    # Relationships
    creator = relationship("User", foreign_keys=[created_by_id], lazy="selectin")
    attachment = relationship("FileAttachment", back_populates="versions")
