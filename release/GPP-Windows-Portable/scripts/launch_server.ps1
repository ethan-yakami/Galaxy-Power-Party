param(
  [ValidateSet("node", "npm")]
  [string]$Mode,
  [Parameter(Mandatory = $true)]
  [string]$Root,
  [string]$BindHost = "0.0.0.0",
  [int]$Port = 3000,
  [string]$NodeExe = "",
  [string]$NpmExe = "",
  [Parameter(Mandatory = $true)]
  [string]$OutLog,
  [Parameter(Mandatory = $true)]
  [string]$ErrLog
)

$ErrorActionPreference = "Stop"

$env:HOST = $BindHost
$env:PORT = "$Port"

if ($Mode -eq "node") {
  if ([string]::IsNullOrWhiteSpace($NodeExe) -or -not (Test-Path $NodeExe)) {
    throw "Node executable not found: $NodeExe"
  }

  $process = Start-Process `
    -FilePath $NodeExe `
    -ArgumentList "server.js" `
    -WorkingDirectory $Root `
    -WindowStyle Hidden `
    -RedirectStandardOutput $OutLog `
    -RedirectStandardError $ErrLog `
    -PassThru
}
else {
  if ([string]::IsNullOrWhiteSpace($NpmExe)) {
    throw "npm executable path is empty."
  }
  if (-not (Test-Path $NpmExe)) {
    if (Test-Path "$NpmExe.cmd") {
      $NpmExe = "$NpmExe.cmd"
    } else {
      throw "npm executable not found: $NpmExe"
    }
  }

  $process = Start-Process `
    -FilePath $NpmExe `
    -ArgumentList "start" `
    -WorkingDirectory $Root `
    -WindowStyle Hidden `
    -RedirectStandardOutput $OutLog `
    -RedirectStandardError $ErrLog `
    -PassThru
}

Write-Output $process.Id
