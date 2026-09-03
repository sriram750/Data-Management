import enum
from sqlalchemy import Column, DateTime, Enum, ForeignKey, String, Text
from sqlalchemy.types import JSON
from sqlalchemy.orm import relationship

from app.core.database import Base
from app.models.base import GUID, UUIDMixin, utc_now


class AuditAction(str, enum.Enum):
    LOGIN = "LOGIN"
    LOGOUT = "LOGOUT"
    LOGIN_FAILED = "LOGIN_FAILED"
    
    CREATE = "CREATE"
    UPDATE = "UPDATE"
    DELETE = "DELETE"
    
    IMPORT = "IMPORT"
    EXPORT = "EXPORT"
    
    TABLE_CREATED = "TABLE_CREATED"
    TABLE_UPDATED = "TABLE_UPDATED"
    TABLE_DELETED = "TABLE_DELETED"
    
    COLUMN_CREATED = "COLUMN_CREATED"
    COLUMN_UPDATED = "COLUMN_UPDATED"
    COLUMN_RENAMED = "COLUMN_RENAMED"
    COLUMN_DELETED = "COLUMN_DELETED"
    
    USER_CREATED = "USER_CREATED"
    USER_UPDATED = "USER_UPDATED"
    USER_DELETED = "USER_DELETED"
    
    ROLE_CREATED = "ROLE_CREATED"
    ROLE_UPDATED = "ROLE_UPDATED"
    ROLE_DELETED = "ROLE_DELETED"
    
    PERMISSION_CHANGED = "PERMISSION_CHANGED"
    
    PASSWORD_VIEWED = "PASSWORD_VIEWED"
    PASSWORD_CHANGED = "PASSWORD_CHANGED"
    
    FILE_UPLOADED = "FILE_UPLOADED"
    FILE_DOWNLOADED = "FILE_DOWNLOADED"


class AuditLog(Base, UUIDMixin):
    __tablename__ = "audit_logs"

    # Append-only audit log: no updated_at column
    timestamp = Column(DateTime(timezone=True), default=utc_now, nullable=False, index=True)
    user_id = Column(GUID(), ForeignKey("users.id", ondelete="SET NULL"), nullable=True, index=True)
    username = Column(String(64), nullable=False, index=True)
    
    action = Column(Enum(AuditAction), nullable=False, index=True)
    table_id = Column(GUID(), nullable=True, index=True)
    table_name = Column(String(128), nullable=True, index=True)
    record_id = Column(GUID(), nullable=True, index=True)
    field_name = Column(String(128), nullable=True)
    
    # Old and New value representations (sanitized/redacted for sensitive fields)
    old_value = Column(Text, nullable=True)
    new_value = Column(Text, nullable=True)
    
    ip_address = Column(String(45), nullable=True)
    user_agent = Column(Text, nullable=True)
    details = Column(JSON, nullable=True)  # Additional contextual metadata
