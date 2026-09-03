#!/bin/bash
# ==============================================================================
# DATAMATRIX POSTGRESQL AUTOMATED BACKUP SCRIPT (Linux/macOS)
# ==============================================================================

set -e

BACKUP_DIR="${BACKUP_DIR:-./backups}"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="${BACKUP_DIR}/datamatrix_backup_${TIMESTAMP}.dump"
CONTAINER_NAME="${CONTAINER_NAME:-datamatrix_postgres}"
POSTGRES_USER="${POSTGRES_USER:-postgres}"
POSTGRES_DB="${POSTGRES_DB:-datamatrix}"

# Ensure backup directory exists
mkdir -p "${BACKUP_DIR}"

echo "================================================================="
echo "Starting PostgreSQL Backup at $(date)"
echo "Target Container: ${CONTAINER_NAME}"
echo "Database: ${POSTGRES_DB}"
echo "Output File: ${BACKUP_FILE}"
echo "================================================================="

# Execute pg_dump custom format via docker exec
docker exec -t "${CONTAINER_NAME}" pg_dump -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" -F c -b -v > "${BACKUP_FILE}"

# Calculate file size
FILE_SIZE=$(ls -lh "${BACKUP_FILE}" | awk '{print $5}')

echo "================================================================="
echo "Backup Completed Successfully!"
echo "Size: ${FILE_SIZE}"
echo "Location: ${BACKUP_FILE}"
echo "================================================================="

# Retention: Delete backups older than 30 days
echo "Pruning backups older than 30 days..."
find "${BACKUP_DIR}" -type f -name "datamatrix_backup_*.dump" -mtime +30 -exec rm {} \;
echo "Pruning complete."
