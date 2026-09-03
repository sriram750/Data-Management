# DataMatrix - Troubleshooting & Operational Diagnostics

This guide provides solutions to common operational, networking, and deployment issues.

---

## 1. Database & Connectivity Issues

### Problem: "FATAL: password authentication failed for user 'postgres'"
- **Cause**: PostgreSQL volume was initialized with a different password than defined in `.env`.
- **Solution**:
  - If deploying fresh:
    ```bash
    docker compose down -v
    docker compose up --build -d
    ```
  - If preserving data, ensure `POSTGRES_PASSWORD` in `.env` matches the password used during initial container volume creation.

### Problem: Database Connection Timeout
- **Cause**: Backend container is starting before PostgreSQL is healthy.
- **Solution**: The `docker-compose.yml` includes a `healthcheck` ensuring backend waits until PostgreSQL returns `pg_isready`. Verify container logs:
  ```bash
  docker compose logs postgres
  ```

---

## 2. Authentication & Account Lockout

### Problem: Account Locked ("Account is temporarily locked due to excessive failed login attempts.")
- **Cause**: User entered invalid passwords 5 consecutive times.
- **Solution**:
  - Wait 15 minutes for automatic lockout expiration.
  - Or, as a Super Administrator, navigate to **Security &rarr; Users**, edit the locked user, and change status back to `ACTIVE`.

### Problem: Resetting Super Admin Password via CLI
If all Super Administrator credentials are lost:
```bash
docker compose exec backend python -c "
from app.core.database import SessionLocalSync
from app.models.user import User
from app.core.security import get_password_hash

with SessionLocalSync() as db:
    admin = db.query(User).filter(User.is_super_admin == True).first()
    if admin:
        admin.password_hash = get_password_hash('NewMasterPassword123!')
        admin.failed_login_attempts = 0
        admin.locked_until = None
        db.commit()
        print('Super Admin password reset successfully!')
"
```

---

## 3. Excel Import & Upload Issues

### Problem: "413 Request Entity Too Large"
- **Cause**: Uploaded Excel workbook exceeds Nginx body size limit.
- **Solution**: The `nginx/default.conf` and `frontend/nginx.conf` are configured with `client_max_body_size 100M;`. If your file is larger, adjust this parameter and run:
  ```bash
  docker compose exec nginx nginx -s reload
  ```

### Problem: "Validation Failed: Required column is missing values"
- **Cause**: A column mapped as required in the wizard has blank cells in rows.
- **Solution**: In Step 2 of the Import Wizard, uncheck the **Required** checkbox for that column, or fix blank rows in the source `.xlsx` spreadsheet and re-upload.

---

## 4. Frontend & Caching

### Problem: White screen or stale UI after updating
- **Solution**: Perform a hard refresh in your browser (`Ctrl + Shift + R` or `Cmd + Shift + R`), or clear cached application data in DevTools.
