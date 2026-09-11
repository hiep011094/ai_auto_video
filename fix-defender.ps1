# Fix Windows Defender slow filesystem for Next.js
# Chạy file này với quyền Administrator

Write-Host "Dang them exclusion vao Windows Defender..." -ForegroundColor Yellow

Add-MpPreference -ExclusionPath "D:\vutru_ai"
Add-MpPreference -ExclusionPath "D:\vutru_ai\.next"
Add-MpPreference -ExclusionPath "D:\vutru_ai\node_modules"

Write-Host "Da them xong! Kiem tra lai:" -ForegroundColor Green
Get-MpPreference | Select-Object -ExpandProperty ExclusionPath

Write-Host ""
Write-Host "Hoan tat! Hay restart dev server de thay hieu qua." -ForegroundColor Cyan
pause
