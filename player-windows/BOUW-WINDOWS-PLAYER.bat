@echo off
title NarrowVision Windows Player TEST bouwen
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0build.ps1"
if errorlevel 1 (
  echo.
  echo De build is mislukt. Maak een foto van deze melding en stuur die door.
) else (
  echo.
  echo Klaar. De installer staat in de map dist.
)
pause
