import enum
from sqlalchemy import Boolean, Column, Enum, ForeignKey, Integer, String, Text
from sqlalchemy.types import JSON
from sqlalchemy.orm import relationship

from app.core.database import Base
from app.models.base import GUID, TimestampMixin, UUIDMixin


class ColumnType(str, enum.Enum):
    TEXT = "TEXT"
    LONG_TEXT = "LONG_TEXT"
    NUMBER = "NUMBER"
    DECIMAL = "DECIMAL"
    CURRENCY = "CURRENCY"
    DATE = "DATE"
    DATETIME = "DATETIME"
    EMAIL = "EMAIL"
    PHONE = "PHONE"
    IP_ADDRESS = "IP_ADDRESS"
    URL = "URL"
    PASSWORD = "PASSWORD"
    BOOLEAN = "BOOLEAN"
    DROPDOWN = "DROPDOWN"
    MULTI_SELECT = "MULTI_SELECT"
    USER = "USER"
    FILE = "FILE"
    MIXED = "MIXED"
    ALPHANUMERIC = "ALPHANUMERIC"


class DataColumn(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "data_columns"

    table_id = Column(GUID(), ForeignKey("data_tables.id", ondelete="CASCADE"), nullable=False, index=True)
    name = Column(String(128), nullable=False)  # Column system key/identifier (unique within table)
    display_name = Column(String(255), nullable=False)
    data_type = Column(Enum(ColumnType), default=ColumnType.TEXT, nullable=False)
    
    is_required = Column(Boolean, default=False, nullable=False)
    is_sensitive = Column(Boolean, default=False, nullable=False)  # If True, masked in UI and requires special view permission
    is_encrypted = Column(Boolean, default=False, nullable=False)  # If True, encrypted via AES-256-GCM
    is_hidden = Column(Boolean, default=False, nullable=False)
    
    default_value = Column(Text, nullable=True)
    validation_rules = Column(JSON, nullable=True)  # e.g., {"min": 0, "max": 100, "regex": "...", "options": ["Option A", "Option B"]}
    display_order = Column(Integer, default=0, nullable=False)

    # Relationships
    table = relationship("DataTable", back_populates="columns")
    permissions = relationship("ColumnPermission", back_populates="column", cascade="all, delete-orphan")
