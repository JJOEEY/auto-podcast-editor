param(
  [string]$BundleDir = 'release-v011/offline-bundle',
  [string]$Destination = 'qa/product-candidate/offline-installed'
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$bundlePath = [IO.Path]::GetFullPath((Join-Path $root $BundleDir))
$destinationPath = [IO.Path]::GetFullPath((Join-Path $root $Destination))
$sevenZip = Join-Path $env:LOCALAPPDATA 'electron-builder/Cache/7zip@1.0.0/7zip-win-x64-a34pt/bin/7za.exe'
$manifestPath = Join-Path $bundlePath 'manifest.json'
$firstPart = Join-Path $bundlePath 'Auto Podcast Editor-0.1.1-full.7z.001'

if (-not (Test-Path -LiteralPath $sevenZip -PathType Leaf)) { throw "7za not found: $sevenZip" }
if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) { throw "Bundle manifest not found: $manifestPath" }
if (-not (Test-Path -LiteralPath $firstPart -PathType Leaf)) { throw "First bundle part not found: $firstPart" }
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
foreach ($part in $manifest.parts) {
  $path = Join-Path $bundlePath $part.name
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "Missing bundle part: $path" }
}
New-Item -ItemType Directory -Force -Path $destinationPath | Out-Null
& $sevenZip x $firstPart "-o$destinationPath" '-y'
if ($LASTEXITCODE -ne 0) { throw "7za extraction failed: $LASTEXITCODE" }
Write-Output "Offline bundle extracted to $destinationPath"
