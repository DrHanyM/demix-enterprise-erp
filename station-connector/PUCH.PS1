#requires -Version 5.1
$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$Python = (Get-Command py.exe -ErrorAction Stop).Source
& $Python (Join-Path $Root "connector.py")
exit $LASTEXITCODE
