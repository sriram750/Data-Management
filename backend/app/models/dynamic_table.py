from sqlalchemy import Boolean, Column, ForeignKey, String, Text
from sqlalchemy.orm import relationship

from app.core.database import Base
from app.models.base import GUID, TimestampMixin, UUIDMixin


class DataTable(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "data_tables"

    name = Column(String(128), unique=True, index=True, nullable=False)
    display_name = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    is_active = Column(Boolean, default=True, nullable=False, index=True)
    is_favorite = Column(Boolean, default=False, nullable=False)
    
    created_by_id = Column(GUID(), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)
    updated_by_id = Column(GUID(), ForeignKey("users.id", ondelete="SET NULL"), nullable=True)

    # Relationships
    columns = relationship("DataColumn", back_populates="table", cascade="all, delete-orphan", order_by="DataColumn.display_order", lazy="selectin")
    records = relationship("DataRecord", back_populates="table", cascade="all, delete-orphan")
    permissions = relationship("TablePermission", back_populates="table", cascade="all, delete-orphan")
    history = relationship("TableHistory", back_populates="table", cascade="all, delete-orphan")
    saved_views = relationship("SavedView", back_populates="table", cascade="all, delete-orphan")
