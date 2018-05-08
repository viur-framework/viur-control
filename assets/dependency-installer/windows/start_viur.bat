@ECHO OFF


cd "%USERPROFILE%\viur-control"

ECHO Initializing ViUR ...
CALL npm install

ECHO Starting ViUR ...
CALL npm start

