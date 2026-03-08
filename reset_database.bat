@echo off 
chcp 65001 >nul 2>nul 
title Thumbnail Master - Reset Database 
echo. 
echo  WARNING: This will recreate all tables! 
echo. 
set /p "CONFIRM=Type YES to confirm: " 
if /I not "%CONFIRM%"=="YES" goto :cancel_reset 
cd /d "C:\Projects\roblox-thumbnail-game\server" 
node scripts\initDb.js 
echo. 
echo Done. 
goto :end_reset 
:cancel_reset 
echo Cancelled. 
:end_reset 
pause 
