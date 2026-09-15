<#
.SYNOPSIS
    Starts the DataMatrix Backend and Frontend locally on Windows.
#>

Write-Host "====================================================" -ForegroundColor Cyan
Write-Host " Starting DataMatrix Enterprise Platform Locally... " -ForegroundColor Green
Write-Host "====================================================" -ForegroundColor Cyan

$RootDir = if ($PSScriptRoot) { $PSScriptRoot } elseif ($MyInvocation.MyCommand.Path) { Split-Path -Parent $MyInvocation.MyCommand.Path } else { (Get-Location).Path }

# 1. Start Backend FastAPI server in a new window
Write-Host "[1/2] Starting FastAPI Backend on http://127.0.0.1:8000 ..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$RootDir\backend'; .\.venv\Scripts\python.exe -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000"

# 2. Start Frontend Vite server in a new window
Write-Host "[2/2] Starting Vite Frontend on http://localhost:5173 ..." -ForegroundColor Yellow
Start-Process powershell -ArgumentList "-NoExit", "-Command", "Set-Location '$RootDir\frontend'; npm run dev"

Write-Host ""
Write-Host "====================================================" -ForegroundColor Green
Write-Host " DataMatrix is launching! " -ForegroundColor Green
Write-Host " Web App URL:    http://localhost:5173" -ForegroundColor White
Write-Host " Backend API:    http://127.0.0.1:8000" -ForegroundColor White
Write-Host " Swagger Docs:   http://127.0.0.1:8000/api/v1/docs" -ForegroundColor White
Write-Host "====================================================" -ForegroundColor Green
