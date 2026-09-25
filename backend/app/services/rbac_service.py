from typing import Dict, List, Optional, Set
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload

from app.models.rbac import (
    ColumnPermission,
    ColumnPermissionLevel,
    Permission,
    RecordLevelRule,
    Role,
    RolePermission,
    TablePermission,
    UserRole,
)
from app.models.dynamic_table import DataTable
from app.models.user import User


# System default permissions catalog
DEFAULT_PERMISSIONS = [
    # System
    {"code": "system:manage", "name": "Manage System Settings", "category": "System", "description": "Configure system settings and security policies"},
    # Users
    {"code": "user:read", "name": "View Users", "category": "Users", "description": "View user accounts and profiles"},
    {"code": "user:create", "name": "Create Users", "category": "Users", "description": "Create new user accounts"},
    {"code": "user:update", "name": "Update Users", "category": "Users", "description": "Update user profiles, statuses, and passwords"},
    {"code": "user:delete", "name": "Delete Users", "category": "Users", "description": "Delete or deactivate users"},
    # Roles & Permissions
    {"code": "role:read", "name": "View Roles", "category": "Roles", "description": "View roles and assigned permissions"},
    {"code": "role:manage", "name": "Manage Roles", "category": "Roles", "description": "Create, edit, and assign roles & permissions"},
    # Tables (Schema)
    {"code": "table:read", "name": "View Tables", "category": "Tables", "description": "View tables list and metadata"},
    {"code": "table:create", "name": "Create Tables", "category": "Tables", "description": "Create new tables manually or from Excel"},
    {"code": "table:update", "name": "Update Tables", "category": "Tables", "description": "Rename tables and edit descriptions"},
    {"code": "table:delete", "name": "Delete Tables", "category": "Tables", "description": "Delete dynamic tables"},
    {"code": "table:manage_permissions", "name": "Manage Table Permissions", "category": "Tables", "description": "Grant or revoke table and column permissions"},
    # Columns (Schema)
    {"code": "column:manage", "name": "Manage Columns", "category": "Columns", "description": "Add, modify, rename, and delete columns"},
    # Records (Data)
    {"code": "record:read", "name": "View Records", "category": "Records", "description": "Read records in permitted tables"},
    {"code": "record:create", "name": "Create Records", "category": "Records", "description": "Add new records to tables"},
    {"code": "record:update", "name": "Update Records", "category": "Records", "description": "Modify existing records"},
    {"code": "record:delete", "name": "Delete Records", "category": "Records", "description": "Delete records from tables"},
    # Import / Export
    {"code": "import:execute", "name": "Import Excel", "category": "Import/Export", "description": "Import Excel files into tables"},
    {"code": "export:execute", "name": "Export Data", "category": "Import/Export", "description": "Export permitted data to Excel or CSV"},
    # Audit & Security
    {"code": "audit:read", "name": "View Audit Logs", "category": "Audit", "description": "Read standard audit trails and history"},
    {"code": "audit:sensitive", "name": "View Sensitive Audit Logs", "category": "Audit", "description": "View sensitive access logs (password viewed, etc.)"},
    {"code": "secret:view", "name": "View Sensitive Secrets", "category": "Security", "description": "Temporarily reveal encrypted passwords/secrets"},
]

