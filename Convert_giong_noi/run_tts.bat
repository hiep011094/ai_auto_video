@echo off
cd /d "%~dp0"
echo Dang chay qua trinh tao giong noi bang OmniVoice...
..\.venv\Scripts\python.exe generate_tts_omnivoice.py
pause
