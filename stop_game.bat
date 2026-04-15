@echo off
setlocal EnableExtensions EnableDelayedExpansion

for %%I in ("%~dp0.") do set "ROOT=%%~fI"
if not defined PORT set "PORT=3000"
set "PID_FILE=%ROOT%\.gpp-server.pid"
set "TUNNEL_PID_FILE=%ROOT%\.gpp-cloudflared.pid"
set "KILLED=0"

set "PORT_PIDS="
for /f "usebackq delims=" %%I in (`powershell -NoProfile -ExecutionPolicy Bypass -Command "(Get-NetTCPConnection -State Listen -LocalPort %PORT% -ErrorAction SilentlyContinue | Select-Object -ExpandProperty OwningProcess -Unique) -join ' '"`) do set "PORT_PIDS=%%I"

if defined PORT_PIDS (
  for %%P in (%PORT_PIDS%) do (
    taskkill /PID %%P /F >nul 2>&1
    if not errorlevel 1 (
      set /a KILLED+=1
      echo Stopped PID %%P on port %PORT%.
    )
  )
)

if exist "%PID_FILE%" del /q "%PID_FILE%" >nul 2>&1
if exist "%TUNNEL_PID_FILE%" (
  set /p TUNNEL_PID=<"%TUNNEL_PID_FILE%"
  if defined TUNNEL_PID (
    taskkill /PID !TUNNEL_PID! /F >nul 2>&1
    if not errorlevel 1 (
      set /a KILLED+=1
      echo Stopped Cloudflare tunnel PID !TUNNEL_PID!.
    )
  )
  del /q "%TUNNEL_PID_FILE%" >nul 2>&1
)

if !KILLED! EQU 0 (
  echo No listening process found on port %PORT%.
) else (
  echo Done. Stopped !KILLED! process^(es^).
)

exit /b 0
