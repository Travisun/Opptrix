/**
 * 会话级外部 MCP 硬隔离（hard_unavailable）。
 * 仅追加 serverId；不改冻结 tools[]；429 不得写入。
 */

export type QuarantineEntry = {
  reason: 'hard_unavailable'
  at: number
}

const bySession = new Map<string, Map<string, QuarantineEntry>>()

export function disableHard(sessionId: string, serverId: string): void {
  if (!sessionId || !serverId) return
  let map = bySession.get(sessionId)
  if (!map) {
    map = new Map()
    bySession.set(sessionId, map)
  }
  map.set(serverId, { reason: 'hard_unavailable', at: Date.now() })
}

export function isDisabled(sessionId: string, serverId: string): boolean {
  if (!sessionId || !serverId) return false
  return bySession.get(sessionId)?.has(serverId) ?? false
}

export function listDisabled(sessionId: string): string[] {
  if (!sessionId) return []
  const map = bySession.get(sessionId)
  return map ? [...map.keys()] : []
}

/** 清除某 server 在所有会话中的隔离（密钥/启用变更时） */
export function clearServer(serverId: string): void {
  if (!serverId) return
  for (const [sid, map] of bySession) {
    map.delete(serverId)
    if (map.size === 0) bySession.delete(sid)
  }
}

export function clearSession(sessionId: string): void {
  if (!sessionId) return
  bySession.delete(sessionId)
}

export function resetSessionMcpQuarantineForTests(): void {
  bySession.clear()
}

/** turn-tail 片段；空会话或无隔离时返回 ''（面向 LLM，可用 serverId） */
export function buildDisabledMcpTurnTail(sessionId: string): string {
  const ids = listDisabled(sessionId)
  if (!ids.length) return ''
  const lines = [
    '【本轮勿用的外部数据源 — tools 列表未改，仅排除下列前缀】',
    ...ids.map(
      id =>
        `- ${id}：连接或密钥不可用，勿再调用 ${id}__*，改用其他外部数据源或本地兜底`,
    ),
  ]
  return lines.join('\n')
}
