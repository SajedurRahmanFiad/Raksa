@echo off
set ADMIN_PASSWORD=%ADMIN_PASSWORD%
if "%ADMIN_PASSWORD%"=="" set ADMIN_PASSWORD=RAKSA@2026
node server.js
pause
