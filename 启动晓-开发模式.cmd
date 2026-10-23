@echo off
chcp 936 >nul
title 晓 Studio（开发模式）
rem 开发模式：改代码后界面自动刷新（需要 Node）。这个窗口不能关，关掉就等于退出应用。
cd /d "%~dp0apps\studio"
set "ELECTRON_RUN_AS_NODE="
rem nvm 装的 node 默认不在所有终端的 PATH 里，这里补一下
if exist "E:\nvm\node\nodejs\node.exe" set "PATH=E:\nvm\node\nodejs;%PATH%"

where node >nul 2>nul
if errorlevel 1 (
  echo [晓] 找不到 node。请安装 Node 24，或把 node 所在目录加进 PATH。
  pause
  exit /b 1
)

call pnpm dev:unsafe
echo.
echo [晓] 应用已退出，按任意键关闭窗口。
pause >nul
