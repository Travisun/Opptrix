/**
 * 对话调试日志 — 可选 JSONL 落盘，便于排查无回复与断流。
 * enabled=false 时早退；禁止写入 API Key / Authorization。
 */
import fs from 'node:fs'
import path from 'node:path'
import {
  CHAT_DEBUG_LOGGING_KEY,
  parseChatDebugLoggingSettings,
  resolveUserDataRoot,
} from '@opptrix/shared'
import { getUserDataStore } from '@opptrix/user-store'

const PREF_NS = 'preference'
const MAX_FIELD_CHARS = 4096
const ENABLED_CACHE_TTL_MS = 5_000
/** 每 N 个 data 行采 1 个样本（含首条） */
export const CHAT_DEBUG_SSE_SAMPLE_EVERY_N = 10
/** 单轮最多保留的 SSE 样本数 */
export const CHAT_DEBUG_SSE_MAX_SAMPLES = 20

let cachedEnabled: { value: boolean; at: number } | null = null

export function truncateForChatDebug(value: string, maxChars = MAX_FIELD_CHARS): string {
  if (typeof value !== 'string') return ''
  if (value.length <= maxChars) return value
  return `${value.slice(0, maxChars)}…[+${value.length - maxChars}]`
}

export function resetChatDebugLogCacheForTests(): void {
  cachedEnabled = null
}

export function isChatDebugLoggingEnabled(): boolean {
  const now = Date.now()
  if (cachedEnabled && now - cachedEnabled.at < ENABLED_CACHE_TTL_MS) {
    return cachedEnabled.value
  }
  let enabled = false
  try {
    const raw = getUserDataStore().getDocument(PREF_NS, CHAT_DEBUG_LOGGING_KEY)
    enabled = parseChatDebugLoggingSettings(raw).enabled
  } catch {
    enabled = false
  }
  cachedEnabled = { value: enabled, at: now }
  return enabled
}

export function resolveChatDebugLogDir(): string {
  return path.join(resolveUserDataRoot(), 'logs', 'chat-debug')
}

function safeSessionFileName(sessionId: string): string {
  const cleaned = sessionId.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 128)
  return cleaned || 'unknown'
}

export function resolveChatDebugLogPath(sessionId: string): string {
  return path.join(resolveChatDebugLogDir(), `${safeSessionFileName(sessionId)}.jsonl`)
}

function appendJsonl(sessionId: string, event: Record<string, unknown>): void {
  if (!sessionId || !isChatDebugLoggingEnabled()) return
  try {
    const dir = resolveChatDebugLogDir()
    fs.mkdirSync(dir, { recursive: true })
    const line = JSON.stringify({
      ts: new Date().toISOString(),
      sessionId,
      ...event,
    })
    fs.appendFileSync(resolveChatDebugLogPath(sessionId), `${line}\n`, 'utf8')
  } catch {
    // 日志失败不影响对话主路径
  }
}

export type ChatDebugCacheWarmth = 'warm' | 'cold' | 'unknown'

export function logChatDebugRoundStart(
  sessionId: string,
  payload: {
    round: number
    model: string
    promptCacheKey?: string
    cacheWarmth?: ChatDebugCacheWarmth
  },
): void {
  appendJsonl(sessionId, {
    event: 'round_start',
    round: payload.round,
    model: payload.model,
    ...(payload.promptCacheKey ? { promptCacheKey: payload.promptCacheKey } : {}),
    cacheWarmth: payload.cacheWarmth ?? 'unknown',
  })
}

export function logChatDebugSseChunkSample(
  sessionId: string,
  payload: { sampleIndex: number; truncatedPayload: string; contentLenSoFar: number },
): void {
  appendJsonl(sessionId, {
    event: 'sse_chunk_sample',
    sampleIndex: payload.sampleIndex,
    truncatedPayload: truncateForChatDebug(payload.truncatedPayload),
    contentLenSoFar: payload.contentLenSoFar,
  })
}

export function logChatDebugRoundEnd(
  sessionId: string,
  payload: {
    finishReason: string
    contentLen: number
    toolCallNames?: string[]
    usage?: {
      promptTokens?: number
      completionTokens?: number
      totalTokens?: number
      cachedPromptTokens?: number
    }
    promptCacheKey?: string
    cacheWarmth?: ChatDebugCacheWarmth
  },
): void {
  appendJsonl(sessionId, {
    event: 'round_end',
    finishReason: payload.finishReason,
    contentLen: payload.contentLen,
    ...(payload.toolCallNames?.length ? { toolCallNames: payload.toolCallNames } : {}),
    ...(payload.usage ? { usage: payload.usage } : {}),
    ...(payload.promptCacheKey ? { promptCacheKey: payload.promptCacheKey } : {}),
    cacheWarmth: payload.cacheWarmth ?? 'unknown',
  })
}

export function logChatDebugEmptyReply(
  sessionId: string,
  payload?: { round?: number },
): void {
  appendJsonl(sessionId, {
    event: 'empty_reply',
    ...(payload?.round != null ? { round: payload.round } : {}),
  })
}

export function logChatDebugAbort(
  sessionId: string,
  payload?: { reason?: string },
): void {
  appendJsonl(sessionId, {
    event: 'abort',
    ...(payload?.reason ? { reason: payload.reason } : {}),
  })
}

export function logChatDebugHttpError(
  sessionId: string,
  payload: { status: number; bodyTruncated: string },
): void {
  appendJsonl(sessionId, {
    event: 'http_error',
    status: payload.status,
    bodyTruncated: truncateForChatDebug(payload.bodyTruncated),
  })
}

/** SSE 采样器：enabled=false 时 next() 几乎零开销 */
export function createSseChunkSampler(sessionId: string | undefined): {
  onDataPayload: (payload: string, contentLenSoFar: number) => void
} {
  if (!sessionId || !isChatDebugLoggingEnabled()) {
    return { onDataPayload: () => {} }
  }
  let chunkIndex = 0
  let sampleIndex = 0
  return {
    onDataPayload(payload: string, contentLenSoFar: number) {
      chunkIndex += 1
      if (sampleIndex >= CHAT_DEBUG_SSE_MAX_SAMPLES) return
      if (chunkIndex !== 1 && chunkIndex % CHAT_DEBUG_SSE_SAMPLE_EVERY_N !== 0) return
      logChatDebugSseChunkSample(sessionId, {
        sampleIndex,
        truncatedPayload: payload,
        contentLenSoFar,
      })
      sampleIndex += 1
    },
  }
}
