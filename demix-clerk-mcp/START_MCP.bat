@echo off
cd /d "%~dp0"
if not exist .env (
  echo Missing .env. Copy .env.example to .env and fill values locally.
  pause
  exit /b 1
)
powershell -NoProfile -ExecutionPolicy Bypass -File ".\start.ps1"
pause
