<#
  refresh-merlin.ps1 - one-shot: pull latest, rebuild, restart Merlin.

  Merlin runs as the interactive-session scheduled task 'Merlin', which OWNS
  port 3000. So we rebuild and restart THAT task - never `pnpm start`, which
  collides with the task and fails with EADDRINUSE (address already in use).

  Usage (from anywhere):
    powershell -ExecutionPolicy Bypass -File C:\Dev\merlin\refresh-merlin.ps1

  Skip the git pull (rebuild + restart only):
    powershell -ExecutionPolicy Bypass -File C:\Dev\merlin\refresh-merlin.ps1 -NoPull
#>
param([switch]$NoPull)

Set-Location $PSScriptRoot
Write-Host "== Merlin refresh ==" -ForegroundColor Cyan

# 1) Pull latest (fast-forward only - refuses rather than making a messy merge)
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

# 1b) Refresh the shared brain (file:../angel-brain). pnpm installs it as a
#     hard-linked COPY, not a live link - so a stale copy in node_modules causes
#     type drift ("Property 'model' does not exist on type 'BrainResult'"). Pull
#     + rebuild the brain, then `pnpm install` below re-syncs Merlin's copy.
$brainDir = Join-Path (Split-Path $PSScriptRoot -Parent) 'angel-brain'
$brainRefreshed = $false
if (Test-Path $brainDir) {
  Write-Host "-> refresh @angel-os/brain ($brainDir)" -ForegroundColor Gray
  Push-Location $brainDir
  if (-not $NoPull) { git fetch origin; git pull --ff-only origin main }
  pnpm install
  pnpm build
  $brainOk = ($LASTEXITCODE -eq 0)
  Pop-Location
  if (-not $brainOk) { Write-Host "angel-brain build failed. Aborting." -ForegroundColor Red; exit 1 }
  $brainRefreshed = $true
} else {
  Write-Host "-> angel-brain not found at $brainDir (skipping brain refresh)" -ForegroundColor DarkGray
}

# 2) Build (keeps the OLD build live if this fails). Re-sync the file: brain dep
#    first when the brain was rebuilt, so Merlin picks up the fresh dist.
if ($brainRefreshed) {
  Write-Host "-> pnpm install (re-sync brain dep)" -ForegroundColor Gray
  pnpm install
}
Write-Host "-> pnpm build" -ForegroundColor Gray
pnpm build
if ($LASTEXITCODE -ne 0) {
  Write-Host "Build failed. NOT restarting Merlin - the previous build stays live." -ForegroundColor Red
  exit 1
}

# 3) Restart the scheduled task that owns :3000
Write-Host "-> restart scheduled task 'Merlin'" -ForegroundColor Gray
try { Stop-ScheduledTask -TaskName Merlin -ErrorAction Stop } catch { Write-Host "   (task was not running)" -ForegroundColor DarkGray }
Start-Sleep -Seconds 2

# 3b) Kill any ORPHANED Merlin node process. Stop-ScheduledTask kills the
#     hidden powershell wrapper but can leave its node child alive holding
#     :3000 - the new instance then dies EADDRINUSE while the OLD build keeps
#     serving, and the health check below green-lights stale code. (Burned
#     260713: three "successful" deploys, BUILD_ID six days old.)
Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue |
  Where-Object { $_.CommandLine -match 'merlin' -and $_.CommandLine -match 'next' } |
  ForEach-Object {
    Write-Host ("   killing orphaned merlin node PID {0}" -f $_.ProcessId) -ForegroundColor Yellow
    Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
  }

# 3b-ii) Belt & suspenders: kill WHOEVER owns :3000, by port (not by command-line
#     match, which missed the orphan and caused the 37h-stale-node blind spot). This
#     is the reliable way to free the port before Start-ScheduledTask.
Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue |
  Select-Object -ExpandProperty OwningProcess -Unique |
  ForEach-Object {
    Write-Host ("   freeing :3000 - killing PID {0}" -f $_) -ForegroundColor Yellow
    Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue
  }
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
if (-not $up) {
  Write-Host "[..] Not listening yet - give it a few more seconds, then load 127.0.0.1:3000." -ForegroundColor Yellow
  Write-Host "     If it never comes up, a stray manual 'next start' may still hold :3000 -" -ForegroundColor Yellow
  Write-Host '     close that console, or free port 3000: Get-NetTCPConnection -LocalPort 3000, then Stop-Process the owning PID.' -ForegroundColor Yellow
  exit 1
}

# 4b) STALE-NODE GUARD. Port-up is not enough - an orphaned OLD node holding :3000
#     answers 200 and green-lights stale code (the "37h uptime" blind spot). Assert
#     the node serving :3000 was built from the SHA we just built (next.config bakes
#     `git rev-parse --short HEAD` into /api/health.buildSha). Mismatch = stale node
#     still holding the port; fail LOUD so the deploy doesn't lie.
$expectedSha = (git rev-parse --short HEAD).Trim()
$servedSha = $null
foreach ($i in 1..10) {
  try {
    $h = Invoke-RestMethod -Uri 'http://127.0.0.1:3000/api/health' -TimeoutSec 5 -ErrorAction Stop
    $servedSha = $h.buildSha
    if ($servedSha -eq $expectedSha) { break }
  } catch { }
  Start-Sleep -Seconds 2
}
if ($servedSha -eq $expectedSha) {
  Write-Host "[OK] Merlin is up on :3000 serving build $servedSha (matches HEAD)." -ForegroundColor Green
} else {
  Write-Host "[STALE] :3000 is serving '$servedSha' but HEAD is '$expectedSha' - a stale node is holding the port." -ForegroundColor Red
  Write-Host "        The new build did NOT take. Free :3000 and re-run:" -ForegroundColor Red
  Write-Host '        Get-NetTCPConnection -LocalPort 3000 | Select -Expand OwningProcess | ForEach-Object { Stop-Process -Id $_ -Force }' -ForegroundColor Yellow
  Write-Host '        then Start-ScheduledTask -TaskName Merlin' -ForegroundColor Yellow
  exit 1
}
