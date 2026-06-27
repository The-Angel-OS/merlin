# 260622 Claude — elevated installer for the Merlin NSSM service.
# Installs/refreshes a Windows service "Merlin" that runs the compiled Next prod
# server (next start) from C:\Dev\merlin, auto-starts on boot, restarts on crash.
$ErrorActionPreference = 'Continue'
New-Item -ItemType Directory -Force -Path 'C:\Dev\merlin\logs' | Out-Null
Start-Transcript -Path 'C:\Dev\merlin\logs\service-install.log' -Force

$nssm    = "C:\Users\kenne\AppData\Local\Microsoft\WinGet\Packages\NSSM.NSSM_Microsoft.Winget.Source_8wekyb3d8bbwe\nssm-2.24-101-g897c7ad\win64\nssm.exe"
$node    = "C:\Program Files\nodejs\node.exe"
$nextBin = "C:\Dev\merlin\node_modules\next\dist\bin\next"

# Idempotent: remove any prior install first
& $nssm stop Merlin 2>$null
& $nssm remove Merlin confirm 2>$null
Start-Sleep -Seconds 1

& $nssm install Merlin $node "`"$nextBin`" start -H 0.0.0.0 -p 3000"
& $nssm set Merlin AppDirectory "C:\Dev\merlin"
& $nssm set Merlin DisplayName "Merlin - Angel OS Node"
& $nssm set Merlin Description "Merlin local-PC contributor node (compiled Next prod). Heartbeat + node-bus to Angel OS Core."
& $nssm set Merlin Start SERVICE_AUTO_START
& $nssm set Merlin AppExit Default Restart
& $nssm set Merlin AppRestartDelay 5000
& $nssm set Merlin AppStdout "C:\Dev\merlin\logs\merlin-out.log"
& $nssm set Merlin AppStderr "C:\Dev\merlin\logs\merlin-err.log"
& $nssm set Merlin AppRotateFiles 1
& $nssm set Merlin AppRotateBytes 10485760

& $nssm start Merlin
Start-Sleep -Seconds 4
"STATUS: " + (& $nssm status Merlin)
Stop-Transcript
