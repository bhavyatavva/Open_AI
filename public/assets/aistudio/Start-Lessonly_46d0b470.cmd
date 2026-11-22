@echo off
setlocal
cd /d "%~dp0"
docker info >nul 2>&1
if errorlevel 1 (
  echo Open Docker Desktop and wait until its engine is running, then try again.
  echo Installation: https://docs.docker.com/desktop/setup/install/windows-install/
  pause
  exit /b 1
)
docker compose version >nul 2>&1
if errorlevel 1 (
  echo Docker Compose v2 is required. Update Docker Desktop and try again.
  pause
  exit /b 1
)
if not exist ".env.local" (
  copy ".env.local.example" ".env.local" >nul
  if errorlevel 1 goto failed
)
echo Starting Lessonly. The first launch downloads and builds dependencies.
echo Keep this window open until startup finishes.
docker compose --env-file .env.local -f compose.local.yaml up -d --build --wait --wait-timeout 180
if errorlevel 1 goto failed
start "" "http://localhost:8080"
echo Lessonly is ready at http://localhost:8080
echo Create an account. Leave the invitation code blank for this local installation.
echo To enable real AI, edit .env.local in Notepad and run this launcher again.
echo You can close this window. Keep Docker Desktop running while using the app.
pause
exit /b 0
:failed
echo Startup did not finish. Read the error above and check LOCAL_START.txt.
pause
exit /b 1
