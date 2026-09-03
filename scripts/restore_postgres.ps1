<#
.SYNOPSIS
    DataMatrix PostgreSQL Restore Script for Windows PowerShell.
.DESCRIPTION
    Restores a custom-format pg_dump backup archive into the active Docker container.
.EXAMPLE
    .\scripts\restore_postgres.ps1 -BackupFile ".\backups\datamatrix_backup_20260902_120000.dump"
#>

param (
    [Parameter(Mandatory=$true)]
    [string]$BackupFile,
    [string]$ContainerName = "datamatrix_postgres",
    [string]$PostgresUser = "postgres",
    [string]$PostgresDb = "datamatrix"
)

$ErrorActionPreference = "Stop"

if (!(Test-Path $BackupFile)) {
    Write-Error "Backup file not found at path: $BackupFile"
    exit 1
}

Write-Host "=================================================================" -ForegroundColor Red
Write-Host "WARNING: Restoring database '$PostgresDb' in container '$ContainerName'." -ForegroundColor Yellow
Write-Host "All current records will be overwritten with backup contents." -ForegroundColor Yellow
Write-Host "Source: $BackupFile" -ForegroundColor Yellow
Write-Host "=================================================================" -ForegroundColor Red

$Confirmation = Read-Host "Type 'RESTORE' to confirm"
if ($Confirmation -ne "RESTORE") {
    Write-Host "Restore cancelled." -ForegroundColor Gray
    exit 0
}

Write-Host "Executing pg_restore..." -ForegroundColor Cyan
Get-Content -Path $BackupFile -Raw -Encoding Byte | docker exec -i $ContainerName pg_restore -U $PostgresUser -d $PostgresDb --clean --if-exists

Write-Host "Database Restore Completed Successfully!" -ForegroundColor Green
