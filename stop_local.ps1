<#
.SYNOPSIS
    Stops the DataMatrix local Backend (Uvicorn) and Frontend (Node/Vite) servers.
#>

Write-Host "====================================================" -ForegroundColor Red
Write-Host " Stopping DataMatrix Local Servers... " -ForegroundColor Yellow
Write-Host "====================================================" -ForegroundColor Red

# 1. Stop Uvicorn / Python processes on port 8000
$port8000 = Get-NetTCPConnection -LocalPort 8000 -ErrorAction SilentlyContinue
if ($port8000) {
    $pids = $port8000 | Select-Object -ExpandProperty OwningProcess -Unique
    foreach ($p in $pids) {
        Stop-Process -Id $p -Force -ErrorAction SilentlyContinue
        Write-Host "Stopped Backend process (PID: $p)" -ForegroundColor Green
    }
} else {
    Write-Host "Backend server is not running on port 8000." -ForegroundColor Gray
}

# 2. Stop Vite / Node processes on port 5173
$port5173 = Get-NetTCPConnection -LocalPort 5173 -ErrorAction SilentlyContinue
if ($port5173) {
    $pids = $port5173 | Select-Object -ExpandProperty OwningProcess -Unique
    foreach ($p in $pids) {
        Stop-Process -Id $p -Force -ErrorAction SilentlyContinue
        Write-Host "Stopped Frontend process (PID: $p)" -ForegroundColor Green
    }
} else {
    Write-Host "Frontend server is not running on port 5173." -ForegroundColor Gray
}

Write-Host "All DataMatrix local servers have been stopped." -ForegroundColor Green
