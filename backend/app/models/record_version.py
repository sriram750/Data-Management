import enum
from sqlalchemy import Column, Enum, ForeignKey, Integer
from sqlalchemy.types import JSON
from sqlalchemy.orm import relationship

from app.core.database import Base
from app.models.base import GUID, TimestampMixin, UUIDMixin


class ChangeType(str, enum.Enum):
    CREATE = "CREATE"
    UPDATE = "UPDATE"
    RESTORE = "RESTORE"
    DELETE = "DELETE"


class RecordVersion(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "record_versions"

    record_id = Column(GUID(), ForeignKey("data_records.id", ondelete="CASCADE"), nullable=False, index=True)
    table_id = Column(GUID(), ForeignKey("data_tables.id", ondelete="CASCADE"), nullable=False, index=True)
    version_number = Column(Integer, nullable=False)
    
    data_snapshot = Column(JSON, nullable=False)  # Full record snapshot at this version
    delta = Column(JSON, nullable=True)  # Field level delta: {"field_name": {"old": ..., "new": ...}}
    change_type = Column(Enum(ChangeType), default=ChangeType.UPDATE, nullable=False)
    changed_by_id = Column(GUID(), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    # Relationships
    record = relationship("DataRecord", back_populates="versions")
