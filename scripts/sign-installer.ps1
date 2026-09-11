$ErrorActionPreference = 'Stop'

if ([string]::IsNullOrWhiteSpace($env:CSC_LINK) -or [string]::IsNullOrWhiteSpace($env:CSC_KEY_PASSWORD)) {
  throw 'Thiếu CSC_LINK hoặc CSC_KEY_PASSWORD. Đặt secret trong environment ngoài repository rồi chạy lại.'
}

$certPath = $env:CSC_LINK
$isUrl = $false
[Uri]$parsed = $null
if ([Uri]::TryCreate($certPath, [UriKind]::Absolute, [ref]$parsed)) {
  $isUrl = $parsed.Scheme -in @('http', 'https')
}
if (-not $isUrl -and -not (Test-Path -LiteralPath $certPath -PathType Leaf)) {
  throw 'CSC_LINK không trỏ tới file PFX hợp lệ.'
}

Write-Host 'Đang build installer với Authenticode signing (không in secret).'
npm run installer

$releaseDir = Join-Path $PSScriptRoot '..\release'
$installer = Get-ChildItem -LiteralPath $releaseDir -Filter '*Setup-*.exe' -File |
  Sort-Object LastWriteTime -Descending |
  Select-Object -First 1
if ($null -eq $installer) { throw 'Không tìm thấy installer sau khi build.' }

$signature = Get-AuthenticodeSignature -LiteralPath $installer.FullName
if ($signature.Status -ne 'Valid') {
  throw "Installer chưa có chữ ký hợp lệ: $($signature.Status)"
}

Write-Host "Signature hợp lệ: $($installer.Name)"
Write-Host "Signer: $($signature.SignerCertificate.Subject)"
