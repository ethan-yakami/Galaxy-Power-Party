$ErrorActionPreference = "SilentlyContinue"

$ip = Get-NetIPAddress -AddressFamily IPv4 |
  Where-Object {
    $_.IPAddress -notlike "127.*" -and
    $_.InterfaceOperationalStatus -eq "Up" -and
    $_.PrefixOrigin -ne "WellKnown"
  } |
  Select-Object -First 1 -ExpandProperty IPAddress

if ($ip) {
  Write-Output $ip
}
