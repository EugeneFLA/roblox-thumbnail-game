@echo off 
chcp 65001 >nul 2>nul 
title Thumbnail Master - Start All 
echo. 
echo  Starting Thumbnail Master... 
echo. 
echo  Opening browser in 3 seconds... 
timeout /t 3 /nobreak >nul 
start "" "http://localhost:3000" 
start "" "http://localhost:3000/dev" 
echo. 
echo  Server running. Press Ctrl+C to stop. 
echo. 
cd /d "C:\Projects\roblox-thumbnail-game\server" 
node server.js 
pause 
