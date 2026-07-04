# 260704 Opus 4.8 - Host Merlin in the INTERACTIVE user session via a logon Scheduled
# Task, and REMOVE the old LocalSystem service.
#
# Why: a LocalSystem service runs in session 0, isolated from the interactive desktop,
# so it cannot enumerate/capture/drive windows or cameras (Sentinel sources come up
# empty). Running in the user's session restores full desktop access (window
# enumeration, gdigrab capture, dshow cameras, the user's PATH incl. ffmpeg) and is the
# prerequisite for the window-driving feature. Trade-off: Merlin now needs the user
# logged in.
#
# Run this ONCE, elevated. It self-elevates (UAC) if you do not. Idempotent.
#
#   powershell -ExecutionPolicy Bypass -File C:\Dev\merlin\install-merlin-user-session.ps1

param(
  [string]$TaskName = 'Merlin',
  [string]$User     = '',      # defaults to the logged-on interactive user
  [int]$Port        = 3000
)

$ErrorActionPreference = 'Stop'

# -- self-elevate --
$principal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltinRole]::Administrator)) {
  Write-Host 'Not elevated - relaunching as administrator (accept the UAC prompt)...' -ForegroundColor Yellow
  $argList = @('-NoProfile','-ExecutionPolicy','Bypass','-File',"`"$PSCommandPath`"",'-TaskName',$TaskName,'-Port',$Port)
  if ($User) { $argList += @('-User',$User) }
  Start-Process powershell.exe -Verb RunAs -ArgumentList $argList
  return
}

# -- resolve the interactive user + paths --
if (-not $User) {
  try { $User = (Get-CimInstance Win32_ComputerSystem).UserName } catch {}
  if (-not $User) { $User = "$env:USERDOMAIN\$env:USERNAME" }
}
$node    = 'C:\Program Files\nodejs\node.exe'
$nextBin = 'C:\Dev\merlin\node_modules\next\dist\bin\next'
$workDir = 'C:\Dev\merlin'
Write-Host "Target session user : $User"
Write-Host "Start command       : node `"$nextBin`" start -H 0.0.0.0 -p $Port  (cwd $workDir)"
if (-not (Test-Path $node))    { throw "node not found at $node" }
if (-not (Test-Path $nextBin)) { throw "next bin not found at $nextBin (run a build first: npm run build)" }

# -- 1) remove the old LocalSystem Merlin service --
if (Get-Service -Name 'Merlin' -ErrorAction SilentlyContinue) {
  Write-Host 'Removing the Merlin LocalSystem service...' -ForegroundColor Yellow
  $nssm = 'C:\Users\kenne\AppData\Local\Microsoft\WinGet\Packages\NSSM.NSSM_Microsoft.Winget.Source_8wekyb3d8bbwe\nssm-2.24-101-g897c7ad\win64\nssm.exe'
  if (Test-Path $nssm) { & $nssm stop Merlin 2>$null; & $nssm remove Merlin confirm 2>$null }
  else { & sc.exe stop Merlin 2>$null | Out-Null; & sc.exe delete Merlin 2>$null | Out-Null }
  Start-Sleep -Seconds 2
  Write-Host '  service removed.'
} else {
  Write-Host 'No Merlin service present (already removed).'
}

# Kill any lingering Merlin node process (frees the port and the :3002 events-server).
Get-CimInstance Win32_Process -Filter "Name='node.exe'" -ErrorAction SilentlyContinue |
  Where-Object { $_.CommandLine -match 'merlin' -and $_.CommandLine -match 'next' } |
  ForEach-Object { Write-Host ("  killing stray merlin node PID {0}" -f $_.ProcessId); Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
Start-Sleep -Milliseconds 800

# -- 2) register the logon Scheduled Task (interactive, hidden, resilient) --
Write-Host "Registering scheduled task '$TaskName' (at-logon, interactive session)..." -ForegroundColor Yellow

# Hidden launcher: a -WindowStyle Hidden PowerShell runs node in its own (hidden)
# console and WAITS on it, so the task stays Running (auto-restart applies) with no
# visible console window. The command is BASE64-ENCODED (UTF-16LE) via -EncodedCommand
# so Task Scheduler can't mangle the quoting of the space-containing "Program Files"
# path -- the plain -Command form did exactly that and exited code 1.
$inner = "& '$node' '$nextBin' start -H 0.0.0.0 -p $Port"
$enc   = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($inner))
$psArg = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -EncodedCommand $enc"

$action  = New-ScheduledTaskAction -Execute 'powershell.exe' -Argument $psArg -WorkingDirectory $workDir
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $User
$princ   = New-ScheduledTaskPrincipal -UserId $User -LogonType Interactive -RunLevel Highest
$set     = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
             -StartWhenAvailable -ExecutionTimeLimit ([TimeSpan]::Zero) `
             -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1) -MultipleInstances IgnoreNew

Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Principal $princ -Settings $set | Out-Null
Write-Host "  task '$TaskName' registered."

# -- 3) start it now (no need to log out/in) --
Write-Host 'Starting Merlin in your session now...' -ForegroundColor Yellow
Start-ScheduledTask -TaskName $TaskName
Start-Sleep -Seconds 7

$listen = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
if ($listen) {
  Write-Host ("[OK] Merlin is up in your session, listening on port {0} (PID {1})" -f $Port, $listen[0].OwningProcess) -ForegroundColor Green
} else {
  Write-Host "[..] Not listening on port $Port yet - give it ~10s, then load 127.0.0.1:$Port. Task info:" -ForegroundColor Yellow
  Get-ScheduledTask -TaskName $TaskName | Get-ScheduledTaskInfo | Select-Object TaskName, State, LastRunTime, LastTaskResult | Format-List
}

Write-Host ''
Write-Host 'Done. Merlin now runs in your INTERACTIVE session:' -ForegroundColor Cyan
Write-Host '  - Sentinel window/camera enumeration + capture work (session-0 isolation gone).'
Write-Host '  - Starts automatically at logon; auto-restarts on crash; hidden console.'
Write-Host '  - Requires you to be LOGGED IN (a witness/driver node lives in the session).'
Write-Host "  - Manage:  Stop-ScheduledTask / Start-ScheduledTask -TaskName $TaskName   (or Task Scheduler)."
