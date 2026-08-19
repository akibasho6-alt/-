@echo off
chcp 65001 > nul
title 旋盤マイスター - スマホ連携サーバー
cd /d "%~dp0"

where node > nul 2>&1
if errorlevel 1 (
  echo [エラー] Node.jsが見つかりません。
  echo https://nodejs.org/ からLTS版をインストールして、もう一度実行してください。
  echo.
  pause
  exit /b 1
)

echo スマホ連携サーバーを起動しています...
echo 終了するときは Ctrl+C を押してください。
echo.
node serve-mobile.js

if errorlevel 1 (
  echo.
  echo サーバーを起動できませんでした。上のエラー内容を確認してください。
)
pause
