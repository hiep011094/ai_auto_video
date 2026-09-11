@echo off
setlocal enabledelayedexpansion
echo ============================================
echo  Fix Firewall cho Next.js Dev Server
echo  Ap dung tren moi may Windows
echo ============================================
echo.

REM -- Lay IP cua may nay
for /f "tokens=2 delims=:" %%A in ('ipconfig ^| findstr /c:"IPv4"') do (
    set "RAW_IP=%%A"
    set "RAW_IP=!RAW_IP: =!"
    REM Chi lay IP bat dau bang 192.168 hoac 10. hoac 172.
    echo !RAW_IP! | findstr /r "^192\.168\. ^10\. ^172\." >nul 2>&1
    if not errorlevel 1 (
        if not defined LOCAL_IP set "LOCAL_IP=!RAW_IP!"
    )
)

if not defined LOCAL_IP (
    echo [CANH BAO] Khong tim thay IP LAN. Kiem tra ket noi mang.
    set LOCAL_IP=???
) else (
    echo [OK] IP cua may nay: !LOCAL_IP!
)

echo.
echo -- Xoa rule cu neu co...
netsh advfirewall firewall delete rule name="Next.js Dev Port 3000" >nul 2>&1
netsh advfirewall firewall delete rule name="Next.js Dev Port 3001" >nul 2>&1

echo -- Tao rule moi: cho phep TẤT CA profile (Domain + Private + Public)...
netsh advfirewall firewall add rule ^
    name="Next.js Dev Port 3001" ^
    dir=in ^
    action=allow ^
    protocol=TCP ^
    localport=3001 ^
    profile=any ^
    description="Cho phep truy cap Next.js dev server tu LAN (dien thoai, tablet, may tinh khac)"

echo.
echo -- Ket qua:
netsh advfirewall firewall show rule name="Next.js Dev Port 3001" | findstr /c:"Profiles" /c:"Action" /c:"LocalPort"

echo.
echo ============================================
echo  XONG! Cac thiet bi trong mang LAN co the
echo  truy cap Next.js dev server tai:
echo  http://!LOCAL_IP!:3001/
echo ============================================
echo.
echo  Luu y: Rule nay giu nguyen sau khi khoi dong lai may.
echo  De xoa, chay: netsh advfirewall firewall delete rule name="Next.js Dev Port 3001"
echo.
pause
endlocal
