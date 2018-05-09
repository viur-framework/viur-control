@ECHO OFF

ECHO Downloading Google SDK installer ...
start /wait curl "https://dl.google.com/dl/cloudsdk/channels/rapid/downloads/google-cloud-sdk-192.0.0-windows-x86_64-bundled-python.zip?hl=de" -o "%USERPROFILE%\GoogleCloudSDKInstaller.zip"

ECHO Extracting Google SDK installer ...
powershell.exe -nologo -noprofile -command "& { Add-Type -A 'System.IO.Compression.FileSystem'; [IO.Compression.ZipFile]::ExtractToDirectory('%USERPROFILE%\GoogleCloudSDKInstaller.zip', '%USERPROFILE%\google-cloud-sdk-installer'); }"

xcopy /E /H /K /Q /Y "%USERPROFILE%\google-cloud-sdk-installer" "%USERPROFILE%\"
CALL "%USERPROFILE%\google-cloud-sdk\install.bat" --quiet --usage-reporting true --path-update true --additional-components beta app-engine-python app-engine-python-extras

ECHO Adding Google SDK to your system path environment variable ...
setx path "%PATH%;%USERPROFILE%\google-cloud-sdk\bin"





