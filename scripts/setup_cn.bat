@echo off
chcp 65001 >nul 2>&1
setlocal enabledelayedexpansion
REM ============================================================
REM Brainhole 中国网络环境一键安装脚本 (Windows)
REM 自动检测并安装 Python 3.12+, uv, Node.js 20+
REM 所有下载均使用国内镜像源，避免网络问题
REM ============================================================

echo.
echo ============================================================
echo   Brainhole 中国网络环境一键安装
echo   检测并安装: Python 3.12+ / uv / Node.js 20+
echo ============================================================
echo.

REM ============================================================
REM 1. Python
REM ============================================================
echo [INFO] 检查 Python...

python --version >nul 2>&1
if %errorlevel%==0 (
    for /f "tokens=2 delims= " %%v in ('python --version 2^>^&1') do set PY_VER=%%v
    for /f "tokens=1,2 delims=." %%a in ("!PY_VER!") do (
        set PY_MAJOR=%%a
        set PY_MINOR=%%b
    )
    if !PY_MAJOR! GEQ 3 if !PY_MINOR! GEQ 12 (
        echo [OK] Python !PY_VER! 已安装
        goto :python_done
    )
    echo [WARN] Python !PY_VER! 版本过低，需要 3.12+
) else (
    echo [WARN] Python 未安装
)

echo [INFO] 请手动安装 Python 3.12+:
echo.
echo   推荐下载地址 (华为镜像):
echo     https://mirrors.huaweicloud.com/python/3.12.7/python-3.12.7-amd64.exe
echo.
echo   或访问官网:
echo     https://www.python.org/downloads/
echo.
echo   安装时务必勾选 "Add Python to PATH"
echo.
pause
exit /b 1

:python_done

REM ============================================================
REM 2. uv
REM ============================================================
echo [INFO] 检查 uv...

where uv >nul 2>&1
if %errorlevel%==0 (
    for /f "tokens=*" %%v in ('uv --version 2^>^&1') do echo [OK] %%v 已安装
    goto :uv_done
)

echo [INFO] 安装 uv (Python 包管理器)...
powershell -ExecutionPolicy Bypass -Command "irm https://astral.sh/uv/install.ps1 | iex"

REM 刷新 PATH
set "PATH=%USERPROFILE%\.local\bin;%USERPROFILE%\.cargo\bin;%PATH%"

where uv >nul 2>&1
if %errorlevel%==0 (
    echo [OK] uv 安装完成
) else (
    echo [ERROR] uv 安装失败，请手动安装: https://docs.astral.sh/uv/
    pause
    exit /b 1
)

:uv_done

REM 配置 uv 使用清华 PyPI 镜像
echo [INFO] 配置 uv 清华 PyPI 镜像...
if not exist "%USERPROFILE%\.config\uv" mkdir "%USERPROFILE%\.config\uv"
(
    echo [pip]
    echo index-url = "https://pypi.tuna.tsinghua.edu.cn/simple"
) > "%USERPROFILE%\.config\uv\uv.toml"
echo [OK] uv PyPI 镜像已配置为清华源

REM 配置 pip 使用清华 PyPI 镜像
echo [INFO] 配置 pip 清华 PyPI 镜像...
if not exist "%APPDATA%\pip" mkdir "%APPDATA%\pip"
(
    echo [global]
    echo index-url = https://pypi.tuna.tsinghua.edu.cn/simple
    echo trusted-host = pypi.tuna.tsinghua.edu.cn
) > "%APPDATA%\pip\pip.ini"
echo [OK] pip 镜像已配置为清华源

REM ============================================================
REM 3. Node.js
REM ============================================================
echo [INFO] 检查 Node.js...

where node >nul 2>&1
if %errorlevel%==0 (
    for /f "tokens=1 delims=v" %%v in ('node --version 2^>^&1') do set NODE_VER=%%v
    for /f "tokens=*" %%v in ('node --version 2^>^&1') do echo [OK] Node.js %%v 已安装
    goto :node_done
)

echo [WARN] Node.js 未安装
echo [INFO] 请手动安装 Node.js 20+:
echo.
echo   推荐下载地址 (淘宝镜像):
echo     https://npmmirror.com/mirrors/node/v20.18.1/node-v20.18.1-x64.msi
echo.
echo   或访问官网:
echo     https://nodejs.org/
echo.
pause
exit /b 1

:node_done

REM 配置 npm 使用淘宝镜像
echo [INFO] 配置 npm 淘宝镜像...
call npm config set registry https://registry.npmmirror.com
echo [OK] npm 镜像已配置为淘宝源

REM 安装依赖
echo [INFO] 开始安装项目依赖 (npm install)...
call npm install
echo [OK] 项目依赖安装完成

REM ============================================================
REM 完成
REM ============================================================
echo.
echo ============================================================
echo   所有依赖安装完成！
echo.
echo   已配置的国内镜像:
echo     PyPI  -^> 清华大学 (pypi.tuna.tsinghua.edu.cn)
echo     npm   -^> 淘宝镜像 (registry.npmmirror.com)
echo.
echo   下一步: 在项目根目录运行启动命令
echo     npm run dev
echo ============================================================
echo.
pause
