import type { ChatMessage } from './provider.js'

/** Drop orphan tool rows and assistant tool_calls without full tool responses. */
export function repairToolCallSequences(messages: ChatMessage[]): ChatMessage[] {
  const out: ChatMessage[] = []
  for (let i = 0; i < messages.length; i++) {
    const m = messages[i]
    if (m.role === 'assistant' && m.tool_calls?.length) {
      const tools = collectFollowingToolMessages(messages, i + 1)
      if (!hasCompleteToolResponses(m, tools)) {
        i += tools.length
        continue
      }
      out.push(m, ...tools)
      i += tools.length
      continue
    }
    if (m.role === 'tool') continue
    out.push(m)
  }
  return out
}

/**
 * Keep recent history without splitting assistant tool_calls from their tool replies.
 * Prevents OpenAI 400: "insufficient tool messages following tool_calls message".
 */
export function tailMessagesForLlm(messages: ChatMessage[], max = 24): ChatMessage[] {
  const repaired = repairToolCallSequences(messages)
  if (repaired.length <= max) return repaired

  const groups: ChatMessage[][] = []
  let i = repaired.length - 1

  while (i >= 0 && countMessages(groups) < max) {
    const m = repaired[i]
    if (m.role === 'tool') {
      const toolRun: ChatMessage[] = []
      let j = i
      while (j >= 0 && repaired[j].role === 'tool') {
        toolRun.unshift(repaired[j])
        j--
      }
      const assistant = j >= 0 ? repaired[j] : null
      if (assistant?.role === 'assistant' && assistant.tool_calls?.length
        && hasCompleteToolResponses(assistant, toolRun)) {
        groups.unshift([assistant, ...toolRun])
        i = j - 1
      } else {
        i = j
      }
      continue
    }

    if (m.role === 'assistant' && m.tool_calls?.length) {
      i--
      continue
    }

    groups.unshift([m])
    i--
  }

  return groups.flat()
}

function collectFollowingToolMessages(messages: ChatMessage[], start: number): ChatMessage[] {
  const out: ChatMessage[] = []
  for (let i = start; i < messages.length; i++) {
    if (messages[i].role !== 'tool') break
    out.push(messages[i])
  }
  return out
}

function hasCompleteToolResponses(assistant: ChatMessage, toolMsgs: ChatMessage[]): boolean {
  const ids = assistant.tool_calls?.map(tc => tc.id) ?? []
  if (!ids.length) return true
  if (toolMsgs.length !== ids.length) return false
  const responded = new Set(toolMsgs.map(t => t.tool_call_id).filter(Boolean))
  return ids.every(id => responded.has(id))
}

function countMessages(groups: ChatMessage[][]): number {
  return groups.reduce((n, g) => n + g.length, 0)
}
