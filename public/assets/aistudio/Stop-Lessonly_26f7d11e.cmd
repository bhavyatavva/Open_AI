@echo off
setlocal
cd /d "%~dp0"
docker compose --env-file .env.local.example -f compose.local.yaml stop
if errorlevel 1 (
  echo Could not stop the app. Check that Docker Desktop is running.
  pause
  exit /b 1
)
echo Lessonly stopped. Your accounts and projects remain in Docker's local database volume.
pause
