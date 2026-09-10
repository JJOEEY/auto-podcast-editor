$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$targetDir = Join-Path $root 'assets\models'
$target = Join-Path $targetDir 'ggml-base.bin'
$url = 'https://huggingface.co/ggerganov/whisper.cpp/resolve/main/ggml-base.bin?download=true'
New-Item -ItemType Directory -Path $targetDir -Force | Out-Null
Invoke-WebRequest -Uri $url -OutFile $target
Write-Host "Downloaded $target"