# System default roles definition
DEFAULT_ROLES = [
    {
        "name": "SUPER_ADMIN",
        "display_name": "Super Administrator",
        "description": "Full unconstrained administrative access to the entire platform.",
        "permissions": [p["code"] for p in DEFAULT_PERMISSIONS],
    },
    {
        "name": "APPLICATION_ADMIN",
        "display_name": "Application Administrator",
        "description": "Can manage users, roles, dynamic tables, columns, import, export, and audit logs.",
        "permissions": [
            "user:read", "user:create", "user:update", "role:read", "role:manage",
            "table:read", "table:create", "table:update", "table:delete", "table:manage_permissions",
            "column:manage", "record:read", "record:create", "record:update", "record:delete",
            "import:execute", "export:execute", "audit:read", "secret:view",
        ],
    },
    {
        "name": "MANAGER",
        "display_name": "Manager",
        "description": "Can view assigned tables, add/edit records, and export permitted data. Cannot modify schema or system security.",
        "permissions": [
            "table:read", "record:read", "record:create", "record:update", "export:execute", "import:execute",
        ],
    },
    {
        "name": "DATA_ENTRY",
        "display_name": "Data Entry",
        "description": "Can view assigned tables and add/edit records. Cannot delete records, modify table structure, or export.",
        "permissions": [
            "table:read", "record:read", "record:create", "record:update",
        ],
    },
    {
        "name": "VIEWER",
        "display_name": "Viewer",
        "description": "Read-only access to permitted tables. Cannot add, edit, delete, or export records.",
        "permissions": [
            "table:read", "record:read",
        ],
    },
    {
        "name": "AUDITOR",
        "display_name": "Auditor",
        "description": "Can view permitted records, audit logs, and version history. Cannot modify data.",
        "permissions": [
            "table:read", "record:read", "audit:read", "audit:sensitive",
        ],
    },
]


