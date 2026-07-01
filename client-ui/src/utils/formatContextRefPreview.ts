import type { SessionContextRef } from '../types/chat'

export function formatContextRefLabel(ref: SessionContextRef, max = 28): string {
  const preview = ref.preview.replace(/\s+/g, ' ').trim()
  const prefix = ref.kind === 'article' ? '资讯' : '引用'
  const text = preview ? `${prefix} · ${preview}` : prefix
  return text.length <= max ? text : `${text.slice(0, max)}…`
}

export function formatContextRefPreview(ref: SessionContextRef): string {
  if (ref.kind === 'article') {
    const body = ref.bodyText.trim() || ref.title
    return `资讯：${ref.title}\n来源：${ref.sourceTitle}${ref.link ? `\n链接：${ref.link}` : ''}\n\n${body}`
  }
  if (ref.kind === 'selection') {
    const role = ref.sourceRole === 'user' ? '你' : 'Agent'
    return `${role} 消息节选：\n${ref.selectedText.trim()}`
  }
  const assistant = ref.turns.find(t => t.role === 'assistant') ?? ref.turns[0]
  const body = assistant?.content.trim() ?? ref.preview
  return `来自「${ref.sourceSessionTitle}」\n\nAgent:\n${body}`
}

export function previewSelectionText(text: string, max = 72): string {
  const oneLine = text.replace(/\s+/g, ' ').trim()
  if (!oneLine) return '空内容'
  return oneLine.length <= max ? oneLine : `${oneLine.slice(0, max)}…`
}
