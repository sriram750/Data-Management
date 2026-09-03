# DataMatrix - Security & Cryptographic Architecture

DataMatrix is engineered with strict defense-in-depth security principles to safely handle critical enterprise data, secrets, credentials, and sensitive assets.

---

## 1. Cryptographic Standards

### A. Password Hashing (Argon2id)
- Passwords are never stored in plaintext or with outdated hashing algorithms (MD5, SHA1, SHA256).
- All credentials use **Argon2id** (Memory cost: 64MB, Time cost: 2 iterations, Parallelism: 8 threads).
- Argon2id is resistant to GPU/ASIC brute-force attacks and side-channel timing attacks.

### B. Column-Level Encryption (Authenticated AES-256-GCM)
- Fields marked with `is_sensitive=True` or `data_type='PASSWORD'` are encrypted using **AES-256 in Galois/Counter Mode (GCM)**.
- GCM provides authenticated encryption: any tampering with ciphertext causes verification failure upon decryption.
- Per-record nonces (12 bytes) and HKDF-SHA256 key derivation ensure ciphertext randomization.
- Encrypted payloads are stored as structured JSON envelopes:
  ```json
  {
    "__encrypted": true,
    "v": 1,
    "nonce": "base64...",
    "data": "base64..."
  }
  ```

---

## 2. Authentication & Session Management

- **No Hardcoded Credentials**: Initial setup requires explicit provisioning of a Super Administrator account.
- **Argon2id Credential Verification**: Constant-time verification prevents username enumeration.
- **Account Lockout Policy**: 5 consecutive failed login attempts locks the account for 15 minutes.
- **Session Revocation**: Active sessions can be inspected and terminated at any time from the UI or API.
- **Automatic Expiration**: Sessions expire after 60 minutes of inactivity.

---

## 3. Zero-Leak Logging & Audit Trails

- **Sensitive Data Scrubbing**: Backend structured logger uses a `SensitiveDataFilter` regex engine to scrub passwords, tokens, API keys, and authorization headers from application log streams.
- **Append-Only Audit Logs**: Every create, update, delete, schema change, login, and export event is committed to `audit_logs` with UTC timestamps, user IDs, table IDs, field names, and client IP addresses.
- **`PASSWORD_VIEWED` Auditing**: Whenever a user reveals an encrypted secret in the UI, an immutable audit entry is recorded. Plaintext passwords are NEVER logged.

---

## 4. Network & Application Hardening

- **Nginx Security Headers**:
  - `X-Frame-Options: DENY`
  - `X-Content-Type-Options: nosniff`
  - `X-XSS-Protection: 1; mode=block`
  - `Referrer-Policy: strict-origin-when-cross-origin`
  - `Content-Security-Policy: default-src 'self' ...`
- **Non-Root Docker User**: The backend container executes under a dedicated unprivileged `appuser` system account.
- **SQL Injection Prevention**: SQLAlchemy parameterized queries and Asyncpg binary encoding completely prevent SQL injection.
