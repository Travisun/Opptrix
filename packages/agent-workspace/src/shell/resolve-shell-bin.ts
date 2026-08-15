/**
 * Posix shell 解析 — 供 elevated wrap 与 shellWrapArgv 共用。
 * 避免硬编码 /bin/bash（部分系统无 bash → spawn ENOENT）。
 */
import fs from 'node:fs'
import path from 'node:path'

/** spawn ENOENT 时给 Agent 的可行动提示（勿暴露本机绝对路径细节给用户主文案） */
export const SPAWN_ENOENT_HINT =
  '找不到可执行文件（命令名不在沙盒 PATH，或系统默认 shell 不可用）。'
  + '请改用相对工作区 root 的 command/cwd，确认二进制名正确；'
  + '长任务请 background:true，勿反复重试同一失败命令。'

function isExecutableAbsolute(filePath: string): boolean {
  if (!path.isAbsolute(filePath)) return false
  try {
    fs.accessSync(filePath, fs.constants.X_OK)
    return true
  } catch {
    return false
  }
}

/**
 * 解析 posix 下用于 `shell -c` 的绝对 shell 路径。
 * 顺序：`env.SHELL`（绝对且可执行）→ darwin 优先 zsh → bash → `/bin/sh`。
 * win32 调用方应走 cmd，勿依赖本函数。
 */
export function resolvePosixShellPath(
  env: NodeJS.ProcessEnv = process.env,
  platform: NodeJS.Platform = process.platform,
): string {
  const fromEnv = env.SHELL?.trim()
  if (fromEnv && isExecutableAbsolute(fromEnv)) {
    return fromEnv
  }

  const candidates: string[] = []
  if (platform === 'darwin') {
    candidates.push('/bin/zsh', '/usr/bin/zsh')
  }
  candidates.push('/bin/bash', '/usr/bin/bash', '/bin/sh')

  for (const candidate of candidates) {
    if (isExecutableAbsolute(candidate)) return candidate
  }
  return '/bin/sh'
}
