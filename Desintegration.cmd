@echo off
title Miku - MyJarvis desintegration
echo.
echo   Retrait des raccourcis Windows de MyJarvis (le dossier, lui, reste intact).
echo   Les raccourcis partent a la corbeille (rien n'est supprime definitivement).
echo.
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "Add-Type -AssemblyName Microsoft.VisualBasic; " ^
  "$l = @((Join-Path ([Environment]::GetFolderPath('Programs')) 'My Jarvis.lnk'), (Join-Path ([Environment]::GetFolderPath('Programs')) 'MyJarvis.lnk'), (Join-Path ([Environment]::GetFolderPath('Desktop')) 'My Jarvis.lnk'), (Join-Path ([Environment]::GetFolderPath('Desktop')) 'MyJarvis.lnk')); " ^
  "foreach ($p in $l) { if (Test-Path $p) { [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile($p, 'OnlyErrorDialogs', 'SendToRecycleBin'); Write-Host ('  Corbeille : ' + $p) } }"
echo.
echo   Termine. MyJarvis n'apparait plus dans Windows ; le dossier reste utilisable.
pause
