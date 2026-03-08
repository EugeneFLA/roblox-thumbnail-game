@echo off
chcp 65001 >nul 2>nul
setlocal EnableExtensions EnableDelayedExpansion
title Thumbnail Master - Windows 11 Installer

REM ============================================
REM  CONFIG
REM ============================================
set "PROJECT_ROOT=%~dp0"
set "PROJECT_ROOT=%PROJECT_ROOT:~0,-1%"
set "SERVER_DIR=%PROJECT_ROOT%\server"
set "CLIENT_DIR=%PROJECT_ROOT%\client"
set "DASHBOARD_DIR=%PROJECT_ROOT%\dashboard"
set "UPLOADS_DIR=%PROJECT_ROOT%\uploads\thumbnails"
set "DB_NAME=thumbnail_game"
set "DB_USER=postgres"
set "DB_HOST=localhost"
set "DB_PORT=5432"
set "DB_PASSWORD="
set "ERRORS=0"
set "STEP=0"
set "PG_SERVICE_OK=0"
set "NODE_INSTALLED=0"
set "PG_INSTALLED=0"

REM Check for admin rights
net session >nul 2>nul
if errorlevel 1 (
  echo.
  echo  [INFO] Requesting administrator privileges...
  powershell -NoProfile -Command "Start-Process -FilePath '%~f0' -Verb RunAs"
  exit /b
)

cls
echo.
echo  +==================================================+
echo  *                                                  *
echo  *   THUMBNAIL MASTER - Windows 11 Installer        *
echo  *                                                  *
echo  *   Game for Yandex Games + Developer Dashboard    *
echo  *                                                  *
echo  +==================================================+
echo.
echo  Project: %PROJECT_ROOT%
echo.
echo  This script will:
echo    1. Check and install system dependencies (Node.js, PostgreSQL)
echo    2. Install npm packages
echo    3. Create PostgreSQL database
echo    4. Initialize 11 database tables
echo    5. Load starter data from Roblox
echo    6. Create helper launch scripts
echo.
pause

REM ============================================
REM  STEP 1: CHECK PROJECT FILES
REM ============================================
set /a STEP+=1
echo.
echo  [STEP %STEP%] Checking project files...
echo  -----------------------------------------

set "FILES_OK=1"
for %%F in (
  "%SERVER_DIR%\package.json"
  "%SERVER_DIR%\server.js"
  "%SERVER_DIR%\scripts\initDb.js"
  "%SERVER_DIR%\scripts\migrate.js"
  "%SERVER_DIR%\scripts\seedRoblox.js"
  "%CLIENT_DIR%\index.html"
  "%DASHBOARD_DIR%\index.html"
) do (
  if not exist %%F (
    echo  [ERROR] Not found: %%F
    set "FILES_OK=0"
  )
)

if "!FILES_OK!"=="0" (
  echo.
  echo  [ERROR] Project files are missing.
  echo  Make sure install.bat is in the project root folder.
  goto :FATAL
)
echo  [OK] All project files found.

REM ============================================
REM  STEP 2: CHECK/INSTALL NODE.JS
REM ============================================
set /a STEP+=1
echo.
echo  [STEP %STEP%] Checking Node.js...
echo  -----------------------------------------

where node >nul 2>nul
if errorlevel 1 (
  echo  [INFO] Node.js is NOT installed.
  goto :INSTALL_NODE
)

:CHECK_NODE_VERSION
for /f "delims=" %%v in ('node --version 2^>nul') do set "NODE_VER=%%v"
if "!NODE_VER!"=="" goto :INSTALL_NODE

for /f "tokens=1 delims=." %%a in ("%NODE_VER:~1%") do set "NODE_MAJOR=%%a"
if !NODE_MAJOR! LSS 18 (
  echo  [WARNING] Node.js !NODE_VER! found, but version 18+ is required.
  goto :INSTALL_NODE
)

echo  [OK] Node.js: !NODE_VER!
set "NODE_INSTALLED=1"
goto :NODE_DONE

:INSTALL_NODE
echo.
echo  Would you like to install Node.js LTS via winget?
echo  (This requires internet connection)
echo.
set /p "INSTALL_NODE_YN=  Install Node.js? (Y/N): "

