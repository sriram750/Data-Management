#!/bin/bash
# ==============================================================================
# DATAMATRIX POSTGRESQL RESTORE SCRIPT (Linux/macOS)
# ==============================================================================

set -e

if [ -z "$1" ]; then
    echo "Usage: ./restore_postgres.sh <path_to_backup_file.dump>"
    exit 1
fi

BACKUP_FILE="$1"
CONTAINER_NAME="${CONTAINER_NAME:-datamatrix_postgres}"
POSTGRES_USER="${POSTGRES_USER:-postgres}"
POSTGRES_DB="${POSTGRES_DB:-datamatrix}"

if [ ! -f "${BACKUP_FILE}" ]; then
    echo "Error: Backup file not found at ${BACKUP_FILE}"
    exit 1
fi

echo "================================================================="
echo "WARNING: This will restore database '${POSTGRES_DB}' in container '${CONTAINER_NAME}'."
echo "Existing data will be replaced by the contents of '${BACKUP_FILE}'."
echo "================================================================="
read -p "Are you sure you want to proceed? (yes/no): " CONFIRM

if [ "${CONFIRM}" != "yes" ]; then
    echo "Restore aborted."
    exit 0
fi

echo "Dropping active database connections and performing restore..."

docker exec -i "${CONTAINER_NAME}" pg_restore -U "${POSTGRES_USER}" -d "${POSTGRES_DB}" --clean --if-exists -v < "${BACKUP_FILE}"

echo "================================================================="
echo "Database Restore Completed Successfully!"
echo "================================================================="