class RBACService:
    @staticmethod
    async def initialize_system_roles_and_permissions(db: AsyncSession) -> None:
        """Seed core permissions and system roles if they do not exist."""
        # 1. Seed Permissions
        perm_map: Dict[str, Permission] = {}
        for p_data in DEFAULT_PERMISSIONS:
            result = await db.execute(select(Permission).where(Permission.code == p_data["code"]))
            perm = result.scalar_one_or_none()
            if not perm:
                perm = Permission(
                    code=p_data["code"],
                    name=p_data["name"],
                    category=p_data["category"],
                    description=p_data["description"],
                )
                db.add(perm)
                await db.flush()
            perm_map[perm.code] = perm

        # 2. Seed Roles
        for r_data in DEFAULT_ROLES:
            result = await db.execute(
                select(Role).options(selectinload(Role.role_permissions)).where(Role.name == r_data["name"])
            )
            role = result.scalar_one_or_none()
            if not role:
                role = Role(
                    name=r_data["name"],
                    display_name=r_data["display_name"],
                    description=r_data["description"],
                    is_system=True,
                )
                db.add(role)
                await db.flush()
                
                # Assign permissions to role
                for perm_code in r_data["permissions"]:
                    if perm_code in perm_map:
                        rp = RolePermission(role_id=role.id, permission_id=perm_map[perm_code].id)
                        db.add(rp)
                await db.flush()

    @staticmethod
    async def get_user_permissions(db: AsyncSession, user: User) -> Set[str]:
        """Fetch all effective permission codes for a user."""
        if user.is_super_admin:
            # Super admin has all permissions
            result = await db.execute(select(Permission.code))
            return set(result.scalars().all())

        # Load user roles and their permissions
        result = await db.execute(
            select(Permission.code)
            .join(RolePermission, RolePermission.permission_id == Permission.id)
            .join(Role, Role.id == RolePermission.role_id)
            .join(UserRole, UserRole.role_id == Role.id)
            .where(UserRole.user_id == user.id)
        )
        return set(result.scalars().all())

    @staticmethod
    async def get_effective_table_permission(
        db: AsyncSession, user: User, table_id: UUID
    ) -> Dict[str, bool]:
        """Calculate effective permissions for a user on a specific table."""
        # Super admin has full permissions on all tables
        if user.is_super_admin:
            return {
                "can_view_records": True,
                "can_add_records": True,
                "can_edit_records": True,
                "can_delete_records": True,
                "can_manage_columns": True,
                "can_manage_permissions": True,
                "can_import": True,
                "can_export": True,
            }

        # Check if table is Private: Only Super Admin and table creator can access
        table_obj = await db.get(DataTable, table_id)
        if table_obj and table_obj.is_private:
            is_creator = bool(table_obj.created_by_id and table_obj.created_by_id == user.id)
            if not is_creator:
                return {
                    "can_view_records": False,
                    "can_add_records": False,
                    "can_edit_records": False,
                    "can_delete_records": False,
                    "can_manage_columns": False,
                    "can_manage_permissions": False,
                    "can_import": False,
                    "can_export": False,
                }
            # Creator has full access to their own private table
            return {
                "can_view_records": True,
                "can_add_records": True,
                "can_edit_records": True,
                "can_delete_records": True,
                "can_manage_columns": True,
                "can_manage_permissions": True,
                "can_import": True,
                "can_export": True,
            }

        # Check if user has explicit User-level TablePermission
        user_perm_res = await db.execute(
            select(TablePermission).where(
                TablePermission.table_id == table_id, TablePermission.user_id == user.id
            )
        )
        user_perm = user_perm_res.scalar_one_or_none()
        if user_perm:
            return {
                "can_view_records": user_perm.can_view_records,
                "can_add_records": user_perm.can_add_records,
                "can_edit_records": user_perm.can_edit_records,
                "can_delete_records": user_perm.can_delete_records,
                "can_manage_columns": user_perm.can_manage_columns,
                "can_manage_permissions": user_perm.can_manage_permissions,
                "can_import": user_perm.can_import,
                "can_export": user_perm.can_export,
            }

        # Aggregate across user's roles
        roles_perm_res = await db.execute(
            select(TablePermission)
            .join(UserRole, UserRole.role_id == TablePermission.role_id)
            .where(TablePermission.table_id == table_id, UserRole.user_id == user.id)
        )
        role_perms = roles_perm_res.scalars().all()

        if role_perms:
            # Grant if ANY assigned role grants it
            return {
                "can_view_records": any(p.can_view_records for p in role_perms),
                "can_add_records": any(p.can_add_records for p in role_perms),
                "can_edit_records": any(p.can_edit_records for p in role_perms),
                "can_delete_records": any(p.can_delete_records for p in role_perms),
                "can_manage_columns": any(p.can_manage_columns for p in role_perms),
                "can_manage_permissions": any(p.can_manage_permissions for p in role_perms),
                "can_import": any(p.can_import for p in role_perms),
                "can_export": any(p.can_export for p in role_perms),
            }

        # Check global application-level permissions if no specific table rule exists
        app_perms = await RBACService.get_user_permissions(db, user)
        is_app_admin = "table:manage_permissions" in app_perms
        return {
            "can_view_records": "record:read" in app_perms,
            "can_add_records": "record:create" in app_perms,
            "can_edit_records": "record:update" in app_perms,
            "can_delete_records": "record:delete" in app_perms,
            "can_manage_columns": "column:manage" in app_perms,
            "can_manage_permissions": is_app_admin,
            "can_import": "import:execute" in app_perms,
            "can_export": "export:execute" in app_perms,
        }

    @staticmethod
    async def get_effective_column_permissions(
        db: AsyncSession, user: User, table_id: UUID
    ) -> Dict[UUID, ColumnPermissionLevel]:
        """Returns mapping of column_id -> ColumnPermissionLevel (DENIED, VIEW, VIEW_EDIT)."""
        if user.is_super_admin:
            # Super admin has VIEW_EDIT on all columns
            return {}  # Empty dict implies unrestricted VIEW_EDIT

        result = await db.execute(
            select(ColumnPermission)
            .join(UserRole, UserRole.role_id == ColumnPermission.role_id, isouter=True)
            .where(
                (ColumnPermission.user_id == user.id)
                | (UserRole.user_id == user.id)
            )
        )
        col_perms = result.scalars().all()
        
        # Priority: VIEW_EDIT > VIEW > DENIED
        effective: Dict[UUID, ColumnPermissionLevel] = {}
        for cp in col_perms:
            cur = effective.get(cp.column_id)
            if cp.permission_level == ColumnPermissionLevel.VIEW_EDIT:
                effective[cp.column_id] = ColumnPermissionLevel.VIEW_EDIT
            elif cp.permission_level == ColumnPermissionLevel.VIEW and cur != ColumnPermissionLevel.VIEW_EDIT:
                effective[cp.column_id] = ColumnPermissionLevel.VIEW
            elif cp.permission_level == ColumnPermissionLevel.DENIED and not cur:
                effective[cp.column_id] = ColumnPermissionLevel.DENIED

        return effective


rbac_service = RBACService()