if /I not "!INSTALL_NODE_YN!"=="Y" (
  echo.
  echo  [ERROR] Node.js 18+ is required. Please install manually:
  echo    https://nodejs.org/
  echo    or: winget install OpenJS.NodeJS.LTS
  echo.
  echo  After installing, run install.bat again.
  goto :FATAL
)

echo.
echo  Installing Node.js LTS via winget...
echo  This may take a few minutes...
echo.

winget install OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
if errorlevel 1 (
  echo  [ERROR] winget install failed.
  echo  Install manually from https://nodejs.org/
  goto :FATAL
)

echo.
echo  [OK] Node.js installed.
echo  [INFO] Refreshing environment variables...

REM Refresh PATH from registry
for /f "tokens=2*" %%a in ('reg query "HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Environment" /v Path 2^>nul ^| findstr /i "Path"') do set "SYS_PATH=%%b"
for /f "tokens=2*" %%a in ('reg query "HKCU\Environment" /v Path 2^>nul ^| findstr /i "Path"') do set "USER_PATH=%%b"
set "PATH=!SYS_PATH!;!USER_PATH!"

REM Also check common Node.js install paths
if exist "C:\Program Files\nodejs" set "PATH=C:\Program Files\nodejs;!PATH!"
if exist "%LOCALAPPDATA%\nodejs" set "PATH=%LOCALAPPDATA%\nodejs;!PATH!"

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo  [WARNING] Node.js installed but not in PATH yet.
  echo  Please CLOSE this window and run install.bat again.
  echo  (Windows needs to reload environment variables)
  pause
  exit /b 0
)

for /f "delims=" %%v in ('node --version') do set "NODE_VER=%%v"
echo  [OK] Node.js: !NODE_VER!
set "NODE_INSTALLED=1"

:NODE_DONE

where npm >nul 2>nul
if errorlevel 1 (
  echo  [ERROR] npm not found after Node.js install.
  goto :FATAL
)
for /f "delims=" %%v in ('npm --version') do set "NPM_VER=%%v"
echo  [OK] npm: !NPM_VER!

REM ============================================
REM  STEP 3: CHECK/INSTALL POSTGRESQL
REM ============================================
set /a STEP+=1
echo.
echo  [STEP %STEP%] Checking PostgreSQL...
echo  -----------------------------------------

where psql >nul 2>nul
if not errorlevel 1 goto :PG_VERSION_CHECK

REM psql not in PATH, check common install locations
set "PG_FOUND=0"
for %%V in (17 16 15 14) do (
  if "!PG_FOUND!"=="0" (
    if exist "C:\Program Files\PostgreSQL\%%V\bin\psql.exe" (
      set "PG_BIN=C:\Program Files\PostgreSQL\%%V\bin"
      set "PG_FOUND=1"
      set "PATH=!PG_BIN!;!PATH!"
      echo  [INFO] Found PostgreSQL at: !PG_BIN!
    )
  )
)

if "!PG_FOUND!"=="1" goto :PG_VERSION_CHECK

REM PostgreSQL not found
echo  [INFO] PostgreSQL is NOT installed.
goto :INSTALL_PG

:PG_VERSION_CHECK
for /f "delims=" %%v in ('psql --version 2^>nul') do set "PG_VER=%%v"
echo  [OK] !PG_VER!
set "PG_INSTALLED=1"
goto :PG_SVC_CHECK

:INSTALL_PG
echo.
echo  Would you like to install PostgreSQL 16 via winget?
echo  (This requires internet connection)
echo.
set /p "INSTALL_PG_YN=  Install PostgreSQL? (Y/N): "

if /I not "!INSTALL_PG_YN!"=="Y" (
  echo.
  echo  [ERROR] PostgreSQL is required. Please install manually:
  echo    https://www.postgresql.org/download/windows/
  echo    or: winget install PostgreSQL.PostgreSQL.16
  echo.
  echo  After installing, run install.bat again.
  goto :FATAL
)

echo.
echo  IMPORTANT: During installation, you will be asked to set
echo  a password for the "postgres" user. REMEMBER THIS PASSWORD!
echo.
pause
echo.
echo  Installing PostgreSQL 16 via winget...
echo  This may take several minutes...
echo.

winget install PostgreSQL.PostgreSQL.16 --accept-package-agreements --accept-source-agreements
if errorlevel 1 (
  echo  [ERROR] winget install failed.
  echo  Install manually from https://www.postgresql.org/download/windows/
  goto :FATAL
)

