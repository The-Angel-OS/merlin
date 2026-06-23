# merlin.ps1 — user-process control for Merlin (no elevated Windows service).
#
# The autostart "MerlinUser" scheduled task (user logon, LIMITED rights) IS the process
# manager: its owner can start/end/rebuild it with NO elevation. That's what lets a
# Merlin be a lightweight user app — a "magician" — instead of an elevated service.
#
# Verbs:
#   launch   — foreground `pnpm start` (what the logon task runs; keeps the task alive)
#   start    — kick the task (brings Merlin up)
#   stop     — end the task (brings Merlin down)
#   rebuild  — stop → prod build → start  (the "flip a switch" rebuild; no elevation)
#   status   — task state + last result
param([Parameter(Position = 0)][string]$Cmd = 'status')
$ErrorActionPreference = 'Continue'

$Root = Split-Path -Parent $PSScriptRoot   # repo root (scripts/ is under it)
$Task = 'MerlinUser'
$pnpm = Join-Path $env:APPDATA 'npm\pnpm.cmd'
if (-not (Test-Path $pnpm)) { $pnpm = 'pnpm' }

function Invoke-Build {
  New-Item -ItemType Directory -Force -Path (Join-Path $Root 'logs') | Out-Null
  Set-Location $Root
  $env:NODE_ENV = 'production'
  & $pnpm build
  "BUILD_EXIT=$LASTEXITCODE"
}

switch ($Cmd) {
  'launch' {
    Set-Location $Root
    $env:NODE_ENV = 'production'
    & $pnpm start
  }
  'start' { schtasks /run /tn $Task }
  'stop' { schtasks /end /tn $Task }
  'rebuild' {
    "Stopping Merlin..."; schtasks /end /tn $Task 2>$null; Start-Sleep -Seconds 2
    Invoke-Build
    "Starting Merlin..."; schtasks /run /tn $Task
  }
  'status' {
    schtasks /query /tn $Task /v /fo LIST 2>$null | Select-String 'Status|Task To Run|Last Result'
  }
  default { "Usage: merlin.ps1 launch|start|stop|rebuild|status" }
}
