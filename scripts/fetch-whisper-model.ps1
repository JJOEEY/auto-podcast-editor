$ErrorActionPreference = 'Stop'
$tier = if ($args.Count -gt 0) { $args[0] } else { 'base' }
if ($tier -notin @('base', 'small')) { throw 'Tier must be base or small' }
$root = Split-Path -Parent $PSScriptRoot
$targetDir = Join-Path $root 'assets\models'
$target = Join-Path $targetDir ("ggml-$tier.bin")
$url = "https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-$tier.bin?download=true"
New-Item -ItemType Directory -Path $targetDir -Force | Out-Null
Invoke-WebRequest -Uri $url -OutFile $target
Write-Host "Downloaded $target"
