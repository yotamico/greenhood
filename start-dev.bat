@echo off
set "PROJ_DIR=%~dp0"
set "NODE_EXE=%~dp0..\..\..\..\..\..\..\..\Users\yotam.cohen\Desktop\פרטי\WAZE מציאות\node-v24.15.0-win-x64\node.exe"
set "NEXT_BIN=%PROJ_DIR%node_modules\next\dist\bin\next"
cd /d "%PROJ_DIR%"
"C:\Users\yotam.cohen\Desktop\פרטי\WAZE מציאות\node-v24.15.0-win-x64\node.exe" "%NEXT_BIN%" dev
