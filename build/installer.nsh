!include "MUI2.nsh"
!include "LogicLib.nsh"

!define METIS_CONFIG_REGISTRY_KEY "Software\metis"

; Workspace setup and R extraction are handled by the Electron app on first run.
; The custom React installer UI (InstallerPreview) replaces any NSIS-side setup pages.

!macro customInit
!macroend

!macro customInstall
!macroend
