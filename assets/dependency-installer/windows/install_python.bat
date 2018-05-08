@ECHO OFF

ECHO Installing python ...

start /wait msiexec /i "https://www.python.org/ftp/python/2.7.14/python-2.7.14.msi" /quiet /passive /norestart AllUsers=1 ADDLOCAL=ALL

start /wait python -m pip install --upgrade pip
setx path "%PATH%;C:\Python27;C:\Python27\Scripts"
