import type { ChatMessage } from '../llm/provider.js'
import type { OpenAiTool } from '../tools.js'

/** 中英混合粗估：CJK 偏多时略紧 */
export function estimateTextTokens(text: string): number {
  if (!text) return 0
  let cjk = 0
  let other = 0
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0
    if (
      (code >= 0x4e00 && code <= 0x9fff)
      || (code >= 0x3400 && code <= 0x4dbf)
      || (code >= 0x3000 && code <= 0x303f)
    ) {
      cjk += 1
    } else {
      other += 1
    }
  }
  return Math.ceil(cjk * 0.6 + other / 4)
}

export function estimateMessageTokens(messages: ChatMessage[]): number {
  let total = 0
  for (const m of messages) {
    total += 4
    if (m.content) total += estimateTextTokens(String(m.content))
    if (m.name) total += estimateTextTokens(m.name)
    if (m.tool_calls?.length) {
      for (const tc of m.tool_calls) {
        total += estimateTextTokens(tc.function.name)
        total += estimateTextTokens(tc.function.arguments ?? '')
        total += 8
      }
    }
  }
  return total
}

export function estimateToolsTokens(tools: OpenAiTool[] | undefined): number {
  if (!tools?.length) return 0
  try {
    return estimateTextTokens(JSON.stringify(tools))
  } catch {
    return tools.length * 120
  }
}

export function estimateSystemToolsReserve(systemPrompt: string, tools?: OpenAiTool[]): number {
  return estimateTextTokens(systemPrompt) + estimateToolsTokens(tools) + 512
}
