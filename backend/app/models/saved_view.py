from sqlalchemy import Boolean, Column, ForeignKey, String
from sqlalchemy.types import JSON
from sqlalchemy.orm import relationship

from app.core.database import Base
from app.models.base import GUID, TimestampMixin, UUIDMixin


class SavedView(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "saved_views"

    table_id = Column(GUID(), ForeignKey("data_tables.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(GUID(), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(128), nullable=False)
    is_public = Column(Boolean, default=False, nullable=False)
    
    filters = Column(JSON, default=dict, nullable=False)
    sorting = Column(JSON, default=list, nullable=False)
    column_visibility = Column(JSON, default=dict, nullable=False)
    column_widths = Column(JSON, default=dict, nullable=False)

    table = relationship("DataTable", back_populates="saved_views")
