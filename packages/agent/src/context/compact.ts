import { chatMessageContentToText } from '../content-parts.js'
import type { ChatMessage, LlmProvider } from '../llm/provider.js'
import { repairToolCallSequences, tailMessagesForLlm } from '../llm/messages.js'
import {
  type ContextBudget,
  resolveContextBudget,
  usageRatio,
} from '../llm/model-context.js'
import { resolveModelContextTokensAsync } from '../llm/models-dev-context.js'
import {
  formatSessionMemoryForPrompt,
  parseSessionMemoryFromModelText,
  sessionMemoryAsUserBlock,
  STRUCTURED_COMPACT_SYSTEM,
  type SessionMemory,
} from './session-memory.js'
import {
  installMemoryProjection,
  installMicroProjection,
  projectionValid,
  modelVisibleFromProjection,
  type ContextProjection,
} from './projection.js'
import {
  estimateMessageTokens,
  estimateSystemToolsReserve,
  estimateTextTokens,
} from './token-estimate.js'
import type { OpenAiTool } from '../tools.js'
import { resolveTurnUsage } from '../llm/usage-estimate.js'
import type { TokenUsage } from '../llm/token-usage.js'

export const CONTEXT_COMPACT_HINT =
  '已整理较早对话要点，后续仍按你的目标继续。'

export type CompactLevel = 'micro' | 'structured' | 'overflow_retry'

export interface CompactResult {
  level: CompactLevel
  message: string
  usageRatio: number
  contextTokens: number
  changed: boolean
}

export interface SessionCompactState {
  messages: ChatMessage[]
  sessionMemory?: SessionMemory | null
  contextProjection?: ContextProjection | null
}

/** tool 可见摘要上限（P2：放宽，避免 480 字永久撕毁） */
const MICRO_TOOL_MAX = 2_400
export const KEEP_RECENT_DEFAULT = 16
const KEEP_RECENT_AGGRESSIVE = 8

function summarizeToolContent(content: string, toolName?: string): string {
  const raw = content.trim()
  if (raw.length <= MICRO_TOOL_MAX) return raw
  try {
    const parsed = JSON.parse(raw) as unknown
    if (parsed && typeof parsed === 'object') {
      const obj = parsed as Record<string, unknown>
      if (typeof obj.error === 'string') {
        return JSON.stringify({ error: obj.error.slice(0, 200), _compacted: true })
      }
      const keys = Object.keys(obj).slice(0, 8)
      const slim: Record<string, unknown> = { _compacted: true, tool: toolName ?? null }
      for (const k of keys) {
        const v = obj[k]
        if (v == null || typeof v === 'number' || typeof v === 'boolean') {
          slim[k] = v
        } else if (typeof v === 'string') {
          slim[k] = v.length > 120 ? `${v.slice(0, 120)}…` : v
        } else if (Array.isArray(v)) {
          slim[k] = `[array:${v.length}]`
        } else {
          slim[k] = '[object]'
        }
      }
      return JSON.stringify(slim)
    }
  } catch {
    /* plain text */
  }
  return `${raw.slice(0, MICRO_TOOL_MAX)}…[compacted]`
}

/** 压缩较早的 tool 消息体；保留近端 keepRecent 条成组消息不动 */
export function microcompactMessages(
  messages: ChatMessage[],
  keepRecent = KEEP_RECENT_DEFAULT,
): { messages: ChatMessage[]; changed: boolean } {
  const repaired = repairToolCallSequences(messages)
  if (repaired.length <= keepRecent) {
    return { messages: repaired, changed: false }
  }
  const cut = repaired.length - keepRecent
  let changed = false
  const out = repaired.map((m, i) => {
    if (i >= cut) return m
    if (m.role !== 'tool' || !m.content) return m
    const next = summarizeToolContent(String(m.content), m.name)
    if (next !== m.content) {
      changed = true
      return { ...m, content: next }
    }
    return m
  })
  return { messages: out, changed }
}

function historyForSummarizer(messages: ChatMessage[], maxChars = 48_000): string {
  const lines: string[] = []
  let used = 0
  for (const m of messages) {
    const role = m.role
    let body = ''
    if (m.content) body = String(m.content)
    if (m.tool_calls?.length) {
      body += `\n[tool_calls:${m.tool_calls.map(t => t.function.name).join(',')}]`
    }
    if (role === 'tool') body = `[tool ${m.name ?? ''}]\n${body}`
    const chunk = `${role}: ${body.slice(0, 2_000)}`
    if (used + chunk.length > maxChars) break
    lines.push(chunk)
    used += chunk.length
  }
  return lines.join('\n\n')
}

