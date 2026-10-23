@echo off
chcp 936 >nul
title 晓 Studio
rem 双击启动「晓 Studio」（用已构建的界面，不需要命令行）
rem 如果窗口没出来：把 apps\studio\node_modules\electron\dist\electron.exe
rem 和 %APPDATA%\studio 加入安全软件（火绒等）的信任区。
cd /d "%~dp0apps\studio"
set "ELECTRON_RUN_AS_NODE="
set "XIAO_CDP_PORT="

if not exist "out\renderer\index.html" (
  echo [晓] 还没有构建产物，请先在终端执行：pnpm --filter studio build
  pause
  exit /b 1
)

if not exist "node_modules\electron\dist\electron.exe" (
  echo [晓] 找不到 Electron，请先在仓库根目录执行 pnpm install
  pause
  exit /b 1
)

start "" "node_modules\electron\dist\electron.exe" . --no-sandbox
exit /b 0
