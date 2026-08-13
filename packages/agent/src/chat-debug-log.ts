/**
 * 对话调试日志 — 可选 JSONL 落盘，便于排查无回复与断流。
 * enabled=false 时早退；禁止写入 API Key / Authorization。
 * 单文件超限 rotate（`.1`）；目录有会话数/总字节软顶并 prune 最旧。
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

/** 单会话 JSONL 大小上限（超限 rename 为 `.1`，丢弃更旧的 `.1`） */
export const CHAT_DEBUG_MAX_FILE_BYTES = 12 * 1024 * 1024
/** 目录软顶：会话主文件（`*.jsonl`）数量 */
export const CHAT_DEBUG_MAX_SESSION_FILES = 40
/** 目录软顶：总字节（含 `*.jsonl` 与 `*.jsonl.1`） */
export const CHAT_DEBUG_MAX_DIR_BYTES = 200 * 1024 * 1024
/** 每 N 次 append 触发一次目录 prune */
const CHAT_DEBUG_DIR_PRUNE_EVERY = 32

export type ChatDebugLogLimits = {
  maxFileBytes: number
  maxSessionFiles: number
  maxDirBytes: number
  dirPruneEvery: number
}

const DEFAULT_LIMITS: ChatDebugLogLimits = {
  maxFileBytes: CHAT_DEBUG_MAX_FILE_BYTES,
  maxSessionFiles: CHAT_DEBUG_MAX_SESSION_FILES,
  maxDirBytes: CHAT_DEBUG_MAX_DIR_BYTES,
  dirPruneEvery: CHAT_DEBUG_DIR_PRUNE_EVERY,
}

let cachedEnabled: { value: boolean; at: number } | null = null
let limitsOverride: Partial<ChatDebugLogLimits> | null = null
let appendsSinceDirPrune = 0

function activeLimits(): ChatDebugLogLimits {
  return { ...DEFAULT_LIMITS, ...(limitsOverride ?? {}) }
}

export function truncateForChatDebug(value: string, maxChars = MAX_FIELD_CHARS): string {
  if (typeof value !== 'string') return ''
  if (value.length <= maxChars) return value
  return `${value.slice(0, maxChars)}…[+${value.length - maxChars}]`
}

export function resetChatDebugLogCacheForTests(): void {
  cachedEnabled = null
  limitsOverride = null
  appendsSinceDirPrune = 0
}

