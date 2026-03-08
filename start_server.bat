@echo off 
chcp 65001 >nul 2>nul 
title Thumbnail Master - Server 
echo. 
echo  Thumbnail Master Server 
echo  ======================== 
echo  Game:      http://localhost:3000 
echo  Dashboard: http://localhost:3000/dev 
echo  Health:    http://localhost:3000/health 
echo. 
echo  Press Ctrl+C to stop. 
echo. 
cd /d "C:\Projects\roblox-thumbnail-game\server" 
node server.js 
pause 
