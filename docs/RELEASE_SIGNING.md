# Authenticode release signing

Chứng chỉ PFX không nằm trong repository. Trên máy release, đặt secret trong environment của phiên PowerShell:

```powershell
$env:CSC_LINK = 'D:\secrets\auto-podcast-editor.pfx'
$env:CSC_KEY_PASSWORD = '...'
npm run installer:signed
```

`CSC_KEY_PASSWORD` không được ghi vào file, log, commit hoặc chat. `CSC_LINK` có thể là đường dẫn PFX ngoài repository hoặc URL do electron-builder hỗ trợ.

Kiểm tra riêng installer:

```powershell
powershell -NoProfile -ExecutionPolicy Bypass -File scripts/verify-installer-signature.ps1 -InstallerPath '.\release\Auto Podcast Editor-Setup-0.1.0.exe'
```

Nếu chưa có chứng chỉ, trạng thái đúng là `NotSigned`; không dùng self-signed certificate để gọi là production-ready.
