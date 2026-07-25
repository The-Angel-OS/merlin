# cycle.ps1 — rebuild + restart Merlin on :3000.
#
# Matches the actual runtime: a bare `pnpm start` node process (no Windows
# service, no scheduled task, no elevation). Build FIRST — the old server keeps
# serving while it compiles — then swap only if the build is clean, so a broken
# build never takes the site down (that's what left the mismatched .next behind).
#
# Usage:  .\cycle.ps1          (full cycle: build -> stop :3000 -> start)
#         .\cycle.ps1 -NoBuild (just restart the current build)
#
# Ends in a foreground `pnpm start` — run it in a terminal you leave open, the
# same way :3000 runs today. Ctrl+C stops Merlin.
param([switch]$NoBuild)

Set-Location $PSScriptRoot
$pnpm = Join-Path $env:APPDATA 'npm\pnpm.cmd'
if (-not (Test-Path $pnpm)) { $pnpm = 'pnpm' }

if (-not $NoBuild) {
  Write-Host '[cycle] building (current server stays up)...' -ForegroundColor Cyan
  $env:NODE_ENV = 'production'
  & $pnpm build
  if ($LASTEXITCODE -ne 0) {
    Write-Host '[cycle] build FAILED — leaving the running server untouched.' -ForegroundColor Red
    exit 1
  }
}

Write-Host '[cycle] stopping whatever holds :3000...' -ForegroundColor Cyan
Get-NetTCPConnection -LocalPort 3000 -State Listen -ErrorAction SilentlyContinue |
  Select-Object -ExpandProperty OwningProcess -Unique |
  ForEach-Object { Stop-Process -Id $_ -Force -ErrorAction SilentlyContinue }
Start-Sleep -Seconds 1

Write-Host '[cycle] starting Merlin on :3000...' -ForegroundColor Green
$env:NODE_ENV = 'production'
& $pnpm start
