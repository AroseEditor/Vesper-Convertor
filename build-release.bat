@echo off
setlocal enabledelayedexpansion
title Vesper Convertor - Build Release

cls
echo.
echo  ==============================================
echo   CONTRARY CONVERTOR  ^|  Build Release Tool
echo   Developer: Ayush.ue5
echo  ==============================================
echo.
echo  Choose a build target:
echo.
echo    Windows   - NSIS installer (.exe)
echo    Mac       - DMG disk image (.dmg)
echo    Linux     - AppImage (.AppImage)
echo    Everyone  - All three platforms
echo.
set /p TARGET="  Target (Windows / Mac / Linux / Everyone): "

:: Normalise input
set TARGET_NORM=
if /i "%TARGET%"=="Windows"  set TARGET_NORM=windows
if /i "%TARGET%"=="Win"      set TARGET_NORM=windows
if /i "%TARGET%"=="Mac"      set TARGET_NORM=mac
if /i "%TARGET%"=="macOS"    set TARGET_NORM=mac
if /i "%TARGET%"=="Linux"    set TARGET_NORM=linux
if /i "%TARGET%"=="Everyone" set TARGET_NORM=everyone
if /i "%TARGET%"=="All"      set TARGET_NORM=everyone

if "%TARGET_NORM%"=="" (
  echo.
  echo  [ERROR] Unrecognised target: "%TARGET%"
  echo          Valid options: Windows, Mac, Linux, Everyone
  pause
  exit /b 1
)

echo.
echo  [1/3] Installing dev dependencies...
call npm install --legacy-peer-deps --silent
if errorlevel 1 (
  echo  [ERROR] npm install failed.
  pause
  exit /b 1
)

echo  [2/3] Generating installer assets...
if exist "generate-bitmaps.js" (
  node generate-bitmaps.js 2>nul
)

:: Create output root
set OUT_ROOT=%~dp0Final Release
if not exist "%OUT_ROOT%" mkdir "%OUT_ROOT%"

:: Route to build
if "%TARGET_NORM%"=="windows"  call :DO_WIN   & goto :DONE
if "%TARGET_NORM%"=="mac"      call :DO_MAC   & goto :DONE
if "%TARGET_NORM%"=="linux"    call :DO_LINUX  & goto :DONE
if "%TARGET_NORM%"=="everyone" (
  call :DO_WIN
  call :DO_LINUX
  call :DO_MAC
  goto :DONE
)

:: ── Build routines ─────────────────────────────────────────────────────────────

:DO_WIN
  echo.
  echo  [BUILD] Windows - oneClick NSIS installer...
  if exist "dist" rmdir /s /q "dist"
  call npx electron-builder --win nsis --publish never
  if errorlevel 1 ( echo  [ERROR] Windows build failed. & goto :eof )

  if not exist "%OUT_ROOT%\Windows" mkdir "%OUT_ROOT%\Windows"
  for %%F in ("dist\*.exe") do (
    echo %%~nxF | findstr /i "uninstall" >nul
    if errorlevel 1 (
      move /Y "%%F" "%OUT_ROOT%\Windows\" >nul
      echo  [OK] %%~nxF  -^>  Final Release\Windows\
    )
  )
  if exist "dist" rmdir /s /q "dist"
  goto :eof

:DO_LINUX
  echo.
  echo  [BUILD] Linux - AppImage...
  if exist "dist" rmdir /s /q "dist"
  call npx electron-builder --linux AppImage --publish never
  if errorlevel 1 ( echo  [ERROR] Linux build failed. & goto :eof )

  if not exist "%OUT_ROOT%\Linux" mkdir "%OUT_ROOT%\Linux"
  for %%F in ("dist\*.AppImage") do (
    move /Y "%%F" "%OUT_ROOT%\Linux\" >nul
    echo  [OK] %%~nxF  -^>  Final Release\Linux\
  )
  if exist "dist" rmdir /s /q "dist"
  goto :eof

:DO_MAC
  echo.
  echo  [BUILD] Mac - DMG...
  if exist "dist" rmdir /s /q "dist"
  call npx electron-builder --mac dmg --publish never
  if errorlevel 1 ( echo  [ERROR] Mac build failed ^(expected on non-macOS^). & goto :eof )

  if not exist "%OUT_ROOT%\Mac" mkdir "%OUT_ROOT%\Mac"
  for %%F in ("dist\*.dmg") do (
    move /Y "%%F" "%OUT_ROOT%\Mac\" >nul
    echo  [OK] %%~nxF  -^>  Final Release\Mac\
  )
  if exist "dist" rmdir /s /q "dist"
  goto :eof

:DONE
if exist "dist" rmdir /s /q "dist"

echo.
echo  ==============================================
echo   Build complete!
echo.
echo   Output:  Final Release\
if "%TARGET_NORM%"=="windows"  echo            Final Release\Windows\
if "%TARGET_NORM%"=="mac"      echo            Final Release\Mac\
if "%TARGET_NORM%"=="linux"    echo            Final Release\Linux\
if "%TARGET_NORM%"=="everyone" (
  echo            Final Release\Windows\
  echo            Final Release\Linux\
  echo            Final Release\Mac\
)
echo  ==============================================
echo.
explorer "%OUT_ROOT%"
pause
endlocal
