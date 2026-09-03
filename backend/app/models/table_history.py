from sqlalchemy import Column, DateTime, ForeignKey, String
from sqlalchemy.types import JSON
from sqlalchemy.orm import relationship

from app.core.database import Base
from app.models.base import GUID, UUIDMixin, utc_now


class TableHistory(Base, UUIDMixin):
    __tablename__ = "table_history"

    table_id = Column(GUID(), ForeignKey("data_tables.id", ondelete="CASCADE"), nullable=False, index=True)
    action = Column(String(64), nullable=False, index=True)  # TABLE_CREATED, COLUMN_ADDED, COLUMN_RENAMED, etc.
    details = Column(JSON, nullable=False)  # who, what, old_config, new_config
    changed_by_id = Column(GUID(), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    changed_by_username = Column(String(64), nullable=True)
    timestamp = Column(DateTime(timezone=True), default=utc_now, nullable=False, index=True)

    # Relationships
    table = relationship("DataTable", back_populates="history")
