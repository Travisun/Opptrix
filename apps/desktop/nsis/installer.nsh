; NSIS custom hooks for electron-builder (include via build.nsis.include).
; 任务名须与 apps/desktop/electron/os-schedule/win32.cjs 的 TASK_NAME = 'OpptrixScheduleTick' 对齐。
; customInit 在安装器检查「应用是否在运行」之前执行，避免旧版 schtasks 定时拉起挡住覆盖安装。

!macro customInit
  ; Delete OS schedule tick task (ignore if missing / access denied)
  nsExec::ExecToLog 'schtasks /Delete /TN "OpptrixScheduleTick" /F'
  Pop $0
  ; End any still-running Opptrix (tray / --background --schedule-tick)
  nsExec::ExecToLog 'taskkill /F /IM Opptrix.exe /T'
  Pop $0
!macroend

!macro customUnInstall
  ; Clean up schedule tick on uninstall (same TASK_NAME as win32.cjs)
  nsExec::ExecToLog 'schtasks /Delete /TN "OpptrixScheduleTick" /F'
  Pop $0
!macroend
