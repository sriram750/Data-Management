# DataMatrix - Active Directory & LDAP Integration Guide

DataMatrix provides an extensible Active Directory / LDAP authentication provider, allowing enterprise single sign-on (SSO) with on-premise Windows Server Active Directory or OpenLDAP.

---

## 1. Architecture

When LDAP is enabled:
1. User enters username and corporate network password at `/login`.
2. DataMatrix connects to the corporate LDAP server using STARTTLS or LDAPS.
3. Binds with service account credentials (`LDAP_BIND_DN`) and searches for the user object matching `LDAP_USER_SEARCH_FILTER`.
4. Attempts direct bind authentication with the user's distinguished name (DN) and submitted password.
5. If authentication succeeds and `LDAP_AUTO_CREATE_USER=True`, DataMatrix provisions a local account mapped to the default role if one does not already exist.

---

## 2. Configuration Parameters

Set the following variables in your `.env` file:

```env
# Enable LDAP Authentication
LDAP_ENABLED=True

# Domain Controller URL & Port
LDAP_SERVER=ldaps://ad.company.local
LDAP_PORT=636
LDAP_USE_SSL=True
LDAP_USE_TLS=False

# Read-only Service Account for User Searches
LDAP_BIND_DN=CN=DataMatrix Service,OU=Service Accounts,DC=company,DC=local
LDAP_BIND_PASSWORD=YourStrongServiceAccountPassword123!

# Base Search DN
LDAP_BASE_DN=DC=company,DC=local

# User Search Filter (Active Directory: sAMAccountName / OpenLDAP: uid)
LDAP_USER_SEARCH_FILTER=(sAMAccountName={username})

# Group Search Filter (Optional)
LDAP_GROUP_SEARCH_FILTER=(member={user_dn})

# Auto-provisioning
LDAP_AUTO_CREATE_USER=True
```

---

## 3. Testing Directory Connectivity

Super Administrators can test directory connectivity and bind credentials directly from the web interface:
1. Log in as Super Administrator.
2. Navigate to **Administration &rarr; Settings**.
3. Under **Active Directory / LDAP Integration**, click **Test Directory Connection**.
4. The system attempts a socket connection and bind authentication, returning real-time status and diagnostics.