echo.
echo  [OK] PostgreSQL installed.
echo  [INFO] Refreshing environment variables...

REM Refresh PATH from registry
for /f "tokens=2*" %%a in ('reg query "HKLM\SYSTEM\CurrentControlSet\Control\Session Manager\Environment" /v Path 2^>nul ^| findstr /i "Path"') do set "SYS_PATH=%%b"
set "PATH=!SYS_PATH!;!PATH!"

REM Check PostgreSQL path
if exist "C:\Program Files\PostgreSQL\16\bin" set "PATH=C:\Program Files\PostgreSQL\16\bin;!PATH!"

where psql >nul 2>nul
if errorlevel 1 (
  echo.
  echo  [WARNING] PostgreSQL installed but not in PATH yet.
  echo  Please CLOSE this window and run install.bat again.
  pause
  exit /b 0
)

for /f "delims=" %%v in ('psql --version') do set "PG_VER=%%v"
echo  [OK] !PG_VER!
set "PG_INSTALLED=1"

:PG_SVC_CHECK
REM Check if PostgreSQL service is running
for %%V in (17 16 15 14) do (
  if "!PG_SERVICE_OK!"=="0" (
    sc query postgresql-x64-%%V >nul 2>nul
    if not errorlevel 1 (
      for /f "tokens=*" %%s in ('sc query postgresql-x64-%%V ^| findstr /i "RUNNING"') do (
        echo  [OK] Service postgresql-x64-%%V is running.
        set "PG_SERVICE_OK=1"
      )
    )
  )
)

if "!PG_SERVICE_OK!"=="0" (
  echo  [WARNING] PostgreSQL service not detected as running.
  echo  Attempting to start...
  
  for %%V in (17 16 15 14) do (
    if "!PG_SERVICE_OK!"=="0" (
      sc query postgresql-x64-%%V >nul 2>nul
      if not errorlevel 1 (
        net start postgresql-x64-%%V >nul 2>nul
        if not errorlevel 1 (
          echo  [OK] Started service postgresql-x64-%%V
          set "PG_SERVICE_OK=1"
        )
      )
    )
  )
)

if "!PG_SERVICE_OK!"=="0" (
  echo  [WARNING] Could not start PostgreSQL service.
  echo  If DB connection fails later:
  echo    1. Open Services (Win+R, type services.msc)
  echo    2. Find "postgresql-x64-XX", click Start
  echo.
)

REM ============================================
REM  STEP 4: ASK POSTGRES PASSWORD
REM ============================================
set /a STEP+=1
echo.
echo  [STEP %STEP%] Database connection setup...
echo  -----------------------------------------
echo.

if "!PG_INSTALLED!"=="1" (
  echo  You just installed PostgreSQL. Please enter the password
  echo  you created during installation for the "postgres" user.
  echo.
) else (
  echo  Enter the password for PostgreSQL user "postgres".
  echo  (The password set during PostgreSQL installation)
  echo.
)

:ASK_PASSWORD
set /p "DB_PASSWORD=  postgres password: "

if "!DB_PASSWORD!"=="" (
  echo  [ERROR] Password cannot be empty.
  goto :ASK_PASSWORD
)

echo.
echo  Testing connection to PostgreSQL...
set "PGPASSWORD=!DB_PASSWORD!"
psql -U %DB_USER% -h %DB_HOST% -p %DB_PORT% -d postgres -tAc "SELECT 1;" > "%TEMP%\tm_test.txt" 2>"%TEMP%\tm_testerr.txt"

findstr /c:"1" "%TEMP%\tm_test.txt" >nul 2>nul
if not errorlevel 1 goto :PG_CONN_OK
echo  [ERROR] Cannot connect to PostgreSQL.
echo.
type "%TEMP%\tm_testerr.txt" 2>nul
echo.
del "%TEMP%\tm_test.txt" >nul 2>nul
del "%TEMP%\tm_testerr.txt" >nul 2>nul
set /p "RETRY=  Try another password? (Y/N): "
if /I "!RETRY!"=="Y" goto :ASK_PASSWORD
goto :FATAL
:PG_CONN_OK
del "%TEMP%\tm_test.txt" >nul 2>nul
del "%TEMP%\tm_testerr.txt" >nul 2>nul
echo  [OK] PostgreSQL connection successful.

