@ECHO OFF

ECHO Installing NodeJS ...

start /wait msiexec /quiet /passive /i "https://nodejs.org/dist/v10.0.0/node-v10.0.0-x64.msi"
"C:\Program Files\nodejs\npm.cmd" install -g less

ECHO Adding npm to your path environment variable ...
setx path "%PATH%;C:\Program Files\nodejs"

