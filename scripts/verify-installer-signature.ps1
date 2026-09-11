param(
  [Parameter(Mandatory = $true)]
  [string]$InstallerPath
)
$ErrorActionPreference = 'Stop'

if (-not (Test-Path -LiteralPath $InstallerPath -PathType Leaf)) {
  throw 'Không tìm thấy installer.'
}

$signature = Get-AuthenticodeSignature -LiteralPath $InstallerPath
[pscustomobject]@{
  Path = (Resolve-Path -LiteralPath $InstallerPath).Path
  Status = [string]$signature.Status
  Subject = if ($signature.SignerCertificate) { $signature.SignerCertificate.Subject } else { $null }
  Thumbprint = if ($signature.SignerCertificate) { $signature.SignerCertificate.Thumbprint } else { $null }
} | ConvertTo-Json -Depth 3

if ($signature.Status -ne 'Valid') { exit 1 }
