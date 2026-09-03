import enum
from sqlalchemy import Boolean, Column, DateTime, Enum, ForeignKey, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.types import JSON
from sqlalchemy.orm import relationship

from app.core.database import Base
from app.models.base import GUID, TimestampMixin, UUIDMixin


class ColumnPermissionLevel(str, enum.Enum):
    DENIED = "DENIED"
    VIEW = "VIEW"
    VIEW_EDIT = "VIEW_EDIT"


class Role(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "roles"

    name = Column(String(64), unique=True, index=True, nullable=False)
    display_name = Column(String(128), nullable=False)
    description = Column(Text, nullable=True)
    is_system = Column(Boolean, default=False, nullable=False)

    # Relationships
    user_roles = relationship("UserRole", back_populates="role", cascade="all, delete-orphan")
    role_permissions = relationship("RolePermission", back_populates="role", cascade="all, delete-orphan", lazy="selectin")
    table_permissions = relationship("TablePermission", back_populates="role", cascade="all, delete-orphan")
    column_permissions = relationship("ColumnPermission", back_populates="role", cascade="all, delete-orphan")


class Permission(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "permissions"

    code = Column(String(64), unique=True, index=True, nullable=False)
    name = Column(String(128), nullable=False)
    category = Column(String(64), nullable=False, index=True)
    description = Column(Text, nullable=True)

    # Relationships
    role_permissions = relationship("RolePermission", back_populates="permission", cascade="all, delete-orphan")


class UserRole(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "user_roles"

    user_id = Column(GUID(), ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    role_id = Column(GUID(), ForeignKey("roles.id", ondelete="CASCADE"), nullable=False, index=True)

    user = relationship("User", back_populates="roles")
    role = relationship("Role", back_populates="user_roles", lazy="selectin")


class RolePermission(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "role_permissions"

    role_id = Column(GUID(), ForeignKey("roles.id", ondelete="CASCADE"), nullable=False, index=True)
    permission_id = Column(GUID(), ForeignKey("permissions.id", ondelete="CASCADE"), nullable=False, index=True)

    role = relationship("Role", back_populates="role_permissions")
    permission = relationship("Permission", back_populates="role_permissions", lazy="selectin")


class TablePermission(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "table_permissions"

    table_id = Column(GUID(), ForeignKey("data_tables.id", ondelete="CASCADE"), nullable=False, index=True)
    role_id = Column(GUID(), ForeignKey("roles.id", ondelete="CASCADE"), nullable=True, index=True)
    user_id = Column(GUID(), ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True)

    # Explicit separation of Data Permissions and Schema Permissions
    can_view_records = Column(Boolean, default=True, nullable=False)
    can_add_records = Column(Boolean, default=False, nullable=False)
    can_edit_records = Column(Boolean, default=False, nullable=False)
    can_delete_records = Column(Boolean, default=False, nullable=False)
    
    can_manage_columns = Column(Boolean, default=False, nullable=False)
    can_manage_permissions = Column(Boolean, default=False, nullable=False)
    can_import = Column(Boolean, default=False, nullable=False)
    can_export = Column(Boolean, default=False, nullable=False)

    role = relationship("Role", back_populates="table_permissions")
    table = relationship("DataTable", back_populates="permissions")
    user = relationship("User", foreign_keys=[user_id])


class ColumnPermission(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "column_permissions"

    column_id = Column(GUID(), ForeignKey("data_columns.id", ondelete="CASCADE"), nullable=False, index=True)
    role_id = Column(GUID(), ForeignKey("roles.id", ondelete="CASCADE"), nullable=True, index=True)
    user_id = Column(GUID(), ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True)
    permission_level = Column(Enum(ColumnPermissionLevel), default=ColumnPermissionLevel.VIEW, nullable=False)

    role = relationship("Role", back_populates="column_permissions")
    column = relationship("DataColumn", back_populates="permissions")
    user = relationship("User", foreign_keys=[user_id])


class RecordLevelRule(Base, UUIDMixin, TimestampMixin):
    __tablename__ = "record_level_rules"

    table_id = Column(GUID(), ForeignKey("data_tables.id", ondelete="CASCADE"), nullable=False, index=True)
    role_id = Column(GUID(), ForeignKey("roles.id", ondelete="CASCADE"), nullable=True, index=True)
    user_id = Column(GUID(), ForeignKey("users.id", ondelete="CASCADE"), nullable=True, index=True)
    rule_name = Column(String(128), nullable=False)
    rule_expression = Column(JSON, nullable=False)  # JSON filter expression e.g. {"field": "Location", "eq": "Chennai"}
