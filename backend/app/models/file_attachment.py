from sqlalchemy import BigInteger, Column, DateTime, ForeignKey, String
from sqlalchemy.orm import relationship

from app.core.database import Base
from app.models.base import GUID, TimestampMixin, UUIDMixin


class FileAttachment(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "file_attachments"

    table_id = Column(GUID(), ForeignKey("data_tables.id", ondelete="CASCADE"), nullable=False, index=True)
    record_id = Column(GUID(), ForeignKey("data_records.id", ondelete="CASCADE"), nullable=True, index=True)
    column_id = Column(GUID(), ForeignKey("data_columns.id", ondelete="CASCADE"), nullable=True, index=True)
    
    original_filename = Column(String(255), nullable=False)
    stored_filename = Column(String(255), nullable=False, unique=True)
    file_size_bytes = Column(BigInteger, nullable=False)
    content_type = Column(String(128), nullable=False)
    sha256_hash = Column(String(64), nullable=False)
    
    uploaded_by_id = Column(GUID(), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
