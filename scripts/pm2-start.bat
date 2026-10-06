@echo off
:: ============================================================
:: pm2-start.bat
:: Tu dong khoi dong lai PM2 va app "noxh-app" sau khi Windows
:: server reboot. Dat file nay trong thu muc app (vd. C:\www\noxh)
:: va tu cau hinh chay tu dong (Task Scheduler / Startup folder).
:: ============================================================

setlocal
cd /d "%~dp0"

set LOGFILE=%~dp0pm2-start.log
echo ===== %date% %time% ===== >> "%LOGFILE%"

:: Kiem tra pm2 co duoc cai dat khong
where pm2 >nul 2>&1
if errorlevel 1 (
    echo LOI: Khong tim thay lenh "pm2". Cai dat bang: npm install -g pm2 >> "%LOGFILE%"
    exit /b 1
)

:: Doi vai giay de cac dich vu he thong (mang, v.v.) san sang sau khi vua boot
timeout /t 15 /nobreak >nul

:: Khoi phuc danh sach process da luu truoc do (yeu cau da chay "pm2 save" it nhat 1 lan)
pm2 resurrect >> "%LOGFILE%" 2>&1

:: Neu app chua tung duoc PM2 biet toi (chua co trong danh sach resurrect) thi start moi
pm2 describe noxh-app >nul 2>&1
if errorlevel 1 (
    echo noxh-app chua duoc PM2 dang ky, dang start moi... >> "%LOGFILE%"
    pm2 start dist\server.cjs --name noxh-app >> "%LOGFILE%" 2>&1
    pm2 save >> "%LOGFILE%" 2>&1
)

echo Hoan tat. >> "%LOGFILE%"
endlocal
