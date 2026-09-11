param(
  [string]$Output = 'release-online'
)

$ErrorActionPreference = 'Stop'
if ([string]::IsNullOrWhiteSpace($env:RUNTIME_ASSET_BASE_URL)) {
  throw 'Thiếu biến RUNTIME_ASSET_BASE_URL. Hãy trỏ tới thư mục runtime đã upload qua HTTPS trước khi build installer online.'
}
if (-not $env:RUNTIME_ASSET_BASE_URL.StartsWith('https://')) {
  throw 'RUNTIME_ASSET_BASE_URL phải dùng HTTPS.'
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
