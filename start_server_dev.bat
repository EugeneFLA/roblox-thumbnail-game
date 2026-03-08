@echo off 
chcp 65001 >nul 2>nul 
title Thumbnail Master - Dev Server 
echo. 
echo  Thumbnail Master Dev Server 
echo  ============================ 
echo  Game:      http://localhost:3000 
echo  Dashboard: http://localhost:3000/dev 
echo. 
cd /d "C:\Projects\roblox-thumbnail-game\server" 
npx nodemon server.js 
pause 