/** 测试用：缩小文件/目录上限以便验证 rotate / prune */
export function setChatDebugLogLimitsForTests(
  partial: Partial<ChatDebugLogLimits> | null,
): void {
  limitsOverride = partial
  appendsSinceDirPrune = 0
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

function isChatDebugPrimaryName(name: string): boolean {
  return name.endsWith('.jsonl') && !name.endsWith('.jsonl.1')
}

function isChatDebugRotatedName(name: string): boolean {
  return name.endsWith('.jsonl.1')
}

function sessionKeyFromName(name: string): string {
  if (isChatDebugRotatedName(name)) return name.slice(0, -2) // strip trailing `.1`
  return name
}

/**
 * 单文件超限：当前 → `.1`（覆盖更旧的 `.1`），再写新文件。
 * `upcomingBytes`：即将写入的字节数，用于在 append 前预判，避免越过上限。
 * 返回是否发生了 rotate。
 */
export function rotateChatDebugLogIfNeeded(
  filePath: string,
  maxFileBytes = activeLimits().maxFileBytes,
  upcomingBytes = 0,
): boolean {
  let size = 0
  try {
    size = fs.statSync(filePath).size
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    if (code === 'ENOENT') return false
    throw err
  }
  const projected = size + Math.max(0, upcomingBytes)
  // 空文件即使单行超限也继续写（无法再拆）；仅当已有内容且投影超限时 rotate
  if (size <= 0 || projected < maxFileBytes) return false
  const rotated = `${filePath}.1`
  try {
    fs.unlinkSync(rotated)
  } catch {
    // 无旧 `.1` 可忽略
  }
  fs.renameSync(filePath, rotated)
  return true
}

type SessionBundle = {
  key: string
  paths: string[]
  size: number
  mtimeMs: number
}

function listSessionBundles(dir: string): SessionBundle[] {
  let names: string[]
  try {
    names = fs.readdirSync(dir)
  } catch {
    return []
  }
  const byKey = new Map<string, SessionBundle>()
  for (const name of names) {
    if (!isChatDebugPrimaryName(name) && !isChatDebugRotatedName(name)) continue
    const full = path.join(dir, name)
    let st: fs.Stats
    try {
      st = fs.statSync(full)
    } catch {
      continue
    }
    if (!st.isFile()) continue
    const key = sessionKeyFromName(name)
    const existing = byKey.get(key)
    if (existing) {
      existing.paths.push(full)
      existing.size += st.size
      existing.mtimeMs = Math.max(existing.mtimeMs, st.mtimeMs)
    } else {
      byKey.set(key, {
        key,
        paths: [full],
        size: st.size,
        mtimeMs: st.mtimeMs,
      })
    }
  }
  return [...byKey.values()]
}

/**
 * 目录软顶：超出会话数或总字节时，按最旧 mtime prune 整会话（含 `.1`）。
 * `keepPath` 对应会话不会被删（当前正在写入）。
 */
export function pruneChatDebugLogDir(
  dir: string,
  opts?: {
    maxSessionFiles?: number
    maxDirBytes?: number
    keepPath?: string
  },
): number {
  const limits = activeLimits()
  const maxSessionFiles = opts?.maxSessionFiles ?? limits.maxSessionFiles
  const maxDirBytes = opts?.maxDirBytes ?? limits.maxDirBytes
  const keepKey = opts?.keepPath
    ? sessionKeyFromName(path.basename(opts.keepPath))
    : null

  const bundles = listSessionBundles(dir)
  if (!bundles.length) return 0

  let totalBytes = bundles.reduce((sum, b) => sum + b.size, 0)
  let primaryCount = bundles.filter(b =>
    b.paths.some(p => isChatDebugPrimaryName(path.basename(p))),
  ).length

  const over =
    () => primaryCount > maxSessionFiles || totalBytes > maxDirBytes
  if (!over()) return 0

  const ordered = [...bundles].sort((a, b) => a.mtimeMs - b.mtimeMs)
  let removed = 0
  for (const bundle of ordered) {
    if (!over()) break
    if (keepKey && bundle.key === keepKey) continue
    for (const p of bundle.paths) {
      try {
        fs.unlinkSync(p)
        removed += 1
      } catch {
        // 单文件删失败不影响其余
      }
    }
    totalBytes -= bundle.size
    if (bundle.paths.some(p => isChatDebugPrimaryName(path.basename(p)))) {
      primaryCount -= 1
    }
  }
  return removed
}

function appendJsonl(sessionId: string, event: Record<string, unknown>): void {
  if (!sessionId || !isChatDebugLoggingEnabled()) return
  try {
    const dir = resolveChatDebugLogDir()
    fs.mkdirSync(dir, { recursive: true })
    const filePath = resolveChatDebugLogPath(sessionId)
    const limits = activeLimits()
    const line = `${JSON.stringify({
      ts: new Date().toISOString(),
      sessionId,
      ...event,
    })}\n`
    const upcoming = Buffer.byteLength(line, 'utf8')
    rotateChatDebugLogIfNeeded(filePath, limits.maxFileBytes, upcoming)
    fs.appendFileSync(filePath, line, 'utf8')
    appendsSinceDirPrune += 1
    if (appendsSinceDirPrune >= limits.dirPruneEvery) {
      appendsSinceDirPrune = 0
      pruneChatDebugLogDir(dir, {
        maxSessionFiles: limits.maxSessionFiles,
        maxDirBytes: limits.maxDirBytes,
        keepPath: filePath,
      })
    }
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
