# install-merlin.ps1 — the magician installer. Stand a Merlin up as a user-process
# (no elevated service, no admin) and set it to autostart at logon. Run as your normal
# user from anywhere:  powershell -ExecutionPolicy Bypass -File scripts\install-merlin.ps1
#
# This is the "drop a Merlin on anything" setup: install deps → build → register a
# user logon task → start. Future rebuilds: scripts\merlin.ps1 rebuild (no elevation).
param(
  [string]$Root = (Split-Path -Parent $PSScriptRoot),
  [string]$Endeavor = $env:MERLIN_ENDEAVOR,
  [string]$AngelsUrl = $env:MERLIN_ANGELS_URL
)
$ErrorActionPreference = 'Stop'
$Task = 'MerlinUser'
$pnpm = Join-Path $env:APPDATA 'npm\pnpm.cmd'
if (-not (Test-Path $pnpm)) { $pnpm = 'pnpm' }

Write-Host "== Merlin installer ==" -ForegroundColor Cyan

# A legacy elevated 'Merlin' service would hold the port — flag it (removal is the one
# elevated step; everything here is user-level).
$legacy = Get-Service -Name 'Merlin' -ErrorAction SilentlyContinue
if ($legacy) {
  Write-Warning "Legacy elevated service 'Merlin' present ($($legacy.Status)). Remove it ONCE, elevated:"
  Write-Warning "    nssm stop Merlin; nssm remove Merlin confirm"
  Write-Warning "Then re-run this installer."
}

Set-Location $Root
Write-Host "Installing dependencies..." -ForegroundColor Cyan
& $pnpm install

Write-Host "Building (production)..." -ForegroundColor Cyan
$env:NODE_ENV = 'production'
& $pnpm build
if ($LASTEXITCODE -ne 0) { throw "build failed ($LASTEXITCODE)" }

# Register the user logon autostart task (no admin). Task Scheduler manages the process.
$tr = "powershell.exe -NoProfile -ExecutionPolicy Bypass -File `"$Root\scripts\merlin.ps1`" launch"
schtasks /create /tn $Task /tr $tr /sc ONLOGON /rl LIMITED /f | Out-Null
Write-Host "Registered user logon task '$Task'." -ForegroundColor Green

# Optional zero-click preconfig: bake the endeavor into the launch env so a fresh drop
# auto-locks-on (pairs with MERLIN_ENDEAVOR / share presets).
if ($Endeavor) {
  [Environment]::SetEnvironmentVariable('MERLIN_ENDEAVOR', $Endeavor, 'User')
  if ($AngelsUrl) { [Environment]::SetEnvironmentVariable('MERLIN_ANGELS_URL', $AngelsUrl, 'User') }
  Write-Host "Preconfigured to auto-lock-on: $Endeavor" -ForegroundColor Green
}

if (-not $legacy) {
  schtasks /run /tn $Task | Out-Null
  Write-Host "Merlin started as a user process. Rebuild anytime: scripts\merlin.ps1 rebuild" -ForegroundColor Green
} else {
  Write-Host "Remove the legacy service first (above), then re-run to start." -ForegroundColor Yellow
}
