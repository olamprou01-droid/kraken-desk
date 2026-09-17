@echo off
setlocal enabledelayedexpansion
title OWN BOOK deploy
cd /d "%~dp0"

set REPO=https://github.com/olamprou01-droid/kraken-desk.git

where git >nul 2>nul
if errorlevel 1 (
  echo.
  echo  Git is not installed. Get it here, accept the defaults, then run this again:
  echo    https://git-scm.com/download/win
  echo.
  pause
  exit /b 1
)

if not exist ".git" (
  echo  First run: connecting this folder to %REPO%
  git init -q
  git remote add origin %REPO%
  git fetch -q origin
  set BR=main
  for /f "tokens=*" %%b in ('git remote show origin ^| findstr /C:"HEAD branch"') do set LINE=%%b
  if defined LINE set BR=!LINE:*: =!
  git checkout -q -B !BR!
  git reset -q --mixed origin/!BR! 2>nul
  set FIRST=1
  echo  connected on branch !BR!
) else (
  for /f "tokens=*" %%b in ('git rev-parse --abbrev-ref HEAD') do set BR=%%b
  git pull -q --rebase origin !BR! 2>nul
)

if defined FIRST (git add --ignore-removal .) else (git add -A)
git -c user.name="Orestis" -c user.email="orestis@ownbook.local" commit -q -m "desk update %date% %time%" 2>nul
if errorlevel 1 (
  echo  Nothing changed since the last deploy.
) else (
  echo  Pushing...
  git push -u origin !BR!
  if errorlevel 1 (
    echo.
    echo  Push failed. If a login window did not appear, sign in at github.com and try again.
    pause
    exit /b 1
  )
  echo.
  echo  Done. Live in about a minute at https://olamprou01-droid.github.io/kraken-desk/
  echo  The watcher runs on the next half hour, or now: repo ^> Actions ^> watch ^> Run workflow.
)
echo.
pause
