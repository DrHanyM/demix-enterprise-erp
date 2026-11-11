$ErrorActionPreference = "Stop"

Set-Location $PSScriptRoot

if (-not (Test-Path ".env")) {
    Write-Host "ERROR: .env file is missing." -ForegroundColor Red
    exit 1
}

Write-Host "Starting DeMix Clerk MCP..." -ForegroundColor Cyan

npm start

if ($LASTEXITCODE -ne 0) {
    Write-Host "MCP server stopped with an error." -ForegroundColor Red
    exit $LASTEXITCODE
}