REM ============================================
REM  STEP 5: CREATE .ENV
REM ============================================
set /a STEP+=1
echo.
echo  [STEP %STEP%] Creating .env configuration...
echo  -----------------------------------------

REM Check if .env already exists with valid password
set "ENV_SKIP=0"
if exist "%SERVER_DIR%\.env" (
  findstr /c:"DB_PASSWORD=!DB_PASSWORD!" "%SERVER_DIR%\.env" >nul 2>nul
  if not errorlevel 1 (
    echo  [OK] .env already exists with correct password.
    set "ENV_SKIP=1"
  )
)

if "!ENV_SKIP!"=="0" (
  for /f "delims=" %%j in ('powershell -NoProfile -Command "[guid]::NewGuid().ToString('N')+[guid]::NewGuid().ToString('N')"') do set "JWT_SECRET=%%j"

  > "%SERVER_DIR%\.env" (
    echo DB_HOST=%DB_HOST%
    echo DB_PORT=%DB_PORT%
    echo DB_NAME=%DB_NAME%
    echo DB_USER=%DB_USER%
    echo DB_PASSWORD=!DB_PASSWORD!
    echo PORT=3000
    echo CORS_ORIGIN=*
    echo JWT_SECRET=!JWT_SECRET!
  )
  set "ENV_WRITE_ERR=!errorlevel!"
)
if "!ENV_SKIP!"=="0" if "!ENV_WRITE_ERR!" NEQ "0" (
  echo  [ERROR] Failed to write .env
  goto :FATAL
)
if "!ENV_SKIP!"=="0" if "!ENV_WRITE_ERR!"=="0" echo  [OK] .env created (JWT_SECRET auto-generated)

:ENV_DONE

REM ============================================
REM  STEP 6: NPM INSTALL (SKIP IF EXISTS)
REM ============================================
set /a STEP+=1
echo.
echo  [STEP %STEP%] Installing npm dependencies...
echo  -----------------------------------------

set "NPM_SKIP=0"
if exist "%SERVER_DIR%\node_modules" (
  echo  [INFO] node_modules already exists.
  
  REM Check if package.json is newer than node_modules
  if exist "%SERVER_DIR%\package-lock.json" (
    for %%A in ("%SERVER_DIR%\package.json") do set "PKG_TIME=%%~tA"
    for %%A in ("%SERVER_DIR%\package-lock.json") do set "LOCK_TIME=%%~tA"
    
    echo  [INFO] Checking if update needed...
    cd /d "%SERVER_DIR%"
    call npm install --prefer-offline >nul 2>nul
    echo  [OK] Dependencies checked/updated.
  ) else (
    echo  [OK] Dependencies already installed.
  )
  set "NPM_SKIP=1"
)

if "!NPM_SKIP!"=="1" goto :NPM_DONE

echo  This may take 30-60 seconds...
echo.

cd /d "%SERVER_DIR%"
call npm install 2>"%TEMP%\tm_npmerr.txt"
set "NPM_ERR=!errorlevel!"

if "!NPM_ERR!" NEQ "0" (
  echo  [WARNING] npm install had errors. Checking...

  findstr /i "bcrypt" "%TEMP%\tm_npmerr.txt" >nul 2>nul
  set "BCRYPT_ERR=!errorlevel!"
)

if "!NPM_ERR!" NEQ "0" if "!BCRYPT_ERR!"=="0" (
  echo  [INFO] bcrypt build failed. Switching to bcryptjs...
  call npm uninstall bcrypt >nul 2>nul
  call npm install bcryptjs >nul 2>nul

  powershell -NoProfile -ExecutionPolicy Bypass -Command ^
    "$f='%SERVER_DIR%\models\Developer.js';" ^
    "$c=[IO.File]::ReadAllText($f);" ^
    "$c=$c.Replace(\"require('bcrypt')\",\"require('bcryptjs')\");" ^
    "[IO.File]::WriteAllText($f,$c)"

  echo  [OK] Replaced bcrypt with bcryptjs.
  echo  Retrying npm install...
  call npm install
  set "NPM_ERR=!errorlevel!"
)

