param(
  [string]$OutputRoot = ""
)

$ErrorActionPreference = "Stop"

$ProjectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
if ([string]::IsNullOrWhiteSpace($OutputRoot)) {
  $OutputRoot = Join-Path $ProjectRoot "release"
}

$TargetDir = Join-Path $OutputRoot "GPP-Windows-Portable"
$RuntimeTargetDir = Join-Path $TargetDir "runtime\\node"
$ZipPath = Join-Path $OutputRoot "GPP-Windows-Portable.zip"

Write-Host "[1/6] Preparing output directory..."
if (Test-Path $TargetDir) {
  Remove-Item $TargetDir -Recurse -Force
}
New-Item -ItemType Directory -Path $TargetDir -Force | Out-Null

$nodeModulesPath = Join-Path $ProjectRoot "node_modules"
if (-not (Test-Path $nodeModulesPath)) {
  throw "node_modules not found. Run npm install first."
}

Write-Host "[2/6] Copying project files..."
$copyItems = @(
  "src",
  "public",
  "picture",
  "server",
  "scripts",
  "tools",
  "docs",
  "server.js",
  "package.json",
  "package-lock.json",
  "README.md",
  "start_game.bat",
  "stop_game.bat",
  "start_dev.bat"
)

foreach ($item in $copyItems) {
  $source = Join-Path $ProjectRoot $item
  if (-not (Test-Path $source)) {
    throw "Required item missing: $item"
  }
  Copy-Item -Path $source -Destination $TargetDir -Recurse -Force
}

Write-Host "[3/6] Copying node_modules..."
Copy-Item -Path $nodeModulesPath -Destination $TargetDir -Recurse -Force

Write-Host "[4/6] Copying Node runtime..."
New-Item -ItemType Directory -Path $RuntimeTargetDir -Force | Out-Null
$nodeExe = (Get-Command node -ErrorAction Stop).Source
$nodeHome = Split-Path $nodeExe -Parent

$runtimePatterns = @(
  "node.exe",
  "*.dll",
  "*.dat",
  "*.pem",
  "LICENSE*"
)

foreach ($pattern in $runtimePatterns) {
  $files = Get-ChildItem -Path $nodeHome -Filter $pattern -File -ErrorAction SilentlyContinue
  foreach ($file in $files) {
    Copy-Item -Path $file.FullName -Destination $RuntimeTargetDir -Force
  }
}

if (-not (Test-Path (Join-Path $RuntimeTargetDir "node.exe"))) {
  throw "Failed to copy runtime node.exe"
}

Write-Host "[5/6] Writing portable note..."
$portableNote = @"
Galaxy Power Party - Windows Portable Package

How to use:
1) Double-click start_game.bat
2) Browser will open automatically
3) Double-click stop_game.bat when finished

Notes:
- This package is offline-ready and does not require installing Node.js
- To change port, set PORT before running start_game.bat
- To force local-only binding, set HOST=127.0.0.1 before startup
"@
Set-Content -Path (Join-Path $TargetDir "PORTABLE_README.txt") -Value $portableNote -Encoding UTF8

Write-Host "[6/6] Creating ZIP archive..."
if (Test-Path $ZipPath) {
  Remove-Item $ZipPath -Force
}
Compress-Archive -Path (Join-Path $TargetDir "*") -DestinationPath $ZipPath -Force

Write-Host ""
Write-Host "Done."
Write-Host "Portable folder: $TargetDir"
Write-Host "Portable zip:    $ZipPath"