export async function structuredCompact(
  llm: LlmProvider,
  state: SessionCompactState,
  opts?: { keepRecent?: number; signal?: AbortSignal },
): Promise<{ state: SessionCompactState; changed: boolean; usage?: TokenUsage; usageEstimated?: boolean }> {
  const keepRecent = opts?.keepRecent ?? KEEP_RECENT_DEFAULT
  const repaired = repairToolCallSequences(state.messages)
  if (repaired.length <= keepRecent + 2) {
    return {
      state: {
        messages: repaired,
        sessionMemory: state.sessionMemory,
        contextProjection: state.contextProjection,
      },
      changed: false,
    }
  }

  const cut = repaired.length - keepRecent
  const older = repaired.slice(0, cut)
  const transcript = historyForSummarizer(older)
  if (!transcript.trim()) {
    return {
      state: {
        messages: repaired,
        sessionMemory: state.sessionMemory,
        contextProjection: state.contextProjection,
      },
      changed: false,
    }
  }

  const prevMemory = formatSessionMemoryForPrompt(state.sessionMemory)
  const userContent = [
    prevMemory ? `【已有工作记忆】\n${prevMemory}` : '',
    '【待压缩的较早对话】',
    transcript,
  ].filter(Boolean).join('\n\n')

  const turn = await llm.chat(
    [
      { role: 'system', content: STRUCTURED_COMPACT_SYSTEM },
      { role: 'user', content: userContent },
    ],
    undefined,
    opts?.signal,
  )
  const compactPrompt = [
    { role: 'system' as const, content: STRUCTURED_COMPACT_SYSTEM },
    { role: 'user' as const, content: userContent },
  ]
  const compactUsage = resolveTurnUsage(turn, compactPrompt)

  if (turn.finishReason === 'error' || !chatMessageContentToText(turn.message.content).trim()) {
    // 压缩失败时不永久撕毁 tool 正文；由 ensureContextBudget 对 modelView 做 micro 投影
    return {
      state: {
        messages: repaired,
        sessionMemory: state.sessionMemory,
        contextProjection: state.contextProjection,
      },
      changed: false,
    }
  }

  const memory = parseSessionMemoryFromModelText(
    chatMessageContentToText(turn.message.content),
    state.sessionMemory,
    cut,
  )
  // 持久化保留全量 messages；写 memory + projection（coveredCount=cut），不删 canonical tool 正文
  const projection = installMemoryProjection(
    repaired,
    keepRecent,
    state.contextProjection,
  )
  return {
    state: {
      messages: repaired,
      sessionMemory: memory,
      contextProjection: projection ?? state.contextProjection ?? null,
    },
    changed: true,
    usage: compactUsage.usage,
    usageEstimated: compactUsage.estimated,
  }
}

export function assembleModelView(opts: {
  systemPrompt: string
  sessionMemory?: SessionMemory | null
  messages: ChatMessage[]
  contextPrefix?: ChatMessage[]
  keepRecent?: number
  contextProjection?: ContextProjection | null
}): ChatMessage[] {
  const keepRecent = opts.keepRecent ?? KEEP_RECENT_DEFAULT
  if (opts.contextProjection && projectionValid(opts.contextProjection, opts.messages)) {
    return modelVisibleFromProjection({
      systemPrompt: opts.systemPrompt,
      sessionMemory: opts.sessionMemory,
      projection: opts.contextProjection,
      canonical: opts.messages,
      contextPrefix: opts.contextPrefix,
      keepRecent,
    })
  }
  const out: ChatMessage[] = [{ role: 'system', content: opts.systemPrompt }]
  const memoryText = sessionMemoryAsUserBlock(opts.sessionMemory)
  if (memoryText) {
    out.push({ role: 'user', content: memoryText })
  }
  if (opts.contextPrefix?.length) {
    out.push(...opts.contextPrefix)
  }
  out.push(...tailMessagesForLlm(opts.messages, keepRecent))
  return out
}

export function estimateModelViewTokens(messages: ChatMessage[]): number {
  return estimateMessageTokens(messages)
}

export async function buildBudgetForModel(
  modelId: string,
  systemPrompt: string,
  tools?: OpenAiTool[],
  providerId?: string,
): Promise<ContextBudget> {
  const contextTokens = await resolveModelContextTokensAsync(modelId, providerId)
  const reserve = estimateSystemToolsReserve(systemPrompt, tools)
  return resolveContextBudget(contextTokens, reserve)
}

