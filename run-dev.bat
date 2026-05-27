@echo off
set NODE_DIR=%USERPROFILE%\AppData\Local\node-v20.19.2
set PATH=%NODE_DIR%;%PATH%
cd /d "%~dp0"
"%NODE_DIR%\node.exe" node_modules\next\dist\bin\next dev
