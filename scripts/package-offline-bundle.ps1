param(
  [string]$Source = 'release-v011/win-unpacked',
  [string]$Output = 'release-v011/offline-bundle',
  [int]$VolumeMiB = 1900
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$sourcePath = [IO.Path]::GetFullPath((Join-Path $root $Source))
$outputPath = [IO.Path]::GetFullPath((Join-Path $root $Output))
$sevenZip = Join-Path $env:LOCALAPPDATA 'electron-builder/Cache/7zip@1.0.0/7zip-win-x64-a34pt/bin/7za.exe'
$archiveBase = Join-Path $outputPath 'Auto Podcast Editor-0.1.1-full.7z'
$buildManifest = Get-Content -LiteralPath (Join-Path $root 'assets/build-manifest.json') -Raw | ConvertFrom-Json

function Get-Sha256([string]$path) {
  $sha = [Security.Cryptography.SHA256]::Create()
  try {
    $stream = [IO.File]::OpenRead($path)
    try { return ([BitConverter]::ToString($sha.ComputeHash($stream))).Replace('-', '').ToLowerInvariant() }
    finally { $stream.Dispose() }
  } finally { $sha.Dispose() }
}

if (-not (Test-Path -LiteralPath $sourcePath -PathType Container)) { throw "Bundle not found: $sourcePath" }
if (-not (Test-Path -LiteralPath $sevenZip -PathType Leaf)) { throw "7za not found: $sevenZip" }
New-Item -ItemType Directory -Force -Path $outputPath | Out-Null
Get-ChildItem -LiteralPath $outputPath -Filter 'Auto Podcast Editor-0.1.1-full.7z.*' -File -ErrorAction SilentlyContinue | Remove-Item -Force

& $sevenZip a -t7z "-v${VolumeMiB}m" '-mx=1' '-mmt=on' $archiveBase (Join-Path $sourcePath '*')
if ($LASTEXITCODE -ne 0) { throw "7za failed: $LASTEXITCODE" }

$parts = @(Get-ChildItem -LiteralPath $outputPath -Filter 'Auto Podcast Editor-0.1.1-full.7z.*' -File | Sort-Object Name)
if ($parts.Count -eq 0) { throw 'No offline bundle parts were created' }
$manifest = [ordered]@{
  version = $buildManifest.version
  buildId = $buildManifest.buildId
  format = '7z-multipart'
  partCount = $parts.Count
  volumeMiB = $VolumeMiB
  source = $Source
  parts = @($parts | ForEach-Object { [ordered]@{ name = $_.Name; bytes = $_.Length; sha256 = Get-Sha256 $_.FullName } })
}
$manifest | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath (Join-Path $outputPath 'manifest.json') -Encoding UTF8
Write-Output ($manifest | ConvertTo-Json -Depth 5)
