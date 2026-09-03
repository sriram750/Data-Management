from typing import Callable, Optional, Tuple
from fastapi import Depends, Header, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.exceptions import ForbiddenException, UnauthorizedException
from app.models.user import User, UserSession
from app.services.auth_service import auth_service
from app.services.rbac_service import rbac_service

security_scheme = HTTPBearer(auto_error=False)


async def get_client_info(request: Request) -> Tuple[Optional[str], Optional[str]]:
    """Extract client IP address and User-Agent."""
    ip_address = request.client.host if request.client else None
    user_agent = request.headers.get("User-Agent")
    return ip_address, user_agent


async def get_current_user_and_session(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security_scheme),
    db: AsyncSession = Depends(get_db),
) -> Tuple[User, UserSession]:
    if not credentials or not credentials.credentials:
        raise UnauthorizedException("Authentication token required.")

    token = credentials.credentials
    user, session = await auth_service.get_user_by_session_token(db, token)
    return user, session


async def get_current_user(
    user_and_session: Tuple[User, UserSession] = Depends(get_current_user_and_session),
) -> User:
    return user_and_session[0]


async def require_super_admin(
    current_user: User = Depends(get_current_user),
) -> User:
    if not current_user.is_super_admin:
        raise ForbiddenException("Super Administrator privilege required.")
    return current_user


def require_permission(permission_code: str) -> Callable:
    async def permission_dependency(
        current_user: User = Depends(get_current_user),
        db: AsyncSession = Depends(get_db),
    ) -> User:
        if current_user.is_super_admin:
            return current_user

        perms = await rbac_service.get_user_permissions(db, current_user)
        if permission_code not in perms:
            raise ForbiddenException(f"Permission '{permission_code}' required to perform this action.")
        return current_user

    return permission_dependency