if "!NPM_ERR!" NEQ "0" if "!BCRYPT_ERR!" NEQ "0" (
  echo  [ERROR] npm install failed.
  type "%TEMP%\tm_npmerr.txt"
  del "%TEMP%\tm_npmerr.txt" >nul 2>nul
  goto :FATAL
)
if "!NPM_ERR!" NEQ "0" if "!BCRYPT_ERR!"=="0" if "!NPM_ERR!" NEQ "0" (
  echo  [ERROR] npm install failed again.
  del "%TEMP%\tm_npmerr.txt" >nul 2>nul
  goto :FATAL
)

del "%TEMP%\tm_npmerr.txt" >nul 2>nul
echo  [OK] npm dependencies installed.

:NPM_DONE

REM ============================================
REM  STEP 7: CREATE DATABASE (SKIP IF EXISTS)
REM ============================================
set /a STEP+=1
echo.
echo  [STEP %STEP%] Checking database "%DB_NAME%"...
echo  -----------------------------------------

set "PGPASSWORD=!DB_PASSWORD!"
psql -U %DB_USER% -h %DB_HOST% -p %DB_PORT% -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='%DB_NAME%'" > "%TEMP%\tm_dbchk.txt" 2>nul

set "DB_EXISTS=0"
findstr /c:"1" "%TEMP%\tm_dbchk.txt" >nul 2>nul
if not errorlevel 1 set "DB_EXISTS=1"
del "%TEMP%\tm_dbchk.txt" >nul 2>nul

if "!DB_EXISTS!"=="0" (
  echo  Creating database...
  psql -U %DB_USER% -h %DB_HOST% -p %DB_PORT% -d postgres -c "CREATE DATABASE %DB_NAME%;" >nul 2>nul
  set "DB_CREATE_ERR=!errorlevel!"
)
if "!DB_EXISTS!"=="0" if "!DB_CREATE_ERR!" NEQ "0" (
  echo  [ERROR] Failed to create database.
  goto :FATAL
)
if "!DB_EXISTS!"=="0" echo  [OK] Database "%DB_NAME%" created.
if "!DB_EXISTS!"=="1" echo  [OK] Database "%DB_NAME%" already exists.

REM ============================================
REM  STEP 8: INIT TABLES
REM ============================================
set /a STEP+=1
echo.
echo  [STEP %STEP%] Initializing database tables...
echo  -----------------------------------------

REM Check if tables already exist
set "PGPASSWORD=!DB_PASSWORD!"
psql -U %DB_USER% -h %DB_HOST% -p %DB_PORT% -d %DB_NAME% -tAc "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='public' AND table_name='games';" > "%TEMP%\tm_tblchk.txt" 2>nul

set "TABLE_COUNT=0"
for /f %%a in ('type "%TEMP%\tm_tblchk.txt" 2^>nul') do set /a TABLE_COUNT=%%a
del "%TEMP%\tm_tblchk.txt" >nul 2>nul

if !TABLE_COUNT! GTR 0 goto :STEP8_DONE
cd /d "%SERVER_DIR%"
call node scripts\initDb.js
if errorlevel 1 (
  echo  [ERROR] Table initialization failed.
  goto :FATAL
)
echo  [OK] 11 tables and indexes created.
goto :STEP8_NEXT

:STEP8_DONE
echo  [OK] Tables already exist (!TABLE_COUNT! found).

:STEP8_NEXT

REM ============================================
REM  STEP 8+: RUN DATABASE MIGRATIONS
REM ============================================
set /a STEP+=1
echo.
echo  [STEP %STEP%] Running database migrations...
echo  -----------------------------------------

cd /d "%SERVER_DIR%"
call node scripts\migrate.js
if errorlevel 1 (
  echo  [WARNING] Migration had issues. Check output above.
  set /a ERRORS+=1
) else (
  echo  [OK] Migrations applied successfully.
)

REM ============================================
REM  STEP 9: CREATE UPLOADS DIR
REM ============================================
set /a STEP+=1
echo.
echo  [STEP %STEP%] Creating upload directories...
echo  -----------------------------------------

if not exist "%UPLOADS_DIR%" mkdir "%UPLOADS_DIR%"
echo  [OK] uploads\thumbnails\ ready.

REM ============================================
REM  STEP 10: SEED ROBLOX DATA (CHECK IF EXISTS)
REM ============================================
set /a STEP+=1
echo.
echo  [STEP %STEP%] Load starter Roblox data...
echo  -----------------------------------------

