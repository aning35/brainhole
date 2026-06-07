@echo off
REM Brainhole Canvas - Windows Startup Script
REM Features: Check port conflicts, kill processes, start development server

setlocal enabledelayedexpansion

:: Configuration
set PORT=4890
set APP_NAME=Brainhole Canvas

:: Color codes (Windows 10+)
set RED= [91m
set GREEN= [92m
set YELLOW= [93m
set BLUE= [94m
set NC= [0m

echo.
echo %BLUE%🚀 Starting %APP_NAME% Development Environment%NC%
echo.

:: Check if in project root
if not exist "package.json" (
    echo %RED%Error: Please run this script in the project root directory%NC%
    pause
    exit /b 1
)

:: Check Node.js
where node >nul 2>&1
if !errorlevel! neq 0 (
    echo %RED%Error: Node.js is not installed. Please visit https://nodejs.org/ to install.%NC%
    pause
    exit /b 1
)

:: Check uv
where uv >nul 2>&1
if !errorlevel! neq 0 (
    echo %RED%Error: uv is not installed. Please visit https://docs.astral.sh/uv/ to install.%NC%
    pause
    exit /b 1
)

:: Check if dependencies are installed
if not exist "node_modules" (
    echo %YELLOW%Dependencies not found, installing...%NC%
    npm install
)

:: Check port status
echo %BLUE%Checking port %PORT% status...%NC%

:: Use netstat to check port, ignoring TIME_WAIT connections
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :%PORT% ^| findstr LISTENING') do (
    set PID=%%a
    if defined PID (
        if not "!PID!"=="0" (
            echo %YELLOW%Port %PORT% is occupied by process !PID!. Auto-killing...%NC%
            taskkill /PID !PID! /F >nul 2>&1
            if !errorlevel!==0 (
                echo %GREEN%Port %PORT% successfully cleared%NC%
            ) else (
                echo %RED%Failed to clear port, please handle manually%NC%
                pause
                exit /b 1
            )
        )
    )
)

echo %GREEN%Port %PORT% is available%NC%

:: Start development server
echo %BLUE%Starting %APP_NAME% development server...%NC%
echo %BLUE%Server will run at http://localhost:%PORT%%NC%
echo.

npm run dev

pause