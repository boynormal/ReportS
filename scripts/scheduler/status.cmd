@echo off
setlocal
set "TASK=ScrapeeSyncAuto"
schtasks /Query /TN "%TASK%" /V /FO LIST
echo.
pause
