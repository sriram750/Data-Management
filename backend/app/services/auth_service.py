from datetime import datetime, timezone
from typing import List, Optional, Tuple
from uuid import UUID
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import func, select
from sqlalchemy.orm import selectinload

from app.core.config import settings
from app.core.exceptions import ConflictException, ForbiddenException, NotFoundException, UnauthorizedException, ValidationException
from app.core.security import (
    calculate_lockout_expiration,
    calculate_session_expiration,
    generate_session_token,
    hash_password,
    hash_token,
    verify_password,
)
from app.models.audit_log import AuditAction
from app.models.rbac import Role, UserRole
from app.models.user import User, UserSession, UserStatus
from app.schemas.auth import InitialAdminSetupRequest, LoginRequest, LoginResponse, SessionResponse, UserInfo
from app.services.audit_service import audit_service
from app.services.rbac_service import rbac_service


class AuthService:
    @staticmethod
    async def is_setup_required(db: AsyncSession) -> bool:
        """Returns True if NO users exist in the database."""
        result = await db.execute(select(func.count(User.id)))
        count = result.scalar_one()
        return count == 0

    @staticmethod
    async def get_total_users(db: AsyncSession) -> int:
        result = await db.execute(select(func.count(User.id)))
        return result.scalar_one()

    @staticmethod
    async def initialize_admin(
        db: AsyncSession,
        req: InitialAdminSetupRequest,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
    ) -> User:
        """First-time setup wizard: create Super Admin and seed roles. Disabled once any user exists."""
        if not await AuthService.is_setup_required(db):
            raise ForbiddenException("System has already been initialized. Setup wizard is locked.")

        if req.password != req.confirm_password:
            raise ValidationException("Passwords do not match.")

        if len(req.password) < settings.PASSWORD_MIN_LENGTH:
            raise ValidationException(f"Password must be at least {settings.PASSWORD_MIN_LENGTH} characters long.")

        # Seed roles & permissions
        await rbac_service.initialize_system_roles_and_permissions(db)

        # Create Super Admin User
        admin_user = User(
            username=req.username.strip(),
            full_name=req.full_name.strip(),
            email=req.email.lower().strip(),
            password_hash=hash_password(req.password),
            status=UserStatus.ACTIVE,
            is_super_admin=True,
            password_changed_at=datetime.now(timezone.utc),
        )
        db.add(admin_user)
        await db.flush()

        # Find SUPER_ADMIN role and assign
        role_res = await db.execute(select(Role).where(Role.name == "SUPER_ADMIN"))
        super_role = role_res.scalar_one_or_none()
        if super_role:
            ur = UserRole(user_id=admin_user.id, role_id=super_role.id)
            db.add(ur)

        await db.commit()
        await db.refresh(admin_user)

        # Audit initial setup
        await audit_service.log_event(
            db=db,
            action=AuditAction.USER_CREATED,
            username=admin_user.username,
            user_id=admin_user.id,
            ip_address=ip_address,
            user_agent=user_agent,
            details={"event": "INITIAL_SETUP_WIZARD_COMPLETED", "role": "SUPER_ADMIN"},
        )
        await db.commit()

        return admin_user

    @staticmethod
    async def authenticate_user(
        db: AsyncSession,
        req: LoginRequest,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
    ) -> LoginResponse:
        """Authenticate user credentials, check lockout, generate session token, and audit."""
        result = await db.execute(
            select(User)
            .options(selectinload(User.roles).selectinload(UserRole.role))
            .where(User.username == req.username.strip())
        )
        user = result.scalar_one_or_none()

        if not user:
            # Audit failed login
            await audit_service.log_event(
                db=db,
                action=AuditAction.LOGIN_FAILED,
                username=req.username.strip(),
                ip_address=ip_address,
                user_agent=user_agent,
                details={"reason": "User not found"},
            )
            await db.commit()
            raise UnauthorizedException("Invalid username or password.")

        now = datetime.now(timezone.utc)

        # Check account lockout
        if user.status == UserStatus.LOCKED:
            if user.lockout_until and user.lockout_until > now:
                remaining = int((user.lockout_until - now).total_seconds() / 60) + 1
                raise ForbiddenException(f"Account is locked due to excessive failed attempts. Try again in {remaining} minutes.")
            else:
                # Lockout expired, reset status
                user.status = UserStatus.ACTIVE
                user.failed_login_attempts = 0
                user.lockout_until = None

        if user.status == UserStatus.DISABLED:
            raise ForbiddenException("Account is disabled. Contact your administrator.")

        # Verify password
        if not verify_password(req.password, user.password_hash):
            user.failed_login_attempts += 1
            if user.failed_login_attempts >= settings.MAX_FAILED_LOGIN_ATTEMPTS:
                user.status = UserStatus.LOCKED
                user.lockout_until = calculate_lockout_expiration()

            await audit_service.log_event(
                db=db,
                action=AuditAction.LOGIN_FAILED,
                username=user.username,
                user_id=user.id,
                ip_address=ip_address,
                user_agent=user_agent,
                details={"attempts": user.failed_login_attempts, "locked": user.status == UserStatus.LOCKED},
            )
            await db.commit()
            raise UnauthorizedException("Invalid username or password.")

        # Successful login: reset failed counters
        user.failed_login_attempts = 0
        user.lockout_until = None
        user.last_login_at = now

        # Create session
        raw_token, token_hash = generate_session_token()
        session_expiry = calculate_session_expiration()
        
        session = UserSession(
            user_id=user.id,
            token_hash=token_hash,
            ip_address=ip_address,
            user_agent=user_agent,
            expires_at=session_expiry,
            last_activity_at=now,
        )
        db.add(session)

        # Audit successful login
        await audit_service.log_event(
            db=db,
            action=AuditAction.LOGIN,
            username=user.username,
            user_id=user.id,
            ip_address=ip_address,
            user_agent=user_agent,
            details={"session_id": str(session.id)},
        )
        await db.commit()

        # Gather roles and permissions
        user_roles = [ur.role.name for ur in user.roles if ur.role]
        permissions = list(await rbac_service.get_user_permissions(db, user))

        user_info = UserInfo(
            id=user.id,
            username=user.username,
            full_name=user.full_name,
            email=user.email,
            is_super_admin=user.is_super_admin,
            roles=user_roles,
            permissions=permissions,
        )

        return LoginResponse(
            token=raw_token,
            token_type="Bearer",
            expires_at=session_expiry,
            user=user_info,
        )

    @staticmethod
    async def get_user_by_session_token(db: AsyncSession, raw_token: str) -> Tuple[User, UserSession]:
        """Validate session token and return (User, UserSession)."""
        token_hash = hash_token(raw_token)
        now = datetime.now(timezone.utc)

        result = await db.execute(
            select(UserSession)
            .options(
                selectinload(UserSession.user)
                .selectinload(User.roles)
                .selectinload(UserRole.role)
            )
            .where(
                UserSession.token_hash == token_hash,
                UserSession.is_revoked == False,
                UserSession.expires_at > now,
            )
        )
        session = result.scalar_one_or_none()

        if not session or not session.user:
            raise UnauthorizedException("Invalid or expired session token.")

        if session.user.status != UserStatus.ACTIVE:
            raise ForbiddenException("User account is inactive or locked.")

        # Update last activity
        session.last_activity_at = now
        await db.commit()

        return session.user, session

    @staticmethod
    async def logout(
        db: AsyncSession,
        session: UserSession,
        user: User,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
    ) -> None:
        """Revoke user session and log audit."""
        session.is_revoked = True
        await audit_service.log_event(
            db=db,
            action=AuditAction.LOGOUT,
            username=user.username,
            user_id=user.id,
            ip_address=ip_address,
            user_agent=user_agent,
            details={"session_id": str(session.id)},
        )
        await db.commit()

    @staticmethod
    async def change_password(
        db: AsyncSession,
        user: User,
        current_password: str,
        new_password: str,
        ip_address: Optional[str] = None,
        user_agent: Optional[str] = None,
    ) -> None:
        """Change user password, revoke all other active sessions, and audit."""
        if not verify_password(current_password, user.password_hash):
            raise ValidationException("Current password is incorrect.")

        if len(new_password) < settings.PASSWORD_MIN_LENGTH:
            raise ValidationException(f"New password must be at least {settings.PASSWORD_MIN_LENGTH} characters long.")

        user.password_hash = hash_password(new_password)
        user.password_changed_at = datetime.now(timezone.utc)

        # Audit password change (zero password values logged)
        await audit_service.log_event(
            db=db,
            action=AuditAction.PASSWORD_CHANGED,
            username=user.username,
            user_id=user.id,
            ip_address=ip_address,
            user_agent=user_agent,
        )
        await db.commit()

    @staticmethod
    async def get_user_sessions(db: AsyncSession, user: User, current_session_id: UUID) -> List[SessionResponse]:
        """Fetch all non-expired sessions for the user."""
        now = datetime.now(timezone.utc)
        result = await db.execute(
            select(UserSession).where(
                UserSession.user_id == user.id,
                UserSession.is_revoked == False,
                UserSession.expires_at > now,
            ).order_by(UserSession.created_at.desc())
        )
        sessions = result.scalars().all()

        return [
            SessionResponse(
                id=s.id,
                ip_address=s.ip_address,
                user_agent=s.user_agent,
                expires_at=s.expires_at,
                last_activity_at=s.last_activity_at,
                created_at=s.created_at,
                is_current=(s.id == current_session_id),
            )
            for s in sessions
        ]

    @staticmethod
    async def revoke_session(db: AsyncSession, user: User, session_id: UUID) -> None:
        """Revoke a specific session."""
        result = await db.execute(
            select(UserSession).where(
                UserSession.id == session_id,
                (UserSession.user_id == user.id) if not user.is_super_admin else True,
            )
        )
        session = result.scalar_one_or_none()
        if not session:
            raise NotFoundException("Session not found.")
        session.is_revoked = True
        await db.commit()


auth_service = AuthService()
