#Requires -Version 5.1
<#
.SYNOPSIS
  彻底停止并卸载 Windows 上的 Opptrix 桌面端，保留用户目录 ~/.opptrix。

.DESCRIPTION
  执行顺序：
    1. 停止 Opptrix / OpptrixSchedule 及相关安装目录内子进程
    2. 删除 Windows 计划任务（含遗留 OpptrixScheduleTick 及名称含 Opptrix 的任务）
    3. 调用官方卸载程序（若已安装）
    4. 清理安装目录、快捷方式、开机自启、协议注册、Electron userData、更新缓存
    5. 明确保留 %USERPROFILE%\.opptrix（配置、本地库等）

  不会删除：
    - %USERPROFILE%\.opptrix
    - 本仓库源码目录（例如 Documents\Opptrix）

.PARAMETER Force
  跳过交互确认（给自动化用）。

.PARAMETER WhatIf
  仅预览将要执行的操作，不实际修改。

.PARAMETER KeepShortcuts
  保留桌面/开始菜单快捷方式（默认会删除）。

.EXAMPLE
  右键 Uninstall-Opptrix-Windows.ps1 →「使用 PowerShell 运行」
#>
[CmdletBinding(SupportsShouldProcess = $true, ConfirmImpact = 'High')]
param(
  [switch]$Force,
  [switch]$KeepShortcuts
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Continue'

function Test-IsAdministrator {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  $principal = New-Object Security.Principal.WindowsPrincipal($identity)
  return $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

# 普通用户一键运行：自动弹 UAC 提权后继续（无需 bat）
if (-not $WhatIfPreference -and -not (Test-IsAdministrator)) {
  $argList = @(
    '-NoProfile'
    '-ExecutionPolicy', 'Bypass'
    '-WindowStyle', 'Hidden'
    '-File', $PSCommandPath
  )
  if ($Force) { $argList += '-Force' }
  if ($KeepShortcuts) { $argList += '-KeepShortcuts' }
  try {
    $proc = Start-Process -FilePath (Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe') `
      -Verb RunAs -ArgumentList $argList -PassThru -Wait
    exit $(if ($null -ne $proc.ExitCode) { $proc.ExitCode } else { 1 })
  } catch {
    Add-Type -AssemblyName System.Windows.Forms | Out-Null
    [System.Windows.Forms.MessageBox]::Show(
      "需要管理员权限才能完成卸载。`n请在弹出的权限确认中选择「是」。",
      '无法启动卸载',
      [System.Windows.Forms.MessageBoxButtons]::OK,
      [System.Windows.Forms.MessageBoxIcon]::Error
    ) | Out-Null
    exit 1
  }
}

# 交互卸载默认走图形确认，并跳过逐条 ShouldProcess 询问
$script:UseGui = -not $Force
if ($Force -or $script:UseGui) { $ConfirmPreference = 'None' }

$AppDisplayName = 'Opptrix'
$AppId = 'com.cuishushu.app.opptrix.desktop'
$KnownTaskNames = @('OpptrixScheduleTick')
$ProcessNameExact = @('Opptrix', 'OpptrixSchedule')
$UpdaterCacheDirName = '@opptrixdesktop-updater'

$UserOpptrixDir = Join-Path $env:USERPROFILE '.opptrix'
$RoamingOpptrix = Join-Path $env:APPDATA 'Opptrix'
$LocalOpptrix = Join-Path $env:LOCALAPPDATA 'Opptrix'
$LocalProgramsOpptrix = Join-Path $env:LOCALAPPDATA 'Programs\Opptrix'
$UpdaterCacheRoot = Join-Path $env:LOCALAPPDATA $UpdaterCacheDirName

$script:Report = [System.Collections.Generic.List[string]]::new()

function Write-Step {
  param([string]$Message)
  Write-Host ""
  Write-Host "==> $Message" -ForegroundColor Cyan
}

function Write-Info {
  param([string]$Message)
  Write-Host "    $Message"
}

function Add-Report {
  param([string]$Message)
  $script:Report.Add($Message) | Out-Null
  Write-Info $Message
}

function Get-PropString {
  param(
    [Parameter(Mandatory = $true)]$Object,
    [Parameter(Mandatory = $true)][string]$Name
  )
  if ($null -eq $Object) { return '' }
  $prop = $Object.PSObject.Properties[$Name]
  if ($null -eq $prop -or $null -eq $prop.Value) { return '' }
  return [string]$prop.Value
}

function Invoke-WithoutWhatIf {
  param([scriptblock]$Script)
  $prev = $WhatIfPreference
  $WhatIfPreference = $false
  try {
    & $Script
  } finally {
    $WhatIfPreference = $prev
  }
}

function Test-IsProtectedPath {
  param([string]$Path)
  if ([string]::IsNullOrWhiteSpace($Path)) { return $true }
  try {
    $full = [System.IO.Path]::GetFullPath($Path)
  } catch {
    return $true
  }
  $protected = @(
    [System.IO.Path]::GetFullPath($UserOpptrixDir)
    [System.IO.Path]::GetFullPath($env:USERPROFILE)
    [System.IO.Path]::GetFullPath($env:SystemRoot)
    [System.IO.Path]::GetFullPath(${env:ProgramFiles})
  )
  foreach ($p in $protected) {
    if ($full.TrimEnd('\') -ieq $p.TrimEnd('\')) { return $true }
  }
  # Never delete the reserved user data tree
  if ($full.StartsWith(($UserOpptrixDir.TrimEnd('\') + '\'), [System.StringComparison]::OrdinalIgnoreCase)) {
    return $true
  }
  return $false
}

function Invoke-TargetAction {
  param(
    [string]$Description,
    [scriptblock]$Action
  )
  if ($PSCmdlet.ShouldProcess($Description, 'Execute')) {
    & $Action
  } else {
    Add-Report "[WhatIf] $Description"
  }
}

function Get-OpptrixInstallRoots {
  $roots = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
  foreach ($candidate in @(
      $LocalProgramsOpptrix
      (Join-Path ${env:ProgramFiles} 'Opptrix')
      (Join-Path ${env:ProgramFiles(x86)} 'Opptrix')
      $LocalOpptrix
    )) {
    if ($candidate -and (Test-Path -LiteralPath $candidate)) {
      [void]$roots.Add([System.IO.Path]::GetFullPath($candidate))
    }
  }

  $uninstallKeys = @(
    'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*'
    'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*'
    'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*'
  )
  foreach ($pattern in $uninstallKeys) {
    Get-ItemProperty -Path $pattern -ErrorAction SilentlyContinue | ForEach-Object {
      $name = Get-PropString $_ 'DisplayName'
      $keyId = Get-PropString $_ 'PSChildName'
      if ($name -notmatch '(?i)Opptrix' -and $keyId -notmatch '(?i)opptrix|cuishushu\.app\.opptrix') {
        return
      }
      $installLocation = Get-PropString $_ 'InstallLocation'
      if ($installLocation -and (Test-Path -LiteralPath $installLocation)) {
        [void]$roots.Add([System.IO.Path]::GetFullPath($installLocation))
      }
      foreach ($raw in @((Get-PropString $_ 'UninstallString'), (Get-PropString $_ 'QuietUninstallString'))) {
        if ([string]::IsNullOrWhiteSpace($raw)) { continue }
        if ($raw -match '"([^"]+\.exe)"' -or $raw -match "([^\s]+\.exe)") {
          $exe = $Matches[1]
          $dir = Split-Path -Parent $exe
          if ($dir -and (Test-Path -LiteralPath $dir)) {
            [void]$roots.Add([System.IO.Path]::GetFullPath($dir))
          }
        }
      }
    }
  }
  return @($roots)
}

function Stop-OpptrixProcesses {
  Write-Step '停止正在运行的 Opptrix'
  $roots = Get-OpptrixInstallRoots

  $procs = @(Invoke-WithoutWhatIf {
      Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Where-Object {
        $base = [System.IO.Path]::GetFileNameWithoutExtension([string]$_.Name)
        if ($ProcessNameExact -contains $base) { return $true }
        $exe = Get-PropString $_ 'ExecutablePath'
        $cmd = Get-PropString $_ 'CommandLine'
        if (-not $exe -and -not $cmd) { return $false }
        foreach ($root in $roots) {
          if ($exe -and $exe.StartsWith($root, [System.StringComparison]::OrdinalIgnoreCase)) { return $true }
          if ($cmd -and $cmd.IndexOf($root, [System.StringComparison]::OrdinalIgnoreCase) -ge 0) { return $true }
        }
        if ($cmd -match '(?i)OpptrixSchedule|--opptrix-os-schedule|--headless-tick') { return $true }
        return $false
      }
    })

  if ($procs.Count -eq 0) {
    Add-Report '未发现正在运行的 Opptrix 进程'
    return
  }

  foreach ($proc in $procs) {
    $label = "#{0} {1}" -f $proc.ProcessId, $proc.Name
    Invoke-TargetAction -Description "结束进程 $label" -Action {
      try {
        Stop-Process -Id $proc.ProcessId -Force -ErrorAction Stop
        Add-Report "已结束进程 $label"
      } catch {
        Add-Report "结束进程失败 ${label}: $($_.Exception.Message)"
      }
    }
  }

  Start-Sleep -Seconds 1
  Add-Report ("进程处理完成（尝试结束 {0} 个）" -f $procs.Count)
}

function Remove-OpptrixScheduledTasks {
  Write-Step '删除 Opptrix Windows 计划任务'
  $names = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
  foreach ($n in $KnownTaskNames) { [void]$names.Add($n) }

  try {
    Invoke-WithoutWhatIf {
      Get-ScheduledTask -ErrorAction SilentlyContinue | Where-Object {
        $_.TaskName -match '(?i)Opptrix' -or $_.TaskPath -match '(?i)Opptrix'
      } | ForEach-Object {
        $tn = if ($_.TaskPath -and $_.TaskPath -ne '\') {
          ($_.TaskPath.TrimEnd('\') + '\' + $_.TaskName)
        } else {
          $_.TaskName
        }
        [void]$names.Add($tn.TrimStart('\'))
      }
    }
  } catch {
    Add-Report "枚举计划任务失败（将继续按已知名称删除）: $($_.Exception.Message)"
  }

  if ($names.Count -eq 0) {
    Add-Report '未发现 Opptrix 计划任务'
    return
  }

  foreach ($taskName in $names) {
    Invoke-TargetAction -Description "删除计划任务 $taskName" -Action {
      $result = & schtasks.exe /Delete /TN $taskName /F 2>&1 | Out-String
      if ($LASTEXITCODE -eq 0 -or $result -match '(?i)cannot find|找不到|does not exist|ERROR: The system cannot find') {
        Add-Report "已删除计划任务（或不存在）: $taskName"
      } else {
        Add-Report "删除计划任务失败: $taskName - $($result.Trim())"
      }
    }
  }
}

function Get-OpptrixUninstallEntries {
  $entries = @()
  $uninstallKeys = @(
    'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*'
    'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*'
    'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*'
  )
  foreach ($pattern in $uninstallKeys) {
    Get-ItemProperty -Path $pattern -ErrorAction SilentlyContinue | ForEach-Object {
      $name = Get-PropString $_ 'DisplayName'
      $keyId = Get-PropString $_ 'PSChildName'
      if ($name -match '(?i)Opptrix' -or $keyId -match '(?i)opptrix|cuishushu\.app\.opptrix') {
        $entries += $_
      }
    }
  }
  return $entries
}

function Invoke-OfficialUninstaller {
  Write-Step '调用官方卸载程序（若存在）'
  $entries = Get-OpptrixUninstallEntries
  if (-not $entries -or $entries.Count -eq 0) {
    Add-Report '未找到已注册的 Opptrix 卸载项，跳过官方卸载'
    return
  }

  foreach ($entry in $entries) {
    $display = Get-PropString $entry 'DisplayName'
    if (-not $display) { $display = 'Opptrix' }
    $quiet = Get-PropString $entry 'QuietUninstallString'
    $normal = Get-PropString $entry 'UninstallString'
    $cmdLine = if (-not [string]::IsNullOrWhiteSpace($quiet)) { $quiet } else { $normal }
    if ([string]::IsNullOrWhiteSpace($cmdLine)) {
      Add-Report "卸载项缺少 UninstallString: $display"
      continue
    }

    # electron-builder NSIS quiet uninstall usually already has /S; append if missing
    if ($cmdLine -notmatch '(?i)(\s|^)/S(\s|$)') {
      $cmdLine = "$cmdLine /S"
    }

    Invoke-TargetAction -Description "静默卸载 ${display}: $cmdLine" -Action {
      try {
        $proc = Start-Process -FilePath 'cmd.exe' -ArgumentList @('/c', $cmdLine) -Wait -PassThru -WindowStyle Hidden
        Add-Report "官方卸载退出码=$($proc.ExitCode) ($display)"
      } catch {
        Add-Report "官方卸载失败 (${display}): $($_.Exception.Message)"
      }
    }
  }

  # Give NSIS a moment to release file locks
  Start-Sleep -Seconds 2
}

function Remove-TreeSafe {
  param([string]$Path, [string]$Label)
  if ([string]::IsNullOrWhiteSpace($Path)) { return }
  if (-not (Test-Path -LiteralPath $Path)) {
    Add-Report "$Label 不存在: $Path"
    return
  }
  if (Test-IsProtectedPath -Path $Path) {
    Add-Report "已跳过受保护路径: $Path"
    return
  }
  Invoke-TargetAction -Description "删除 $Label ($Path)" -Action {
    try {
      Remove-Item -LiteralPath $Path -Recurse -Force -ErrorAction Stop
      Add-Report "已删除 $Label"
    } catch {
      Add-Report "删除失败 ${Label}: $($_.Exception.Message)"
    }
  }
}

function Remove-OpptrixShortcuts {
  if ($KeepShortcuts) {
    Write-Step '保留快捷方式（-KeepShortcuts）'
    return
  }
  Write-Step '删除快捷方式与开始菜单项'
  $searchRoots = @(
    (Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs')
    (Join-Path $env:ProgramData 'Microsoft\Windows\Start Menu\Programs')
    (Join-Path $env:USERPROFILE 'Desktop')
    (Join-Path $env:PUBLIC 'Desktop')
    (Join-Path $env:APPDATA 'Microsoft\Windows\Start Menu\Programs\Startup')
    (Join-Path $env:ProgramData 'Microsoft\Windows\Start Menu\Programs\Startup')
  )
  foreach ($root in $searchRoots) {
    if (-not (Test-Path -LiteralPath $root)) { continue }
    Get-ChildItem -LiteralPath $root -Recurse -Force -ErrorAction SilentlyContinue |
      Where-Object { $_.Name -match '(?i)Opptrix' } |
      ForEach-Object {
        $item = $_
        Invoke-TargetAction -Description "删除快捷方式 $($item.FullName)" -Action {
          try {
            Remove-Item -LiteralPath $item.FullName -Recurse -Force -ErrorAction Stop
            Add-Report "已删除: $($item.FullName)"
          } catch {
            Add-Report "删除失败: $($item.FullName) - $($_.Exception.Message)"
          }
        }
      }
  }
}

function Clear-OpptrixAutostart {
  Write-Step '清除开机自启注册'
  $runKey = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run'
  try {
    $props = Get-ItemProperty -Path $runKey -ErrorAction Stop
    $props.PSObject.Properties | Where-Object {
      $_.Name -notmatch '^PS' -and (
        [string]$_.Name -match '(?i)Opptrix|cuishushu' -or
        [string]$_.Value -match '(?i)Opptrix'
      )
    } | ForEach-Object {
      $name = $_.Name
      Invoke-TargetAction -Description "删除 Run 项 $name" -Action {
        Remove-ItemProperty -Path $runKey -Name $name -Force -ErrorAction Stop
        Add-Report "已删除开机自启: $name"
      }
    }
  } catch {
    Add-Report "读取 Run 注册表失败: $($_.Exception.Message)"
  }

  # Electron / NSIS 有时会写 StartupApproved
  $approved = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Explorer\StartupApproved\Run'
  if (Test-Path -LiteralPath $approved) {
    Get-Item -LiteralPath $approved -ErrorAction SilentlyContinue |
      Select-Object -ExpandProperty Property |
      Where-Object { $_ -match '(?i)Opptrix|cuishushu' } |
      ForEach-Object {
        $name = $_
        Invoke-TargetAction -Description "删除 StartupApproved $name" -Action {
          Remove-ItemProperty -Path $approved -Name $name -Force -ErrorAction SilentlyContinue
          Add-Report "已删除 StartupApproved: $name"
        }
      }
  }
}

function Clear-OpptrixProtocolAndRegistry {
  Write-Step '清理协议与卸载残留注册表'
  $keys = @(
    'HKCU:\Software\Classes\opptrix'
    "HKCU:\Software\$AppId"
    "HKCU:\Software\Opptrix"
    "HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\$AppId"
    "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\$AppId"
    "HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\$AppId"
  )
  foreach ($key in $keys) {
    if (Test-Path -LiteralPath $key) {
      Invoke-TargetAction -Description "删除注册表 $key" -Action {
        Remove-Item -LiteralPath $key -Recurse -Force -ErrorAction Stop
        Add-Report "已删除注册表: $key"
      }
    }
  }

  # Catch leftover uninstall entries by DisplayName
  foreach ($pattern in @(
      'HKCU:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*'
      'HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*'
      'HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*'
    )) {
    Get-ItemProperty -Path $pattern -ErrorAction SilentlyContinue | ForEach-Object {
      $display = Get-PropString $_ 'DisplayName'
      $keyId = Get-PropString $_ 'PSChildName'
      if ($display -match '(?i)^Opptrix' -or $keyId -match '(?i)opptrix|cuishushu\.app\.opptrix') {
        $path = Get-PropString $_ 'PSPath'
        if (-not $path) { return }
        Invoke-TargetAction -Description "删除卸载注册表 $path" -Action {
          Remove-Item -LiteralPath $path -Recurse -Force -ErrorAction Stop
          Add-Report "已删除卸载注册表: $path"
        }
      }
    }
  }
}

function Clear-OpptrixAppData {
  Write-Step '清理 Electron 应用数据与更新缓存（保留 ~/.opptrix）'
  if (Test-Path -LiteralPath $UserOpptrixDir) {
    Add-Report "保留用户目录: $UserOpptrixDir"
  } else {
    Add-Report "用户目录不存在（无需保留）: $UserOpptrixDir"
  }

  Remove-TreeSafe -Path $RoamingOpptrix -Label 'Electron userData (%APPDATA%\Opptrix)'
  Remove-TreeSafe -Path $LocalOpptrix -Label 'Local AppData Opptrix'
  Remove-TreeSafe -Path $LocalProgramsOpptrix -Label '安装目录 (%LOCALAPPDATA%\Programs\Opptrix)'
  Remove-TreeSafe -Path (Join-Path ${env:ProgramFiles} 'Opptrix') -Label 'Program Files\Opptrix'
  Remove-TreeSafe -Path (Join-Path ${env:ProgramFiles(x86)} 'Opptrix') -Label 'Program Files (x86)\Opptrix'
  Remove-TreeSafe -Path $UpdaterCacheRoot -Label "更新缓存 ($UpdaterCacheDirName)"

  # electron-builder / updater 偶发目录
  Get-ChildItem -LiteralPath $env:LOCALAPPDATA -Force -ErrorAction SilentlyContinue |
    Where-Object {
      $_.PSIsContainer -and
      $_.Name -match '(?i)opptrix|@opptrix' -and
      $_.FullName -notmatch '[\\/]\.opptrix([\\/]|$)'
    } |
    ForEach-Object { Remove-TreeSafe -Path $_.FullName -Label "LocalAppData\$($_.Name)" }
}

function Show-FinalStatus {
  Write-Step '验收'
  $procLeft = @(Invoke-WithoutWhatIf {
      Get-Process -ErrorAction SilentlyContinue | Where-Object {
        $ProcessNameExact -contains $_.ProcessName
      }
    })
  $tasksLeft = @()
  try {
    $tasksLeft = @(Invoke-WithoutWhatIf {
        Get-ScheduledTask -ErrorAction SilentlyContinue | Where-Object {
          $_.TaskName -match '(?i)Opptrix' -or $_.TaskPath -match '(?i)Opptrix'
        }
      })
  } catch { }

  $installLeft = @(
    $LocalProgramsOpptrix
    (Join-Path ${env:ProgramFiles} 'Opptrix')
    $RoamingOpptrix
  ) | Where-Object { Test-Path -LiteralPath $_ }
  $installLeft = @($installLeft)

  if ($procLeft.Count -eq 0) { Add-Report '进程: 无 Opptrix 残留' }
  else { Add-Report ("进程仍存在: {0}" -f (($procLeft | ForEach-Object { $_.ProcessName }) -join ', ')) }

  if ($tasksLeft.Count -eq 0) { Add-Report '计划任务: 无 Opptrix 残留' }
  else { Add-Report ("计划任务仍存在: {0}" -f (($tasksLeft | ForEach-Object { $_.TaskName }) -join ', ')) }

  if ($installLeft.Count -eq 0) { Add-Report '安装/Electron 数据目录: 已清理' }
  else { Add-Report ("仍存在目录: {0}" -f ($installLeft -join '; ')) }

  if (Test-Path -LiteralPath $UserOpptrixDir) {
    Add-Report "用户数据已保留: $UserOpptrixDir"
  } else {
    Add-Report "注意: 未找到 $UserOpptrixDir（可能本来就不存在）"
  }
}

function Show-GuiMessage {
  param(
    [string]$Text,
    [string]$Title,
    [ValidateSet('YesNo', 'OK')]
    [string]$Buttons = 'OK',
    [ValidateSet('Information', 'Warning', 'Error', 'Question')]
    [string]$Icon = 'Information'
  )
  Add-Type -AssemblyName System.Windows.Forms | Out-Null
  $btn = [System.Windows.Forms.MessageBoxButtons]::$Buttons
  $ico = [System.Windows.Forms.MessageBoxIcon]::$Icon
  $default = if ($Buttons -eq 'YesNo') {
    [System.Windows.Forms.MessageBoxDefaultButton]::Button2
  } else {
    [System.Windows.Forms.MessageBoxDefaultButton]::Button1
  }
  return [System.Windows.Forms.MessageBox]::Show(
    $Text,
    $Title,
    $btn,
    $ico,
    $default
  )
}

function Confirm-Uninstall {
  if ($Force -or $WhatIfPreference) { return $true }

  $result = Show-GuiMessage -Title '卸载 Opptrix' -Buttons YesNo -Icon Warning -Text @(
    '即将卸载 Opptrix 桌面应用。'
    ''
    '会清除：应用本体、快捷方式、开机自启、系统计划任务。'
    '会保留：你的个人数据（配置、本地库等）。'
    ''
    '确定继续卸载吗？'
  ) -join "`n"
  if ($result -ne [System.Windows.Forms.DialogResult]::Yes) {
    Show-GuiMessage -Title '已取消' -Buttons OK -Icon Information -Text '已取消卸载，未做任何更改。'
    return $false
  }
  return $true
}

# ------------------ main ------------------
try {
  try { [Console]::Title = '正在卸载 Opptrix…' } catch { }

  Write-Host "Opptrix Windows 彻底卸载" -ForegroundColor Green
  Write-Host "将保留个人数据目录: $UserOpptrixDir"

  if (-not (Confirm-Uninstall)) {
    Write-Host '已取消。'
    exit 2
  }

  $ConfirmPreference = 'None'

  Stop-OpptrixProcesses
  Remove-OpptrixScheduledTasks
  Invoke-OfficialUninstaller
  Stop-OpptrixProcesses
  Clear-OpptrixAutostart
  Remove-OpptrixShortcuts
  Clear-OpptrixProtocolAndRegistry
  Clear-OpptrixAppData
  Show-FinalStatus

  Write-Host ""
  Write-Host '完成。重新安装后，个人数据仍可继续使用。' -ForegroundColor Green

  if ($script:UseGui -and -not $WhatIfPreference) {
    Show-GuiMessage -Title '卸载完成' -Buttons OK -Icon Information -Text @(
      'Opptrix 已卸载完成。'
      ''
      '你的个人数据已保留，重新安装后可以继续使用。'
    ) -join "`n"
  }
  exit 0
} catch {
  $msg = $_.Exception.Message
  Write-Host "卸载过程出错: $msg" -ForegroundColor Red
  if ($script:UseGui) {
    Show-GuiMessage -Title '卸载失败' -Buttons OK -Icon Error -Text "卸载过程出错：`n$msg"
  }
  exit 1
}
