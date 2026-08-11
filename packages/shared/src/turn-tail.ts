/**
 * 本轮动态尾注 — 时钟 / 选型卡等易变内容，勿写入稳定 system（破坏前缀缓存）。
 */

export function buildTurnTailPrompt(opts?: {
  sessionClock?: string
  routePlaybook?: string
}): string {
  const parts = [opts?.sessionClock?.trim(), opts?.routePlaybook?.trim()].filter(Boolean) as string[]
  if (!parts.length) return ''
  return [
    '【本轮动态说明 — 仅本轮有效，不改变既有系统规则】',
    ...parts,
  ].join('\n\n')
}

/** 将 turn-tail 追加到发给模型的 messages 末尾（ephemeral user，不破坏 tool 配对） */
export function appendTurnTailMessages<T extends { role: string; content?: unknown }>(
  messages: T[],
  turnTail: string,
): T[] {
  const text = turnTail.trim()
  if (!text) return messages
  return [...messages, { role: 'user', content: text } as T]
}
