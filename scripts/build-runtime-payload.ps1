param(
  [string]$Output = 'runtime-payload'
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$outputPath = [IO.Path]::GetFullPath((Join-Path $root $Output))
New-Item -ItemType Directory -Force -Path $outputPath | Out-Null
Get-ChildItem -LiteralPath $outputPath -File -Filter '*.zip' -ErrorAction SilentlyContinue | Remove-Item -Force

function New-Zip([string]$source, [string]$destination) {
  $staging = Join-Path $env:TEMP ("auto-podcast-runtime-" + [guid]::NewGuid().ToString('N'))
  New-Item -ItemType Directory -Force -Path $staging | Out-Null
  try {
    Get-ChildItem -LiteralPath $source -Force | Copy-Item -Destination $staging -Recurse -Force
    Compress-Archive -Path (Join-Path $staging '*') -DestinationPath $destination -CompressionLevel Fastest
  } finally {
    Remove-Item -LiteralPath $staging -Recurse -Force -ErrorAction SilentlyContinue
  }
}

New-Zip (Join-Path $root 'assets/bin') (Join-Path $outputPath 'core-runtime.zip')
New-Zip (Join-Path $root 'assets/remotion-browser') (Join-Path $outputPath 'remotion-browser.zip')
New-Zip (Join-Path $root 'assets/sfx/bundled') (Join-Path $outputPath 'sfx.zip')
Write-Output "Runtime payload written to $outputPath"
