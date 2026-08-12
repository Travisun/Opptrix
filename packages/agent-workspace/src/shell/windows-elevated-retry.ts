/**
 * Elevated Windows sandbox：凭据失效（1326 / 1312）时最多 force install/rotate 一次再执行。
 * 对齐 Codex `retry_runner_spawn_once` / `is_refreshable_sandbox_creds_error` 语义。
 */

/** ERROR_LOGON_FAILURE */
export const WIN_ERROR_LOGON_FAILURE = 1326
/** ERROR_NO_SUCH_LOGON_SESSION */
export const WIN_ERROR_NO_SUCH_LOGON_SESSION = 1312

const REFRESHABLE_CODES = new Set([
  WIN_ERROR_LOGON_FAILURE,
  WIN_ERROR_NO_SUCH_LOGON_SESSION,
])

function extractWindowsErrorCodes(text: string): number[] {
  const codes: number[] = []
  const re = /\b(?:0x)?(1326|1312)\b/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) != null) {
    codes.push(Number(m[1]))
  }
  // also "Windows error 1326" / "error: 1312"
  const re2 = /(?:windows\s*error|error(?:\s*code)?)\s*[:=]?\s*(1326|1312)\b/gi
  while ((m = re2.exec(text)) != null) {
    const n = Number(m[1])
    if (!codes.includes(n)) codes.push(n)
  }
  return codes
}

function commandTargetsWindowsApps(command: readonly string[] | undefined): boolean {
  if (!command?.length) return false
  return command.some(part => /WindowsApps/i.test(part))
}

/**
 * 识别 elevated Logon / 凭据类错误（1326、1312 及含 CreateProcessWithLogonW 的等价文案）。
 * 不记录密钥；仅看错误文本与命令路径。
 */
export function isRefreshableWindowsCredError(
  errOrText: unknown,
  command?: readonly string[],
): boolean {
  const text = errOrText instanceof Error
    ? `${errOrText.name}\n${errOrText.message}\n${errOrText.stack ?? ''}`
    : String(errOrText ?? '')
  if (!text.trim()) return false

  const codes = extractWindowsErrorCodes(text)
  const hasRefreshableCode = codes.some(c => REFRESHABLE_CODES.has(c))
  const mentionsLogonApi = /CreateProcessWithLogonW/i.test(text)
  const mentionsLogonName =
    /ERROR_LOGON_FAILURE|ERROR_NO_SUCH_LOGON_SESSION|logon\s*failure|no such logon session/i.test(text)

  if (!hasRefreshableCode && !mentionsLogonApi && !mentionsLogonName) return false

  // AppX / WindowsApps：单独 1312 可能表示健康 token 无法启动该路径，轮换凭据无效
  if (
    codes.includes(WIN_ERROR_NO_SUCH_LOGON_SESSION)
    && !codes.includes(WIN_ERROR_LOGON_FAILURE)
    && commandTargetsWindowsApps(command)
    && !mentionsLogonApi
  ) {
    return false
  }

  if (hasRefreshableCode) return true
  if (mentionsLogonName) return true
  if (mentionsLogonApi && /\b(1326|1312)\b/.test(text)) return true
  return false
}

export function collectSandboxFailureText(result: {
  exitCode: number | null
  stdout?: string
  stderr?: string
  error?: unknown
}): string {
  const parts: string[] = []
  if (result.error != null) {
    parts.push(result.error instanceof Error ? result.error.message : String(result.error))
  }
  if (result.stderr) parts.push(result.stderr)
  if (result.stdout) parts.push(result.stdout)
  if (result.exitCode != null && result.exitCode !== 0) {
    parts.push(`exit ${result.exitCode}`)
  }
  return parts.join('\n')
}

export interface ElevatedCredRetryHooks {
  /** force install / rotate sandbox credentials（最多调用一次） */
  refreshCredentials: () => Promise<void>
}

/**
 * Promise 抛错路径：execute 抛出时可刷新凭据错误 → refresh → 再 execute 一次。
 */
export async function withElevatedCredRefreshRetryOnThrow<T>(
  execute: () => Promise<T>,
  hooks: ElevatedCredRetryHooks,
  command?: readonly string[],
): Promise<T> {
  try {
    return await execute()
  } catch (err) {
    if (!isRefreshableWindowsCredError(err, command)) throw err
    await hooks.refreshCredentials()
    return execute()
  }
}

/**
 * 结果路径：exit/stderr 显示凭据错误时 refresh 后再执行一次。
 */
export async function withElevatedCredRefreshRetryOnResult<T>(
  execute: () => Promise<T>,
  hooks: ElevatedCredRetryHooks,
  options: {
    command?: readonly string[]
    isFailure: (result: T) => boolean
    failureText: (result: T) => string
  },
): Promise<T> {
  const first = await execute()
  if (!options.isFailure(first)) return first
  const text = options.failureText(first)
  if (!isRefreshableWindowsCredError(text, options.command)) return first
  await hooks.refreshCredentials()
  return execute()
}
