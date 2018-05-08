@ECHO OFF

ECHO Copying git installer settings ...
REM !Im lokalen ausgepackten installer Verzeichnis starten!
copy /Y git-install-args.ini "%USERPROFILE%"\

ECHO Downloading git ...
start /wait curl -L "https://github.com/git-for-windows/git/releases/download/v2.17.0.windows.1/Git-2.17.0-64-bit.exe" -o "%USERPROFILE%\Git-2.17.0-64-bit.exe"

ECHO Installing git ...
"%USERPROFILE%\Git-2.17.0-64-bit.exe" /SILENT /LOADINF="%USERPROFILE%\git-install-args.ini"

ECHO Adding git.exe to your path ...
setx path "%PATH%;C:\Program Files\Git\bin"
