@echo off
setlocal EnableExtensions EnableDelayedExpansion

for %%I in ("%~dp0.") do set "ROOT=%%~fI"
if not defined PORT set "PORT=3000"
if not defined HOST set "HOST=0.0.0.0"
set "LOG_FILE=%ROOT%\server_runtime.log"
set "ERR_FILE=%ROOT%\server_error.log"
set "PID_FILE=%ROOT%\.gpp-server.pid"
set "NPM_EXE="
set "SCRIPTS_DIR=%ROOT%\scripts"

where node >nul 2>&1
if errorlevel 1 (
  echo [ERROR] node.exe not found in PATH.
  echo Please install Node.js 18+ first.
  pause
  exit /b 1
)

where npm.cmd >nul 2>&1
if errorlevel 1 (
  echo [ERROR] npm not found in PATH.
  echo Please install Node.js 18+ first.
  pause
  exit /b 1
)
for /f "delims=" %%I in ('where npm.cmd 2^>nul') do (
  set "NPM_EXE=%%I"
  goto :npm_ready
)

:npm_ready
if not defined NPM_EXE (
  echo [ERROR] npm executable path could not be resolved.
  pause
  exit /b 1
)

for /f "tokens=5" %%P in ('netstat -ano ^| findstr /R /C:":%PORT% .*LISTENING"') do (
  if not "%%P"=="0" (
    echo [ERROR] Port %PORT% is already in use by PID %%P.
    echo Please close that process or run stop_game.bat first.
    pause
    exit /b 1
  )
)

if not exist "%ROOT%\node_modules\" (
  echo Installing dependencies...
  call npm install
  if errorlevel 1 (
    echo [ERROR] npm install failed.
    pause
    exit /b 1
  )
)

echo Starting Galaxy Power Party (developer mode)...
powershell -NoProfile -ExecutionPolicy Bypass -File "%SCRIPTS_DIR%\launch_server.ps1" -Mode npm -Root "%ROOT%" -BindHost "%HOST%" -Port %PORT% -NpmExe "%NPM_EXE%" -OutLog "%LOG_FILE%" -ErrLog "%ERR_FILE%" >nul
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
