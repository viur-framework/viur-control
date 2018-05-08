@ECHO OFF

REM ECHO We will open a web browser. Please log in to your google account to continue ...
REM "%USERPROFILE%\google-cloud-sdk\bin\gcloud" auth login

REM ECHO Initialize Google SDK ...
REM "%USERPROFILE%\google-cloud-sdk\bin\gcloud" init --skip-diagnostics

"%USERPROFILE%\google-cloud-sdk\bin\gcloud" config configurations create viur-control-default
"%USERPROFILE%\google-cloud-sdk\bin\gcloud" config set app/promote_by_default false


