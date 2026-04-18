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

function Normalize-ProcessPathEnvironment {
  $pathUpper = [System.Environment]::GetEnvironmentVariable('PATH', 'Process')
  $pathMixed = [System.Environment]::GetEnvironmentVariable('Path', 'Process')

  if ([string]::IsNullOrWhiteSpace($pathUpper)) {
    return
  }

  if ([string]::IsNullOrWhiteSpace($pathMixed)) {
    [System.Environment]::SetEnvironmentVariable('Path', $pathUpper, 'Process')
    [System.Environment]::SetEnvironmentVariable('PATH', $null, 'Process')
    return
  }

  if ($pathUpper -eq $pathMixed) {
    [System.Environment]::SetEnvironmentVariable('PATH', $null, 'Process')
    return
  }

  $merged = @($pathMixed, $pathUpper) -join ';'
  [System.Environment]::SetEnvironmentVariable('Path', $merged, 'Process')
  [System.Environment]::SetEnvironmentVariable('PATH', $null, 'Process')
}

$env:HOST = $BindHost
$env:PORT = "$Port"
Normalize-ProcessPathEnvironment
$serverScript = Join-Path $Root "server.js"

if ($Mode -eq "node") {
  if ([string]::IsNullOrWhiteSpace($NodeExe) -or -not (Test-Path $NodeExe)) {
    throw "Node executable not found: $NodeExe"
  }
  if (-not (Test-Path $serverScript)) {
    throw "Server entry script not found: $serverScript"
  }

  $process = Start-Process `
    -FilePath $NodeExe `
    -ArgumentList @($serverScript) `
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
