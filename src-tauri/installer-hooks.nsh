Var PgDataDir

!macro NSIS_HOOK_POSTINSTALL
  ReadEnvStr $PgDataDir COMMONPROGRAMDATA
  ${If} $PgDataDir == ""
    StrCpy $PgDataDir "C:\ProgramData"
  ${EndIf}
  CreateDirectory "$PgDataDir\PortalGuard"
  ExecWait 'icacls "$PgDataDir\PortalGuard" /grant *S-1-5-32-545:(OI)(CI)M /T /C /Q'
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  nsExec::Exec 'taskkill /F /IM portalguard-server*.exe'
  Pop $0
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  ${If} $UpdateMode <> 1
    ReadEnvStr $PgDataDir COMMONPROGRAMDATA
    ${If} $PgDataDir == ""
      StrCpy $PgDataDir "C:\ProgramData"
    ${EndIf}
    RMDir /r "$PgDataDir\PortalGuard"
    SetShellVarContext current
    RMDir /r "$APPDATA\${BUNDLEID}"
    RMDir /r "$LOCALAPPDATA\${BUNDLEID}"
  ${EndIf}
!macroend
