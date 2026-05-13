@echo off
set NODE_DIR=%~dp0..\node-v24.15.0-win-x64
set PATH=%NODE_DIR%;%PATH%
cd /d "%~dp0"
node "%NODE_DIR%\node_modules\next\dist\bin\next" dev