REM Check if games already exist
set "PGPASSWORD=!DB_PASSWORD!"
psql -U %DB_USER% -h %DB_HOST% -p %DB_PORT% -d %DB_NAME% -tAc "SELECT COUNT(*) FROM games;" > "%TEMP%\tm_datachk.txt" 2>nul

set "GAMES_COUNT=0"
for /f %%a in ('type "%TEMP%\tm_datachk.txt" 2^>nul') do set /a GAMES_COUNT=%%a
del "%TEMP%\tm_datachk.txt" >nul 2>nul

if !GAMES_COUNT! GTR 0 goto :STEP10_HASDATA

echo.
echo  No games in database. Would you like to download
echo  ~30 popular Roblox games with thumbnails now?
echo  (Uses public Roblox API, ~30-60 seconds)
echo.
set /p "RUN_SEED=  Load data now? (Y/N): "
if /I not "!RUN_SEED!"=="Y" goto :STEP10_DONE
echo.
echo  Downloading...
echo.
cd /d "%SERVER_DIR%"
call node scripts\seedRoblox.js
if errorlevel 1 (
  echo  [WARNING] Roblox data download failed (network issue?).
  echo  Run later: seed_roblox.bat
  set /a ERRORS+=1
) else (
  echo.
  echo  [OK] Roblox data loaded.
)
goto :STEP10_DONE

:STEP10_HASDATA
echo  [OK] Database already has !GAMES_COUNT! games.
echo.
set /p "REFRESH_DATA=  Refresh/update data? (Y/N): "
if /I not "!REFRESH_DATA!"=="Y" goto :STEP10_DONE
echo.
echo  Updating...
cd /d "%SERVER_DIR%"
call node scripts\seedRoblox.js
if errorlevel 1 (
  echo  [WARNING] Update failed.
  set /a ERRORS+=1
) else (
  echo  [OK] Data updated.
)

:STEP10_DONE

REM ============================================
REM  STEP 11: CREATE LAUNCH SCRIPTS
REM ============================================
set /a STEP+=1
echo.
echo  [STEP %STEP%] Creating launch scripts...
echo  -----------------------------------------

echo @echo off > "%PROJECT_ROOT%\start_server.bat"
echo chcp 65001 ^>nul 2^>nul >> "%PROJECT_ROOT%\start_server.bat"
echo title Thumbnail Master - Server >> "%PROJECT_ROOT%\start_server.bat"
echo echo. >> "%PROJECT_ROOT%\start_server.bat"
echo echo  Thumbnail Master Server >> "%PROJECT_ROOT%\start_server.bat"
echo echo  ======================== >> "%PROJECT_ROOT%\start_server.bat"
echo echo  Game:      http://localhost:3000 >> "%PROJECT_ROOT%\start_server.bat"
echo echo  Dashboard: http://localhost:3000/dev >> "%PROJECT_ROOT%\start_server.bat"
echo echo  Health:    http://localhost:3000/health >> "%PROJECT_ROOT%\start_server.bat"
echo echo. >> "%PROJECT_ROOT%\start_server.bat"
echo echo  Press Ctrl+C to stop. >> "%PROJECT_ROOT%\start_server.bat"
echo echo. >> "%PROJECT_ROOT%\start_server.bat"
echo cd /d "%SERVER_DIR%" >> "%PROJECT_ROOT%\start_server.bat"
echo node server.js >> "%PROJECT_ROOT%\start_server.bat"
echo pause >> "%PROJECT_ROOT%\start_server.bat"
echo  [OK] start_server.bat

echo @echo off > "%PROJECT_ROOT%\start_server_dev.bat"
echo chcp 65001 ^>nul 2^>nul >> "%PROJECT_ROOT%\start_server_dev.bat"
echo title Thumbnail Master - Dev Server >> "%PROJECT_ROOT%\start_server_dev.bat"
echo echo. >> "%PROJECT_ROOT%\start_server_dev.bat"
echo echo  Thumbnail Master Dev Server >> "%PROJECT_ROOT%\start_server_dev.bat"
echo echo  ============================ >> "%PROJECT_ROOT%\start_server_dev.bat"
echo echo  Game:      http://localhost:3000 >> "%PROJECT_ROOT%\start_server_dev.bat"
echo echo  Dashboard: http://localhost:3000/dev >> "%PROJECT_ROOT%\start_server_dev.bat"
echo echo. >> "%PROJECT_ROOT%\start_server_dev.bat"
echo cd /d "%SERVER_DIR%" >> "%PROJECT_ROOT%\start_server_dev.bat"
echo npx nodemon server.js >> "%PROJECT_ROOT%\start_server_dev.bat"
echo pause >> "%PROJECT_ROOT%\start_server_dev.bat"
echo  [OK] start_server_dev.bat

