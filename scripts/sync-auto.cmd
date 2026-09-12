@echo off
cd /d "%~dp0.."
echo Auth (Chrome) then incremental sync. Leave this window open if Chrome needs a login.
call npm run sync:auto
set ERR=%ERRORLEVEL%
if %ERR% neq 0 (
  echo.
  echo ไม่สำเร็จ รหัส %ERR% — ถ้าเห็น C:\Program แปลว่ายังใช้สคริปต์เก่า
)
if /i "%SCRAPEE_SYNC_NOPAUSE%"=="1" exit /b %ERR%
echo.
pause
exit /b %ERR%
