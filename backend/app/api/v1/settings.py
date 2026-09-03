from fastapi import APIRouter, Depends
from app.api.deps import require_super_admin
from app.core.config import settings
from app.ldap.auth_provider import ldap_provider
from app.models.user import User

router = APIRouter(prefix="/settings", tags=["System Settings"])


@router.get("")
async def get_system_settings(
    current_user: User = Depends(require_super_admin),
):
    return {
        "project_name": settings.PROJECT_NAME,
        "version": settings.VERSION,
        "session_timeout_minutes": settings.SESSION_TIMEOUT_MINUTES,
        "max_failed_login_attempts": settings.MAX_FAILED_LOGIN_ATTEMPTS,
        "lockout_duration_minutes": settings.LOCKOUT_DURATION_MINUTES,
        "password_min_length": settings.PASSWORD_MIN_LENGTH,
        "max_upload_size_mb": settings.MAX_UPLOAD_SIZE_MB,
        "allowed_file_types": settings.ALLOWED_FILE_TYPES,
        "ldap_enabled": settings.LDAP_ENABLED,
        "ldap_server": settings.LDAP_SERVER,
        "ldap_port": settings.LDAP_PORT,
    }


@router.post("/test-ldap")
async def test_ldap_connection(
    current_user: User = Depends(require_super_admin),
):
    return await ldap_provider.test_connection()
