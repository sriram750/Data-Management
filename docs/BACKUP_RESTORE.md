# DataMatrix - Database Backup & Disaster Recovery Guide

This guide describes the automated and manual backup procedures, retention schedules, and disaster recovery processes for PostgreSQL in DataMatrix.

---

## 1. Automated Backup Strategy

DataMatrix includes automated backup scripts for Linux/macOS and Windows environments that produce compressed custom-format (`pg_dump -F c`) database archives.

### A. Linux / macOS Cron Automation
Make the backup script executable:
```bash
chmod +x scripts/backup_postgres.sh
```

Run manual backup:
```bash
./scripts/backup_postgres.sh
```

Set up a daily cron job (e.g. at 02:00 AM every night):
```bash
crontab -e
```
Add the following entry:
```cron
0 2 * * * /path/to/datamatrix/scripts/backup_postgres.sh >> /var/log/datamatrix_backup.log 2>&1
```

### B. Windows Task Scheduler Automation
Run manual backup via PowerShell:
```powershell
.\scripts\backup_postgres.ps1
```

To schedule daily execution:
1. Open **Windows Task Scheduler**.
2. Create a new task triggered daily at `02:00 AM`.
3. Set the action to:
   - Program: `powershell.exe`
   - Arguments: `-ExecutionPolicy Bypass -File "F:\srirampst\DCP\Excel\scripts\backup_postgres.ps1"`

---

## 2. Backup Retention Policy

The provided scripts automatically prune backup archives older than **30 days** using:
```bash
find ./backups -type f -name "datamatrix_backup_*.dump" -mtime +30 -exec rm {} \;
```

---

## 3. Database Restoration Procedures

Restoring a backup will overwrite the target database with the point-in-time state contained in the backup archive.

### Linux / macOS Restore
```bash
./scripts/restore_postgres.sh ./backups/datamatrix_backup_20260902_120000.dump
```
Type `yes` when prompted to confirm the operation.

### Windows PowerShell Restore
```powershell
.\scripts\restore_postgres.ps1 -BackupFile ".\backups\datamatrix_backup_20260902_120000.dump"
```
Type `RESTORE` when prompted to confirm the operation.

---

## 4. Disaster Recovery Testing Checklist

1. **Verify Backup Integrity**: Periodically restore a backup into a temporary test container:
   ```bash
   docker run --name temp_postgres -e POSTGRES_PASSWORD=test -d postgres:16-alpine
   docker exec -i temp_postgres pg_restore -U postgres -d postgres < ./backups/latest.dump
   docker stop temp_postgres && docker rm temp_postgres
   ```
2. **Key Provider Preservation**: Ensure the `ENCRYPTION_MASTER_KEY` environment variable is stored securely offsite (e.g. in a secrets vault like HashiCorp Vault or AWS Secrets Manager). Without this key, encrypted password fields in restored databases cannot be decrypted.