export async function ensureContextBudget(opts: {
  modelId: string
  providerId?: string
  systemPrompt: string
  tools?: OpenAiTool[]
  state: SessionCompactState
  contextPrefix?: ChatMessage[]
  llm: LlmProvider | null
  signal?: AbortSignal
  aggressive?: boolean
}): Promise<{
  state: SessionCompactState
  results: CompactResult[]
  modelView: ChatMessage[]
  compactUsage?: TokenUsage
  compactUsageEstimated?: boolean
}> {
  const results: CompactResult[] = []
  let state: SessionCompactState = {
    messages: repairToolCallSequences(opts.state.messages),
    sessionMemory: opts.state.sessionMemory ?? null,
    contextProjection: opts.state.contextProjection ?? null,
  }
  const keepRecent = opts.aggressive ? KEEP_RECENT_AGGRESSIVE : KEEP_RECENT_DEFAULT
  const budget = await buildBudgetForModel(
    opts.modelId,
    opts.systemPrompt,
    opts.tools,
    opts.providerId,
  )

  const buildView = () => assembleModelView({
    systemPrompt: opts.systemPrompt,
    sessionMemory: state.sessionMemory,
    messages: state.messages,
    contextPrefix: opts.contextPrefix,
    keepRecent,
    contextProjection: state.contextProjection,
  })

  let view = buildView()
  // history-ish: exclude primary system from usage vs historyBudget
  let used = Math.max(0, estimateModelViewTokens(view) - estimateTextTokens(opts.systemPrompt))

  if (used < budget.softLimit && !opts.aggressive) {
    return { state, results, modelView: view }
  }

  // soft / aggressive → micro（只写投影，不改写 canonical messages）
  {
    const micro = microcompactMessages(state.messages, keepRecent)
    if (micro.changed) {
      const projection = installMicroProjection(
        state.messages,
        micro.messages,
        keepRecent,
        state.contextProjection,
      )
      if (projection) {
        state = { ...state, contextProjection: projection }
      }
      view = buildView()
      used = Math.max(0, estimateModelViewTokens(view) - estimateTextTokens(opts.systemPrompt))
      results.push({
        level: opts.aggressive ? 'overflow_retry' : 'micro',
        message: CONTEXT_COMPACT_HINT,
        usageRatio: usageRatio(used, budget),
        contextTokens: budget.contextTokens,
        changed: true,
      })
    }
  }

  if (used < budget.hardLimit && !opts.aggressive) {
    return { state, results, modelView: view }
  }

  if (!opts.llm) {
    // 无 LLM：进一步缩短近端投影，仍不撕毁持久化正文
    const micro2 = microcompactMessages(state.messages, KEEP_RECENT_AGGRESSIVE)
    const projection = installMicroProjection(
      state.messages,
      micro2.messages,
      KEEP_RECENT_AGGRESSIVE,
      state.contextProjection,
    )
    if (projection) {
      state = { ...state, contextProjection: projection }
    }
    view = assembleModelView({
      systemPrompt: opts.systemPrompt,
      sessionMemory: state.sessionMemory,
      messages: state.messages,
      contextPrefix: opts.contextPrefix,
      keepRecent: KEEP_RECENT_AGGRESSIVE,
      contextProjection: state.contextProjection,
    })
    used = Math.max(0, estimateModelViewTokens(view) - estimateTextTokens(opts.systemPrompt))
    if (micro2.changed || projection) {
      results.push({
        level: 'micro',
        message: CONTEXT_COMPACT_HINT,
        usageRatio: usageRatio(used, budget),
        contextTokens: budget.contextTokens,
        changed: true,
      })
    }
    return { state, results, modelView: view }
  }

  const structured = await structuredCompact(opts.llm, state, {
    keepRecent,
    signal: opts.signal,
  })
  state = structured.state
  view = buildView()
  used = Math.max(0, estimateModelViewTokens(view) - estimateTextTokens(opts.systemPrompt))
  if (structured.changed) {
    results.push({
      level: opts.aggressive ? 'overflow_retry' : 'structured',
      message: CONTEXT_COMPACT_HINT,
      usageRatio: usageRatio(used, budget),
      contextTokens: budget.contextTokens,
      changed: true,
    })
  }

  return {
    state,
    results,
    modelView: view,
    compactUsage: structured.usage,
    compactUsageEstimated: structured.usageEstimated,
  }
}

export function isContextOverflowError(error: string | undefined, content?: string | null): boolean {
  const text = `${error ?? ''} ${content ?? ''}`.toLowerCase()
  if (!text.trim()) return false
  return (
    text.includes('context_length_exceeded')
    || text.includes('context length')
    || text.includes('maximum context')
    || text.includes('too many tokens')
    || text.includes('token limit')
    || text.includes('context window')
    || text.includes('exceeds the model')
    || text.includes('prompt is too long')
    || text.includes('max_tokens') && text.includes('exceed')
  )
}
