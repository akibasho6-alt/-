@echo off
setlocal
title Game Update

cd /d "%~dp0"
if errorlevel 1 goto :cd_error

git add .
if errorlevel 1 goto :add_error

git diff --cached --quiet
if errorlevel 2 goto :diff_error
if errorlevel 1 goto :commit_changes

echo No changes found.
goto :success_exit

:commit_changes
git commit -m "Game update"
if errorlevel 1 goto :commit_error

git push origin main
if errorlevel 1 goto :push_error

echo Update completed successfully.
goto :success_exit

:cd_error
echo Error: Failed to open the project root.
goto :error_exit

:add_error
echo Error: git add failed.
goto :error_exit

:diff_error
echo Error: git diff failed.
goto :error_exit

:commit_error
echo Error: git commit failed.
goto :error_exit

:push_error
echo Error: git push failed.
goto :error_exit

:success_exit
echo.
pause
endlocal
exit /b 0

:error_exit
echo Update stopped.
echo.
pause
endlocal
exit /b 1
