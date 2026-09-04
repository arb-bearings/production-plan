@echo off
echo Starting portable MongoDB server...
"%USERPROFILE%\mongodb\mongodb-win32-x86_64-windows-7.0.12\bin\mongod.exe" --dbpath "%USERPROFILE%\mongodb\data" --bind_ip 127.0.0.1 --port 27017
pause
