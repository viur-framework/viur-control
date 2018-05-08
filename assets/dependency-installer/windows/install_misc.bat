@ECHO OFF

ECHO Installing miscellaneous utilities ...
REM !GIT Should be installed at this point!
C:\Python27\Scripts\pip.exe install "git+https://github.com/pyjs/pyjs.git#egg=pyjs"
C:\Python27\Scripts\pip.exe install pypiwin32

