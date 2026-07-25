import type { ChatMessage, LlmTurn } from './provider.js'
import { estimateMessageTokens, estimateTextTokens } from '../context/token-estimate.js'
import { chatMessageContentToText } from '../content-parts.js'
import { emptyTokenUsage, mergeTokenUsage, type TokenUsage } from './token-usage.js'

export function estimateUsageFromMessages(messages: ChatMessage[]): TokenUsage {
  const promptTokens = estimateMessageTokens(messages)
  return {
    promptTokens,
    completionTokens: 0,
    totalTokens: promptTokens,
  }
}

export function estimateUsageFromTurn(
  turn: LlmTurn,
  promptMessages: ChatMessage[],
): TokenUsage {
  const promptTokens = estimateMessageTokens(promptMessages)
  const content = chatMessageContentToText(turn.message.content)
  const completionTokens = content ? estimateTextTokens(content) : 0
  return {
    promptTokens,
    completionTokens,
    totalTokens: promptTokens + completionTokens,
  }
}

export function resolveTurnUsage(
  turn: LlmTurn,
  promptMessages: ChatMessage[],
): { usage: TokenUsage; estimated: boolean } {
  if (turn.usage) {
    return { usage: turn.usage, estimated: false }
  }
  return { usage: estimateUsageFromTurn(turn, promptMessages), estimated: true }
}

export function accumulateChatUsage(
  current: { usage: TokenUsage; estimated: boolean },
  next: { usage: TokenUsage; estimated: boolean },
): { usage: TokenUsage; estimated: boolean } {
  return {
    usage: mergeTokenUsage(current.usage, next.usage),
    estimated: current.estimated || next.estimated,
  }
}

export function createEmptyChatUsage(): { usage: TokenUsage; estimated: boolean } {
  return { usage: emptyTokenUsage(), estimated: false }
}
