@echo off
rem Builds dist\PlayerReconcile-<version>.exe on Windows (no Python needed on the PC that runs it).
rem Run from anywhere: double-click this file.
cd /d "%~dp0.."
py -m pip install --upgrade -r requirements-build.txt || goto :fail
for /f %%v in ('py -c "import sys; sys.path.insert(0, 'src'); from version import __version__; print(__version__)"') do set VER=%%v
py -m PyInstaller --noconfirm --onefile --windowed --name PlayerReconcile-%VER% --icon src\assets\icon.ico --add-data "src\assets;assets" --paths src src\app.py || goto :fail
echo.
echo Done. Your app is:  %CD%\dist\PlayerReconcile-%VER%.exe
explorer dist
goto :eof
:fail
echo.
echo The build failed. Please send the messages above to whoever is helping you.
pause