echo @echo off > "%PROJECT_ROOT%\open_game.bat"
echo start "" "http://localhost:3000" >> "%PROJECT_ROOT%\open_game.bat"
echo  [OK] open_game.bat

echo @echo off > "%PROJECT_ROOT%\open_dashboard.bat"
echo start "" "http://localhost:3000/dev" >> "%PROJECT_ROOT%\open_dashboard.bat"
echo  [OK] open_dashboard.bat

echo @echo off > "%PROJECT_ROOT%\seed_roblox.bat"
echo chcp 65001 ^>nul 2^>nul >> "%PROJECT_ROOT%\seed_roblox.bat"
echo title Thumbnail Master - Roblox Data Loader >> "%PROJECT_ROOT%\seed_roblox.bat"
echo echo Loading Roblox data... >> "%PROJECT_ROOT%\seed_roblox.bat"
echo echo. >> "%PROJECT_ROOT%\seed_roblox.bat"
echo cd /d "%SERVER_DIR%" >> "%PROJECT_ROOT%\seed_roblox.bat"
echo node scripts\seedRoblox.js >> "%PROJECT_ROOT%\seed_roblox.bat"
echo echo. >> "%PROJECT_ROOT%\seed_roblox.bat"
echo echo Done. >> "%PROJECT_ROOT%\seed_roblox.bat"
echo pause >> "%PROJECT_ROOT%\seed_roblox.bat"
echo  [OK] seed_roblox.bat

echo @echo off > "%PROJECT_ROOT%\migrate.bat"
echo chcp 65001 ^>nul 2^>nul >> "%PROJECT_ROOT%\migrate.bat"
echo title Thumbnail Master - Run Migrations >> "%PROJECT_ROOT%\migrate.bat"
echo echo. >> "%PROJECT_ROOT%\migrate.bat"
echo echo  Running database migrations... >> "%PROJECT_ROOT%\migrate.bat"
echo echo. >> "%PROJECT_ROOT%\migrate.bat"
echo cd /d "%SERVER_DIR%" >> "%PROJECT_ROOT%\migrate.bat"
echo node scripts\migrate.js >> "%PROJECT_ROOT%\migrate.bat"
echo echo. >> "%PROJECT_ROOT%\migrate.bat"
echo echo Done. >> "%PROJECT_ROOT%\migrate.bat"
echo pause >> "%PROJECT_ROOT%\migrate.bat"
echo  [OK] migrate.bat

echo @echo off > "%PROJECT_ROOT%\reset_database.bat"
echo chcp 65001 ^>nul 2^>nul >> "%PROJECT_ROOT%\reset_database.bat"
echo title Thumbnail Master - Reset Database >> "%PROJECT_ROOT%\reset_database.bat"
echo echo. >> "%PROJECT_ROOT%\reset_database.bat"
echo echo  WARNING: This will recreate all tables^^! >> "%PROJECT_ROOT%\reset_database.bat"
echo echo. >> "%PROJECT_ROOT%\reset_database.bat"
echo set /p "CONFIRM=Type YES to confirm: " >> "%PROJECT_ROOT%\reset_database.bat"
echo if /I not "%%CONFIRM%%"=="YES" goto :cancel_reset >> "%PROJECT_ROOT%\reset_database.bat"
echo cd /d "%SERVER_DIR%" >> "%PROJECT_ROOT%\reset_database.bat"
echo node scripts\initDb.js >> "%PROJECT_ROOT%\reset_database.bat"
echo echo. >> "%PROJECT_ROOT%\reset_database.bat"
echo echo Done. >> "%PROJECT_ROOT%\reset_database.bat"
echo goto :end_reset >> "%PROJECT_ROOT%\reset_database.bat"
echo :cancel_reset >> "%PROJECT_ROOT%\reset_database.bat"
echo echo Cancelled. >> "%PROJECT_ROOT%\reset_database.bat"
echo :end_reset >> "%PROJECT_ROOT%\reset_database.bat"
echo pause >> "%PROJECT_ROOT%\reset_database.bat"
echo  [OK] reset_database.bat

