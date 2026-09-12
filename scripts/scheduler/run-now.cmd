@echo off
setlocal
set "TASK=ScrapeeSyncAuto"
echo สั่งรัน %TASK% ทันที
schtasks /Run /TN "%TASK%"
echo.
pause
