param(
  [Parameter(Mandatory = $true)]
  [string]$Root,
  [int]$Port = 3000,
  [int]$TimeoutSeconds = 35,
  [Parameter(Mandatory = $true)]
  [string]$OutLogFile,
  [Parameter(Mandatory = $true)]
  [string]$ErrLogFile,
  [Parameter(Mandatory = $true)]
  [string]$PidFile
)

$ErrorActionPreference = "Stop"

function Resolve-CloudflaredExe {
  if (-not [string]::IsNullOrWhiteSpace($env:CLOUDFLARED_EXE)) {
    if (Test-Path $env:CLOUDFLARED_EXE) {
      return (Resolve-Path $env:CLOUDFLARED_EXE).Path
    }
    throw "CLOUDFLARED_EXE points to a missing file: $($env:CLOUDFLARED_EXE)"
  }

  $candidates = @(
    (Join-Path $Root "cloudflared.exe"),
    (Join-Path $Root "runtime\cloudflared\cloudflared.exe"),
    (Join-Path $Root "tools\cloudflared\cloudflared.exe"),
    (Join-Path $env:LOCALAPPDATA "Microsoft\WinGet\Links\cloudflared.exe")
  )

  foreach ($candidate in $candidates) {
    if (Test-Path $candidate) {
      return (Resolve-Path $candidate).Path
    }
  }

  $commands = @(
    (Get-Command "cloudflared.exe" -ErrorAction SilentlyContinue),
    (Get-Command "cloudflared" -ErrorAction SilentlyContinue)
  ) | Where-Object { $_ -and $_.Source }

  if ($commands) {
    return $commands[0].Source
  }

  throw "cloudflared executable not found."
}

function Remove-FileIfExists([string]$PathValue) {
  if (Test-Path $PathValue) {
    Remove-Item -LiteralPath $PathValue -Force -ErrorAction SilentlyContinue
  }
}

function Get-TunnelUrlFromText([string]$Text) {
  if ([string]::IsNullOrWhiteSpace($Text)) {
    return $null
  }

  $match = [regex]::Match($Text, 'https://[-0-9a-zA-Z.]+trycloudflare\.com')
  if ($match.Success) {
    return $match.Value
  }

  return $null
}

Remove-FileIfExists $OutLogFile
Remove-FileIfExists $ErrLogFile
Remove-FileIfExists $PidFile

$cloudflaredExe = Resolve-CloudflaredExe
$targetUrl = "http://localhost:$Port"
$argumentList = @("tunnel", "--url", $targetUrl, "--no-autoupdate")

$process = Start-Process `
  -FilePath $cloudflaredExe `
  -ArgumentList $argumentList `
  -WorkingDirectory $Root `
  -WindowStyle Hidden `
  -RedirectStandardOutput $OutLogFile `
  -RedirectStandardError $ErrLogFile `
  -PassThru

Set-Content -LiteralPath $PidFile -Value $process.Id -NoNewline

$deadline = (Get-Date).AddSeconds($TimeoutSeconds)
$lastLogSnippet = ""

while ((Get-Date) -lt $deadline) {
  if ($process.HasExited) {
    $logText = @()
    if (Test-Path $OutLogFile) {
      $logText += Get-Content -LiteralPath $OutLogFile -Raw -ErrorAction SilentlyContinue
    }
    if (Test-Path $ErrLogFile) {
      $logText += Get-Content -LiteralPath $ErrLogFile -Raw -ErrorAction SilentlyContinue
    }
    $logText = ($logText -join [Environment]::NewLine).Trim()
    $message = if ([string]::IsNullOrWhiteSpace($logText)) {
      "cloudflared exited before creating a public tunnel."
    } else {
      "cloudflared exited before creating a public tunnel. Log: $logText"
    }
    throw $message
  }

  $logParts = @()
  if (Test-Path $OutLogFile) {
    $logParts += Get-Content -LiteralPath $OutLogFile -Raw -ErrorAction SilentlyContinue
  }
  if (Test-Path $ErrLogFile) {
    $logParts += Get-Content -LiteralPath $ErrLogFile -Raw -ErrorAction SilentlyContinue
  }
  $logText = ($logParts -join [Environment]::NewLine).Trim()
  if (-not [string]::IsNullOrWhiteSpace($logText)) {
    $lastLogSnippet = $logText
    $tunnelUrl = Get-TunnelUrlFromText $logText
    if ($tunnelUrl) {
      Write-Output "PUBLIC_URL=$tunnelUrl"
      Write-Output "PID=$($process.Id)"
      Write-Output "EXE=$cloudflaredExe"
      exit 0
    }
  }

  Start-Sleep -Milliseconds 500
}

try {
  if (-not $process.HasExited) {
    Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
  }
} finally {
  Remove-FileIfExists $PidFile
}

if (-not [string]::IsNullOrWhiteSpace($lastLogSnippet)) {
  throw "Timed out waiting for cloudflared to print a public URL. Log: $lastLogSnippet"
}

throw "Timed out waiting for cloudflared to print a public URL."
