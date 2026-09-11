param(
  [string]$Output = 'release-online'
)

$ErrorActionPreference = 'Stop'
if ([string]::IsNullOrWhiteSpace($env:RUNTIME_ASSET_BASE_URL)) {
  throw 'Missing RUNTIME_ASSET_BASE_URL. Configure the HTTPS runtime asset location before building the online installer.'
}
if (-not $env:RUNTIME_ASSET_BASE_URL.StartsWith('https://')) {
  throw 'RUNTIME_ASSET_BASE_URL must use HTTPS.'
}

$root = Split-Path -Parent $PSScriptRoot
Push-Location $root
try {
  npm run runtime:payload
  npm run runtime:split
  npm run runtime:manifest
  npm run build:manifest
  npm run dist
  npx electron-builder --win nsis --config.directories.output=$Output
} finally {
  Pop-Location
}
