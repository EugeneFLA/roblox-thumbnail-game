@echo off 
chcp 65001 >nul 2>nul 
title Thumbnail Master - Roblox Data Loader 
echo Loading Roblox data... 
echo. 
cd /d "C:\Projects\roblox-thumbnail-game\server" 
node scripts\seedRoblox.js 
echo. 
echo Done. 
pause 
