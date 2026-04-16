@echo off
setlocal EnableExtensions EnableDelayedExpansion

for %%I in ("%~dp0.") do set "ROOT=%%~fI"
if not defined PORT set "PORT=3000"
if not defined HOST set "HOST=0.0.0.0"

set "RUNTIME_DIR=%ROOT%\tmp\runtime"
if not exist "%RUNTIME_DIR%" mkdir "%RUNTIME_DIR%"
set "TUNNEL_LOG=%RUNTIME_DIR%\cloudflared.log"
set "TUNNEL_ERR_LOG=%RUNTIME_DIR%\cloudflared_error.log"
set "TUNNEL_PID_FILE=%RUNTIME_DIR%\.gpp-cloudflared.pid"
set "SCRIPTS_DIR=%ROOT%\scripts"
set "PUBLIC_URL="

call "%ROOT%\start_game.bat"
if errorlevel 1 (
  echo [ERROR] Local server failed to start, online tunnel skipped.
  exit /b 1
)

for /f "usebackq delims=" %%I in (`powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPTS_DIR%\start_cloudflare_tunnel.ps1" -Root "%ROOT%" -Port %PORT% -OutLogFile "%TUNNEL_LOG%" -ErrLogFile "%TUNNEL_ERR_LOG%" -PidFile "%TUNNEL_PID_FILE%" 2^>^&1`) do (
  set "LINE=%%I"
  if /I "!LINE:~0,11!"=="PUBLIC_URL=" set "PUBLIC_URL=!LINE:~11!"
  echo !LINE!
)

if not defined PUBLIC_URL (
  echo.
  echo [ERROR] Cloudflare tunnel did not return a public URL.
  echo Check log: "%TUNNEL_LOG%"
  echo Check err: "%TUNNEL_ERR_LOG%"
  exit /b 1
)

echo.
echo [OK] Public tunnel is ready.
echo Share: !PUBLIC_URL!
echo.
echo Tips:
echo 1. Send the Share URL to your friend.
echo 2. Both of you should open the same origin for WebSocket to work.
echo 3. Use stop_game.bat when finished to stop both server and tunnel.

exit /b 0
