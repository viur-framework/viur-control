@ECHO OFF


cd "%USERPROFILE%\viur-control"

ECHO Initializing ViUR ...
CALL npm install

ECHO Updating ViUR ...
CALL npm update

ECHO Starting ViUR ...
CALL npm start