echo @echo off > "%PROJECT_ROOT%\start_all.bat"
echo chcp 65001 ^>nul 2^>nul >> "%PROJECT_ROOT%\start_all.bat"
echo title Thumbnail Master - Start All >> "%PROJECT_ROOT%\start_all.bat"
echo echo. >> "%PROJECT_ROOT%\start_all.bat"
echo echo  Starting Thumbnail Master... >> "%PROJECT_ROOT%\start_all.bat"
echo echo. >> "%PROJECT_ROOT%\start_all.bat"
echo echo  Opening browser in 3 seconds... >> "%PROJECT_ROOT%\start_all.bat"
echo timeout /t 3 /nobreak ^>nul >> "%PROJECT_ROOT%\start_all.bat"
echo start "" "http://localhost:3000" >> "%PROJECT_ROOT%\start_all.bat"
echo start "" "http://localhost:3000/dev" >> "%PROJECT_ROOT%\start_all.bat"
echo echo. >> "%PROJECT_ROOT%\start_all.bat"
echo echo  Server running. Press Ctrl+C to stop. >> "%PROJECT_ROOT%\start_all.bat"
echo echo. >> "%PROJECT_ROOT%\start_all.bat"
echo cd /d "%SERVER_DIR%" >> "%PROJECT_ROOT%\start_all.bat"
echo node server.js >> "%PROJECT_ROOT%\start_all.bat"
echo pause >> "%PROJECT_ROOT%\start_all.bat"
echo  [OK] start_all.bat

REM ============================================
REM  STEP 12: FINAL VERIFICATION
REM ============================================
set /a STEP+=1
echo.
echo  [STEP %STEP%] Final verification...
echo  -----------------------------------------

echo.
echo  Checking server modules...
cd /d "%SERVER_DIR%"
node -e "try{require('./routes/auth');require('./routes/campaigns');require('./routes/stats');require('./routes/game');require('./models/Developer');require('./models/Campaign');require('./models/CampaignThumbnail');require('./middleware/auth');require('./middleware/upload');console.log('  [OK] All 9 server modules load successfully')}catch(e){console.log('  [ERROR] Module load failed: '+e.message)}"

echo.
echo  Checking DB connection via Node.js...
node -e "const p=require('./config/database');p.query('SELECT COUNT(*) as c FROM information_schema.tables WHERE table_schema=$1',['public']).then(r=>{console.log('  [OK] DB OK. Tables in public schema: '+r.rows[0].c);p.end()}).catch(e=>{console.log('  [WARNING] DB check failed: '+e.message);p.end()})"

REM ============================================
REM  DONE
REM ============================================
echo.
echo.
echo  +==================================================+
echo  *                                                  *
echo  *   INSTALLATION COMPLETED SUCCESSFULLY            *
echo  *                                                  *
echo  +==================================================+
echo.

if %ERRORS%==0 goto :NO_ERRORS
echo  Completed with %ERRORS% warning(s). Check messages above.
echo.
:NO_ERRORS

echo  Created launch scripts:
echo  ---------------------------------------------------------
echo    start_all.bat         - start server + open browser
echo    start_server.bat      - start server (production)
echo    start_server_dev.bat  - start server (dev, auto-reload)
echo    open_game.bat         - open game in browser
echo    open_dashboard.bat    - open developer dashboard
echo    seed_roblox.bat       - load/update Roblox data
echo    migrate.bat           - apply database migrations
echo    reset_database.bat    - recreate database tables
echo  ---------------------------------------------------------
echo.
echo  Quick start:
echo    1. Run start_all.bat
echo    2. Game opens at         http://localhost:3000
echo    3. Dashboard opens at    http://localhost:3000/dev
echo.
echo  ---------------------------------------------------------
echo.

set /p "START_NOW=  Start server now? (Y/N): "
if /I not "!START_NOW!"=="Y" goto :SKIP_START
echo.
echo  Starting...
start "" "http://localhost:3000"
timeout /t 2 /nobreak >nul
start "" "http://localhost:3000/dev"
cd /d "%SERVER_DIR%"
node server.js

:SKIP_START
pause
exit /b 0

:FATAL
echo.
echo  +==================================================+
echo  *   INSTALLATION FAILED                            *
echo  +==================================================+
echo.
echo  Fix the error above and run install.bat again.
echo.
pause
exit /b 1
