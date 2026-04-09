param(
  [Parameter(Mandatory = $true)]
  [string]$Url,
  [int]$TimeoutSeconds = 30,
  [int]$IntervalMs = 500
)

$ErrorActionPreference = "SilentlyContinue"

try {
  $uri = [System.Uri]$Url
}
catch {
  exit 1
}

$hostName = $uri.Host
$port = if ($uri.Port -gt 0) { $uri.Port } else { 80 }
$deadline = (Get-Date).AddSeconds($TimeoutSeconds)

while ((Get-Date) -lt $deadline) {
  $client = New-Object System.Net.Sockets.TcpClient
  try {
    $result = $client.BeginConnect($hostName, $port, $null, $null)
    $connected = $result.AsyncWaitHandle.WaitOne(1200, $false)
    if ($connected -and $client.Connected) {
      $client.EndConnect($result) | Out-Null
      $client.Close()
      exit 0
    }
  }
  catch {
  }
  finally {
    $client.Close()
  }

  Start-Sleep -Milliseconds $IntervalMs
}

exit 1
