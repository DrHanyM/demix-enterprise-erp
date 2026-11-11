#requires -Version 5.1
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$TaskName = "DEMIX_PRODUCTION_SYNC"
$WorkRoot = "D:\\DEMIX_SYNC"
$Python = (Get-Command py.exe -ErrorAction Stop).Source
if (-not (Test-Path (Join-Path $Root "CONFIG"))) { throw "CONFIG is missing." }
if (-not (Test-Path (Join-Path $Root "station-profile.json"))) { throw "station-profile.json is missing; download the generated station package." }
$Lines = @(Get-Content (Join-Path $Root "CONFIG") | Where-Object { $_.Trim() -ne "" -and -not $_.Trim().StartsWith("#") })
if ($Lines.Count -ne 1) { throw "CONFIG must contain exactly one non-empty database path line." }
New-Item -ItemType Directory -Force -Path "$WorkRoot\\DATA","$WorkRoot\\LOGS" | Out-Null
& $Python -m pip install --disable-pip-version-check -r (Join-Path $Root "requirements.txt")
if ($LASTEXITCODE -ne 0) { throw "Python dependency installation failed." }
$Profile = Join-Path $Root "station-profile.json"
& icacls $Profile /inheritance:r /grant:r "SYSTEM:(R)" "Administrators:(F)" | Out-Null
if ($LASTEXITCODE -ne 0) { throw "Could not secure station-profile.json ACL." }
$Action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -NonInteractive -ExecutionPolicy Bypass -File `"$Root\\PUCH.PS1`"" -WorkingDirectory $Root
$Startup = New-ScheduledTaskTrigger -AtStartup
$Repeat = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 7) -RepetitionDuration (New-TimeSpan -Days 3650)
$Principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
$Settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -ExecutionTimeLimit ([TimeSpan]::Zero) -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -StartWhenAvailable
$Task = New-ScheduledTask -Action $Action -Trigger @($Startup,$Repeat) -Principal $Principal -Settings $Settings
Register-ScheduledTask -TaskName $TaskName -InputObject $Task -Force | Out-Null
Write-Host "Installed $TaskName: every 7 minutes and at Windows startup."
Write-Host "Change the repetition interval later in Task Scheduler if station operating hours change."
Write-Host "Installer does not send data. Perform a supervised test before production activation."
