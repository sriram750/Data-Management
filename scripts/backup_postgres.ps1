<#
.SYNOPSIS
    Automated PostgreSQL Backup Script for DataMatrix on Windows PowerShell.
.DESCRIPTION
    Creates a compressed custom-format pg_dump from the active docker container.
#>

param (
    [string]$BackupDir = ".\backups",
    [string]$ContainerName = "datamatrix_postgres",
    [string]$PostgresUser = "postgres",
    [string]$PostgresDb = "datamatrix"
)

$ErrorActionPreference = "Stop"

if (!(Test-Path $BackupDir)) {
    New-Item -ItemType Directory -Force -Path $BackupDir | Out-Null
}

$Timestamp = Get-Date -Format "yyyyMMdd_HHmmss"
$BackupFile = Join-Path $BackupDir "datamatrix_backup_${Timestamp}.dump"

Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host "Starting DataMatrix PostgreSQL Backup..." -ForegroundColor Green
Write-Host "Container: $ContainerName"
Write-Host "Database:  $PostgresDb"
Write-Host "Target:    $BackupFile"
Write-Host "=================================================================" -ForegroundColor Cyan

docker exec -i $ContainerName pg_dump -U $PostgresUser -d $PostgresDb -F c -b > $BackupFile

if (Test-Path $BackupFile) {
    $Size = (Get-Item $BackupFile).Length / 1MB
    Write-Host "Backup Created Successfully! Size: $([Math]::Round($Size, 2)) MB" -ForegroundColor Green
} else {
    Write-Error "Backup file was not created."
}

# Retention: Remove backups older than 30 days
$Cutoff = (Get-Date).AddDays(-30)
Get-ChildItem -Path $BackupDir -Filter "datamatrix_backup_*.dump" | Where-Object { $_.LastWriteTime -lt $Cutoff } | Remove-Item -Force
Write-Host "Retention cleanup complete." -ForegroundColor Gray
