; build/installer.nsh — Custom NSIS hooks for Contrary Convertor

!macro customInstall
  ; Register Windows Shell Context Menu for "Convert with Contrary Convertor"
  ; Adds to right-click menu for ALL files (*)
  WriteRegStr HKCR "*\shell\ContraryConvertor" "" "Convert with Contrary Convertor"
  WriteRegStr HKCR "*\shell\ContraryConvertor" "Icon" "$INSTDIR\${APP_FILENAME}.exe,0"
  WriteRegStr HKCR "*\shell\ContraryConvertor\command" "" '"$INSTDIR\${APP_FILENAME}.exe" "%1"'

  ; Launch the app after install
  Exec '"$INSTDIR\${APP_FILENAME}.exe"'
!macroend

!macro customUnInstall
  ; Remove context menu entries on uninstall
  DeleteRegKey HKCR "*\shell\ContraryConvertor"
!macroend
