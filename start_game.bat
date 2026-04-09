@echo off
setlocal EnableExtensions EnableDelayedExpansion

for %%I in ("%~dp0.") do set "ROOT=%%~fI"
if not defined PORT set "PORT=3000"
if not defined HOST set "HOST=0.0.0.0"

set "LOG_FILE=%ROOT%\server_runtime.log"
set "ERR_FILE=%ROOT%\server_error.log"
set "PID_FILE=%ROOT%\.gpp-server.pid"
set "NODE_EXE=%ROOT%\runtime\node\node.exe"
set "SCRIPTS_DIR=%ROOT%\scripts"

if not exist "%NODE_EXE%" (
  for /f "delims=" %%I in ('where node 2^>nul') do (
    set "NODE_EXE=%%I"
    goto :node_ready
  )
  echo [ERROR] Node runtime not found.
  echo 1^) Portable mode needs runtime\node\node.exe
  echo 2^) Or install Node.js and add node.exe to PATH
  pause
  exit /b 1
)

:node_ready
for /f "tokens=5" %%P in ('netstat -ano ^| findstr /R /C:":%PORT% .*LISTENING"') do (
  if not "%%P"=="0" (
    echo [ERROR] Port %PORT% is already in use by PID %%P.
    echo Please close that process or run stop_game.bat first.
    pause
    exit /b 1
  )
)

echo Starting Galaxy Power Party...
powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPTS_DIR%\launch_server.ps1" -Mode node -Root "%ROOT%" -BindHost "%HOST%" -Port %PORT% -NodeExe "%NODE_EXE%" -OutLog "%LOG_FILE%" -ErrLog "%ERR_FILE%" >nul
if errorlevel 1 (
  echo [ERROR] Failed to launch server process.
  pause
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPTS_DIR%\wait_http.ps1" -Url "http://localhost:%PORT%" -TimeoutSeconds 30
if errorlevel 1 (
  echo [ERROR] Server startup timed out.
  echo Check log: "%LOG_FILE%"
  pause
  exit /b 1
)

set "LISTEN_PID="
for /f "tokens=5" %%P in ('netstat -ano ^| findstr /R /C:":%PORT% .*LISTENING"') do (
  set "LISTEN_PID=%%P"
  goto :pid_ready
)

:pid_ready
if defined LISTEN_PID (
  > "%PID_FILE%" echo !LISTEN_PID!
)
if not defined LISTEN_PID (
  echo [ERROR] Server process started but no listening PID found on port %PORT%.
  pause
  exit /b 1
)

set "LAN_IP="
for /f "usebackq delims=" %%I in (`powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPTS_DIR%\get_lan_ip.ps1"`) do set "LAN_IP=%%I"

echo.
echo [OK] Server is running.
echo Local: http://localhost:%PORT%
if defined LAN_IP (
  echo LAN  : http://%LAN_IP%:%PORT%
) else (
  echo LAN  : Not detected. ^(You can still use localhost^)
)

if /I "%GPP_NO_BROWSER%"=="1" (
  echo Browser auto-open skipped ^(GPP_NO_BROWSER=1^).
) else (
  start "" "http://localhost:%PORT%"
)

exit /b 0
