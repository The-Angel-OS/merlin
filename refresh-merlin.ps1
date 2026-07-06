<#
  refresh-merlin.ps1 — one-shot: pull latest, rebuild, restart Merlin.

  Merlin runs as the interactive-session scheduled task 'Merlin', which OWNS
  port 3000. So we rebuild and restart THAT task — never `pnpm start`, which
  collides with the task and fails with EADDRINUSE (address already in use).

  Usage (from anywhere):
    powershell -ExecutionPolicy Bypass -File C:\Dev\merlin\refresh-merlin.ps1

  Skip the git pull (rebuild + restart only):
    powershell -ExecutionPolicy Bypass -File C:\Dev\merlin\refresh-merlin.ps1 -NoPull
#>
param([switch]$NoPull)

Set-Location $PSScriptRoot
Write-Host "== Merlin refresh ==" -ForegroundColor Cyan

# 1) Pull latest (fast-forward only — refuses rather than making a messy merge)
if (-not $NoPull) {
  Write-Host "-> git pull --ff-only origin main" -ForegroundColor Gray
  git fetch origin
  git pull --ff-only origin main
  if ($LASTEXITCODE -ne 0) {
    Write-Host "git pull failed (local changes or diverged). Resolve, then re-run. Aborting." -ForegroundColor Red
    exit 1
  }
} else {
  Write-Host "-> skipping git pull (-NoPull)" -ForegroundColor Gray
}

# 2) Build (keeps the OLD build live if this fails)
Write-Host "-> pnpm build" -ForegroundColor Gray
pnpm build
if ($LASTEXITCODE -ne 0) {
  Write-Host "Build failed. NOT restarting Merlin — the previous build stays live." -ForegroundColor Red
  exit 1
}

# 3) Restart the scheduled task that owns :3000
Write-Host "-> restart scheduled task 'Merlin'" -ForegroundColor Gray
try { Stop-ScheduledTask -TaskName Merlin -ErrorAction Stop } catch { Write-Host "   (task was not running)" -ForegroundColor DarkGray }
Start-Sleep -Seconds 2
try {
  Start-ScheduledTask -TaskName Merlin -ErrorAction Stop
} catch {
  Write-Host "Could not start task 'Merlin'. Is it registered? Re-run install-merlin-user-session.ps1." -ForegroundColor Red
  exit 1
}

# 4) Wait for the port to come up
Write-Host "-> waiting for port 3000..." -ForegroundColor Gray
$up = $false
foreach ($i in 1..20) {
  Start-Sleep -Seconds 1
  if (Test-NetConnection -ComputerName 127.0.0.1 -Port 3000 -InformationLevel Quiet -WarningAction SilentlyContinue) { $up = $true; break }
}
if ($up) {
  Write-Host "[OK] Merlin is up on http://127.0.0.1:3000" -ForegroundColor Green
} else {
  Write-Host "[..] Not listening yet - give it a few more seconds, then load 127.0.0.1:3000." -ForegroundColor Yellow
  Write-Host "     If it never comes up, a stray manual 'next start' may still hold :3000 -" -ForegroundColor Yellow
  Write-Host "     close that console (or: Get-NetTCPConnection -LocalPort 3000 | % { Stop-Process -Id $_.OwningProcess -Force })." -ForegroundColor Yellow
}
