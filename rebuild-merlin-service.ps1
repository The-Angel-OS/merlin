# 260622 Claude — elevated rebuild: stop service → prod build → start service.
$ErrorActionPreference = 'Continue'
$nssm = "C:\Users\kenne\AppData\Local\Microsoft\WinGet\Packages\NSSM.NSSM_Microsoft.Winget.Source_8wekyb3d8bbwe\nssm-2.24-101-g897c7ad\win64\nssm.exe"
New-Item -ItemType Directory -Force -Path 'C:\Dev\merlin\logs' | Out-Null
Start-Transcript -Path 'C:\Dev\merlin\logs\rebuild.log' -Force
& $nssm stop Merlin
Start-Sleep -Seconds 2
Set-Location 'C:\Dev\merlin'
$env:NODE_ENV = 'production'
& "C:\Users\kenne\AppData\Roaming\npm\pnpm.cmd" build
"BUILD_EXIT=$LASTEXITCODE"
& $nssm start Merlin
Start-Sleep -Seconds 5
"STATUS: " + (& $nssm status Merlin)
Stop-Transcript
