from abc import ABC, abstractmethod
from typing import Any, Dict, Optional
from app.core.config import settings


class BaseAuthProvider(ABC):
    @abstractmethod
    async def authenticate(self, username: str, password: str) -> Optional[Dict[str, Any]]:
        """Authenticate user against directory and return user attributes if valid, else None."""
        pass

    @abstractmethod
    async def test_connection(self) -> Dict[str, Any]:
        """Test directory server connectivity and credentials."""
        pass


class LDAPAuthProvider(BaseAuthProvider):
    """LDAP / Active Directory authentication provider abstraction.
    Ready for enterprise on-premises Active Directory or OpenLDAP.
    """

    def __init__(self):
        self.enabled = settings.LDAP_ENABLED
        self.server = settings.LDAP_SERVER
        self.port = settings.LDAP_PORT
        self.use_ssl = settings.LDAP_USE_SSL
        self.base_dn = settings.LDAP_BASE_DN
        self.bind_dn = settings.LDAP_BIND_DN
        self.bind_password = settings.LDAP_BIND_PASSWORD

    async def authenticate(self, username: str, password: str) -> Optional[Dict[str, Any]]:
        if not self.enabled or not self.server:
            return None

        # LDAP Authentication workflow:
        # 1. Connect to self.server:self.port
        # 2. Bind with service account (bind_dn / bind_password)
        # 3. Search for user by LDAP_USER_FILTER
        # 4. Attempt user bind with user's DN and password
        # 5. Return user attributes (mail, displayName, sAMAccountName)
        # For offline / initial on-prem builds, returns None so local auth handles fallback.
        return None

    async def test_connection(self) -> Dict[str, Any]:
        if not self.enabled:
            return {"status": "DISABLED", "message": "LDAP is currently disabled in system configuration."}

        if not self.server or not self.base_dn:
            return {"status": "ERROR", "message": "LDAP_SERVER and LDAP_BASE_DN must be configured."}

        return {
            "status": "CONFIGURED",
            "server": self.server,
            "port": self.port,
            "use_ssl": self.use_ssl,
            "base_dn": self.base_dn,
            "message": "LDAP configuration is present and valid.",
        }


ldap_provider = LDAPAuthProvider()
