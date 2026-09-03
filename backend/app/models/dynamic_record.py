from sqlalchemy import Boolean, Column, ForeignKey, Integer
from sqlalchemy.types import JSON
from sqlalchemy.orm import relationship

from app.core.database import Base
from app.models.base import GUID, TimestampMixin, UUIDMixin


class DataRecord(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "data_records"

    table_id = Column(GUID(), ForeignKey("data_tables.id", ondelete="CASCADE"), nullable=False, index=True)
    # JSON payload mapping column.name -> value or encrypted payload dict
    data = Column(JSON, default=dict, nullable=False)
    version = Column(Integer, default=1, nullable=False)
    is_deleted = Column(Boolean, default=False, nullable=False, index=True)
    
    created_by_id = Column(GUID(), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    updated_by_id = Column(GUID(), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    # Relationships
    table = relationship("DataTable", back_populates="records")
    versions = relationship("RecordVersion", back_populates="record", cascade="all, delete-orphan", order_by="desc(RecordVersion.version_number)")
