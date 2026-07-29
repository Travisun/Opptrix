; NSIS custom hooks for electron-builder (include via build.nsis.include).
; 任务名须与 apps/desktop/electron/os-schedule/win32.cjs 的 TASK_NAME = 'OpptrixScheduleTick' 对齐。
;
; 背景：
; - 旧版 schtasks 每分钟拉起 Opptrix.exe，会在覆盖安装时反复「应用仍在运行」。
; - customInit 在向导页之前执行：先卸计划任务，再强制结束进程并等待。
; - customCheckAppRunning 在真正写文件前再清一次；默认温和关闭对「托盘保活」无效。
; - NSIS 中 PowerShell 的 $_ 必须写成 $$_（$$ → 字面 $）。

!include "nsProcess.nsh"

!macro _OpptrixDeleteScheduleTick
  nsExec::ExecToLog '"$SYSDIR\schtasks.exe" /Delete /TN "OpptrixScheduleTick" /F'
  Pop $0
!macroend

!macro _OpptrixForceKillApp
  ; 按映像名强杀（含 ELECTRON_RUN_AS_NODE 的 sidecar 子进程树）
  nsExec::ExecToLog '"$SYSDIR\taskkill.exe" /F /IM "Opptrix.exe" /T'
  Pop $0
  ; 再按安装目录路径清一次（与 electron-builder 默认检测口径一致）
  ${If} $INSTDIR != ""
    nsExec::ExecToLog '"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command "Get-CimInstance Win32_Process | Where-Object { $$_.Path -and $$_.Path.StartsWith('$INSTDIR', [System.StringComparison]::OrdinalIgnoreCase) } | ForEach-Object { Stop-Process -Id $$_.ProcessId -Force -ErrorAction SilentlyContinue }"'
    Pop $0
  ${EndIf}
!macroend

!macro customInit
  !insertmacro _OpptrixDeleteScheduleTick
  !insertmacro _OpptrixForceKillApp
  Sleep 1500
  !insertmacro _OpptrixForceKillApp
  Sleep 1000
!macroend

; 替换默认 CHECK：托盘应用会吞掉温和 Close，需直接强杀并重试。
; nsProcess::FindProcess：0 = 仍在运行；非 0（常见 603）= 未找到。
!macro customCheckAppRunning
  !insertmacro _OpptrixDeleteScheduleTick

  StrCpy $R1 0
  opptrix_close_loop:
    IntOp $R1 $R1 + 1
    !insertmacro _OpptrixForceKillApp
    Sleep 1200

    ${nsProcess::FindProcess} "Opptrix.exe" $R0
    ${If} $R0 != 0
      Goto opptrix_not_running
    ${EndIf}

    ${If} $R1 >= 5
      MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "$(appCannotBeClosed)" /SD IDCANCEL IDRETRY opptrix_close_loop
      Quit
    ${EndIf}
    Goto opptrix_close_loop

  opptrix_not_running:
!macroend

!macro customUnInstall
  !insertmacro _OpptrixDeleteScheduleTick
!macroend
