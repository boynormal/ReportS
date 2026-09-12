@echo off
cd /d "%~dp0.."
echo Starting dashboard at http://localhost:3100
echo Postgres must already be running as a Windows service.
npm run dev:web
