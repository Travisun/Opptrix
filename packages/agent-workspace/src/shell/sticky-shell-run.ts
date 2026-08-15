/** 将 argv 拼成用户可见的命令摘要（截断）。shell-run sticky 已移除（围栏内免总确认）。 */
export function summarizeShellArgv(argv: readonly string[], maxLen = 120): string {
  const joined = argv.join(' ').trim()
  if (!joined) return '（空命令）'
  return joined.length <= maxLen ? joined : `${joined.slice(0, maxLen)}…`
}
