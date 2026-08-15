import { WorkspaceError } from '../errors.js'
import { argvToCommandString } from './package-policy.js'
import { resolvePosixShellPath } from './resolve-shell-bin.js'

/**
 * 将 command 字符串拆成 argv（尊重单/双引号与反斜杠转义）。
 * 不做 shell 展开；含管道/重定向的原串仍应经沙箱 wrap 的 shell 语义执行。
 */
export function parseCommandToArgv(command: string): string[] {
  const out: string[] = []
  let cur = ''
  let quote: '"' | "'" | null = null
  let escape = false

  for (let i = 0; i < command.length; i++) {
    const ch = command[i]!
    if (escape) {
      cur += ch
      escape = false
      continue
    }
    if (ch === '\\' && quote !== "'") {
      escape = true
      continue
    }
    if (quote) {
      if (ch === quote) quote = null
      else cur += ch
      continue
    }
    if (ch === '"' || ch === "'") {
      quote = ch
      continue
    }
    if (/\s/.test(ch)) {
      if (cur.length > 0) {
        out.push(cur)
        cur = ''
      }
      continue
    }
    cur += ch
  }

  if (escape) cur += '\\'
  if (quote) {
    throw new WorkspaceError('命令引号未闭合')
  }
  if (cur.length > 0) out.push(cur)
  return out
}

/** 粗略判断是否含需真 shell 语义的元字符（管道、重定向、链式等） */
export function commandNeedsRealShell(command: string): boolean {
  let quote: '"' | "'" | null = null
  let escape = false
  for (let i = 0; i < command.length; i++) {
    const ch = command[i]!
    if (escape) {
      escape = false
      continue
    }
    if (ch === '\\' && quote !== "'") {
      escape = true
      continue
    }
    if (quote) {
      if (ch === quote) quote = null
      continue
    }
    if (ch === '"' || ch === "'") {
      quote = ch
      continue
    }
    if (ch === '|' || ch === '&' || ch === ';' || ch === '<' || ch === '>' || ch === '`') {
      return true
    }
    if (ch === '$' && command[i + 1] === '(') return true
  }
  return false
}

export function resolveShellCommandInput(params: {
  command?: string
  argv?: readonly string[]
}): {
  command: string
  argv: string[]
  fromLegacyArgv: boolean
} {
  const rawCmd = params.command?.trim() ?? ''
  if (rawCmd) {
    const argv = parseCommandToArgv(rawCmd)
    if (!argv.length) throw new WorkspaceError('命令不能为空')
    return { command: rawCmd, argv, fromLegacyArgv: false }
  }
  const argv = (params.argv ?? []).map(a => String(a ?? '')).filter(a => a.length > 0)
  if (!argv.length) throw new WorkspaceError('命令不能为空')
  return {
    command: argvToCommandString(argv),
    argv,
    fromLegacyArgv: true,
  }
}

/** 平台 shell 包装：用于 basic / unsandboxed 下执行含元字符的 command */
export function shellWrapArgv(command: string): string[] {
  if (process.platform === 'win32') {
    return ['cmd.exe', '/d', '/s', '/c', command]
  }
  // 与 elevated wrap 同一解析：SHELL → darwin zsh → bash → /bin/sh（可兜底 sh）
  return [resolvePosixShellPath(), '-c', command]
}
