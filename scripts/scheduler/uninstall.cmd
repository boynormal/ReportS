@echo off
setlocal
set "TASK=ScrapeeSyncAuto"
echo ลบงาน %TASK%
schtasks /Delete /TN "%TASK%" /F
echo.
pause
