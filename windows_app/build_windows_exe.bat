@echo off
echo ====================================================
echo  Smart Artwork Screenshot - Windows EXE Builder
echo ====================================================

python -m venv .venv
call .venv\Scripts\activate.bat

pip install --upgrade pip
pip install -r requirements.txt

pyinstaller --noconfirm --clean build_exe.spec

echo.
echo Build complete! Standalone executable created at:
echo   dist\SmartArtworkScreenshot.exe
echo.
pause
