; build/installer.nsh — Custom NSIS hooks for Vesper Convertor

!macro customInstall
  ; Register Windows Shell Context Menu for "Convert with Vesper Convertor"
  ; Adds to right-click menu for ALL files (*)
  WriteRegStr HKCR "*\shell\VesperConvertor" "" "Convert with Vesper Convertor"
  WriteRegStr HKCR "*\shell\VesperConvertor" "Icon" "$INSTDIR\${APP_FILENAME}.exe,0"
  WriteRegStr HKCR "*\shell\VesperConvertor\command" "" '"$INSTDIR\${APP_FILENAME}.exe" "%1"'

  ; Launch the app after install
  Exec '"$INSTDIR\${APP_FILENAME}.exe"'
!macroend

!macro customUnInstall
  ; Remove context menu entries on uninstall
  DeleteRegKey HKCR "*\shell\VesperConvertor"
!macroend
