@echo off
setlocal
set "TASK=ScrapeeSyncAuto"
for %%I in ("%~dp0..\sync-auto.cmd") do set "SYNC=%%~fI"
if not exist "%SYNC%" (
  echo ไม่พบ %SYNC%
  pause
  exit /b 1
)
echo ลงทะเบียนงาน %TASK%
echo รัน: %SYNC%
echo จันทร์-เสาร์ 06:00-18:00 ทุก 1 ชม. ยกเว้นอาทิตย์ ต้องล็อกอินอยู่ ^(Chrome^)
schtasks /Create /F /TN "%TASK%" /TR "cmd /c set SCRAPEE_SYNC_NOPAUSE=1&& %SYNC%" /SC WEEKLY /D MON,TUE,WED,THU,FRI,SAT /ST 06:00 /RI 60 /DU 0012:00 /IT
echo.
pause
