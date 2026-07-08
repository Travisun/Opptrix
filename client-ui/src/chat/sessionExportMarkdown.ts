import type { ChatDisplayMessage, SessionMeta } from '../types/chat'

function formatTimestamp(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString('zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function roleLabel(role: ChatDisplayMessage['role']): string {
  return role === 'user' ? '用户' : '助手'
}

export function sanitizeSessionFilename(title: string): string {
  const trimmed = title.replace(/[/\\?%*:|"<>]/g, '_').trim()
  return trimmed || '对话'
}

/** 将完整对话导出为 Markdown 文本 */
export function sessionToMarkdown(
  session: Pick<SessionMeta, 'title' | 'createdAt' | 'updatedAt'>,
  messages: ChatDisplayMessage[],
): string {
  const exportedAt = formatTimestamp(new Date().toISOString())
  const lines: string[] = [
    `# ${session.title || '新对话'}`,
    '',
    `> 导出时间：${exportedAt}`,
    `> 创建：${formatTimestamp(session.createdAt)} · 更新：${formatTimestamp(session.updatedAt)}`,
    '',
    '---',
    '',
  ]

  if (messages.length === 0) {
    lines.push('_（暂无消息）_', '')
    return lines.join('\n')
  }

  for (const msg of messages) {
    lines.push(`## ${roleLabel(msg.role)} · ${formatTimestamp(msg.at)}`, '')
    lines.push(msg.content.trim() || '_（空消息）_', '')
    lines.push('')
  }

  return lines.join('\n').trimEnd() + '\n'
}
