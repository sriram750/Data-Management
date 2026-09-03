import os
from typing import List, Optional
from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    PROJECT_NAME: str = "Secure Dynamic Data Management System"
    VERSION: str = "1.0.0"
    API_V1_STR: str = "/api/v1"
    
    # Environment & Host
    ENVIRONMENT: str = "production"
    DEBUG: bool = False
    ALLOWED_HOSTS: List[str] = ["*"]
    CORS_ORIGINS: List[str] = ["http://localhost:5173", "http://localhost:3000", "http://localhost", "http://127.0.0.1:5173", "http://127.0.0.1:3000"]
    
    # Database
    DATABASE_URL: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/dynamic_data_db"
    SYNC_DATABASE_URL: Optional[str] = None
    
    # Security & Encryption
    # Master secret key for session hashing and JWT
    SECRET_KEY: str = "replace-this-in-production-with-a-very-long-random-secret-key-32-chars-min"
    # Authenticated encryption key for sensitive columns (AES-256-GCM)
    ENCRYPTION_KEY: str = "replace-this-in-production-with-32-byte-master-encryption-key-min"
    
    # Session & Security Policies
    SESSION_TIMEOUT_MINUTES: int = 120
    MAX_FAILED_LOGIN_ATTEMPTS: int = 5
    LOCKOUT_DURATION_MINUTES: int = 15
    PASSWORD_MIN_LENGTH: int = 8
    
    # Upload limits & file attachments
    MAX_UPLOAD_SIZE_MB: int = 50
    ALLOWED_FILE_TYPES: List[str] = ["pdf", "docx", "xlsx", "csv", "png", "jpg", "jpeg", "txt"]
    UPLOAD_STORAGE_PATH: str = "uploads"
    
    # Redis (Optional cache/background)
    REDIS_URL: Optional[str] = None
    
    # LDAP / Active Directory Configuration (Ready Abstraction)
    LDAP_ENABLED: bool = False
    LDAP_SERVER: Optional[str] = None
    LDAP_PORT: int = 389
    LDAP_USE_SSL: bool = False
    LDAP_BASE_DN: Optional[str] = None
    LDAP_BIND_DN: Optional[str] = None
    LDAP_BIND_PASSWORD: Optional[str] = None
    LDAP_USER_FILTER: str = "(&(objectClass=user)(sAMAccountName={username}))"
    LDAP_SEARCH_ATTRIBUTES: List[str] = ["mail", "displayName", "sAMAccountName"]
    
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="allow"
    )

    def get_sync_database_url(self) -> str:
        if self.SYNC_DATABASE_URL:
            return self.SYNC_DATABASE_URL
        url = self.DATABASE_URL
        if url.startswith("postgresql+asyncpg://"):
            return url.replace("postgresql+asyncpg://", "postgresql+psycopg2://")
        if url.startswith("sqlite+aiosqlite:///"):
            return url.replace("sqlite+aiosqlite:///", "sqlite:///")
        return url


settings = Settings()
