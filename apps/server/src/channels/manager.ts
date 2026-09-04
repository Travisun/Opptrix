/**
 * Chat channels manager — connects external messaging platforms to the SAME
 * AgentEngine chat path the web UI uses (identical model/tools/session
 * persistence). Handles credential storage (owner-scoped user-store
 * preference), per-chat session mapping (persisted), inbound rate limiting,
 * busy guarding, and streaming-simulation edits.
 *
 * Security model:
 *   - Config endpoints: owner-authenticated (platform prefix, auth hook).
 *   - Webhook endpoints: PUBLIC by nature; authenticated per-channel by the
 *     adapter's verifyWebhook (signature/secret). Never logged with creds.
 *   - Bot turns run `unattended: true` (ask_user/secret prompts are removed —
 *     a channel cannot render them), matching the design-doc bot semantics.
 */

import { getUserPreference, setUserPreference } from '../user-preferences.js'
import type { ChatProgressEvent } from '@opptrix/agent'
import {
  channelAdapters,
  rememberQqMessageId,
} from './adapters.js'
import type {
  ChannelAdapter,
  ChannelCredentials,
  ChannelKind,
  ChannelTransport,
} from './types.js'

const PREF_KEY = 'chat_channels'
const MIN_CHAT_GAP_MS = 1200
const EDIT_THROTTLE_MS = 1500
const MAX_CHUNKS = 4

/** Platform message size caps per kind (manager splits beyond these). */
const CHUNK_MAX: Record<ChannelKind, number> = {
  telegram: 4096,
  slack: 40_000,
  dingtalk: 2000,
  feishu: 4000,
  wecom: 2000,
  qq: 1500,
}

export type ChannelConfig = {
  id: string
  kind: ChannelKind
  name: string
  enabled: boolean
  creds: ChannelCredentials
  /** Optional model ref override for this channel's turns. */
  model?: string
  createdAt: string
}

type ChannelsPref = {
  channels: ChannelConfig[]
  sessions: Record<string, string> // "<id>" chatKey → sessionId
}

export type ChannelSummary = Omit<ChannelConfig, 'creds'> & {
  credsConfigured: string[]
}

function emptyPref(): ChannelsPref {
  return { channels: [], sessions: {} }
}

/** Structural chat contract (AgentEngine.chat) — keeps the manager decoupled. */
export type ChatTurnFn = (
  sessionId: string,
  message: string,
  modelRef?: string,
  progress?: {
    onProgress?: (event: ChatProgressEvent) => void
    signal?: AbortSignal
    unattended?: boolean
    wakeResume?: boolean
  },
  attachmentIds?: string[],
) => Promise<{ reply: string; toolsUsed?: string[]; sessionId: string; title?: string }>

export type CreateChannelManagerOptions = {
  chat: ChatTurnFn
  createSession: () => Promise<{ id: string }>
  transport?: ChannelTransport
  /** Poll-tick hook for tests. */
  now?: () => number
}

export type InboundResult =
  | { accepted: false; reason: 'unknown_channel' | 'disabled' | 'unverified' | 'rate_limited'; message?: string }
  | { accepted: true; sessionId: string; reply: string }

export class ChannelManager {
  private chat: ChatTurnFn
  private createSession: () => Promise<{ id: string }>
  private transport: ChannelTransport
  private now: () => number
  /** chatKey → last accepted turn ms (rate limit). */
  private lastTurnAt = new Map<string, number>()
  /** chatKey → in-flight marker (busy guard). */
  private inFlight = new Set<string>()
  /** Test hook — awaited inbound turns for deterministic assertions. */
  private pendingTurns: Promise<unknown>[] = []

  constructor(opts: CreateChannelManagerOptions) {
    this.chat = opts.chat
    this.createSession = opts.createSession
    this.transport =
      opts.transport ??
      (async (url, init) => {
        const resp = await fetch(url, init as never)
        return {
          ok: resp.ok,
          status: resp.status,
          headers: Object.fromEntries(resp.headers.entries()),
          text: () => resp.text(),
          json: () => resp.json(),
        }
      })
    this.now = opts.now ?? (() => Date.now())
  }

  // ── persistence ────────────────────────────────────────────────────────────

  private load(): ChannelsPref {
    try {
      const raw = getUserPreference<Partial<ChannelsPref> | null>(PREF_KEY, null)
      if (!raw) return emptyPref()
      return {
        channels: Array.isArray(raw.channels) ? raw.channels : [],
        sessions: raw.sessions && typeof raw.sessions === 'object' ? raw.sessions : {},
      }
    } catch {
      return emptyPref()
    }
  }

  private save(pref: ChannelsPref): void {
    setUserPreference(PREF_KEY, pref)
  }

  // ── config surface (owner) ────────────────────────────────────────────────

  list(): ChannelSummary[] {
    return this.load().channels.map(({ creds, ...rest }) => ({
      ...rest,
      credsConfigured: Object.keys(creds).filter((k) => (creds[k] ?? '').length > 0),
    }))
  }

  saveConfig(input: {
    id?: string
    kind: ChannelKind
    name?: string
    enabled?: boolean
    creds: ChannelCredentials
    model?: string
  }): { ok: true; id: string } | { ok: false; error: string } {
    const adapter: ChannelAdapter | undefined = channelAdapters[input.kind]
    if (!adapter) return { ok: false, error: `unknown channel kind: ${input.kind}` }
    const pref = this.load()
    let id = input.id ?? ''
    const existing = id ? pref.channels.find((c) => c.id === id) : undefined
    if (input.id && !existing) return { ok: false, error: `channel not found: ${input.id}` }
    if (!existing) {
      id = `ch_${Math.random().toString(36).slice(2, 10)}`
    }
    const mergedCreds: ChannelCredentials = { ...(existing?.creds ?? {}), ...input.creds }
    const config: ChannelConfig = {
      id,
      kind: input.kind,
      name: input.name ?? existing?.name ?? input.kind,
      enabled: input.enabled ?? existing?.enabled ?? true,
      creds: mergedCreds,
      ...(input.model ? { model: input.model } : existing?.model ? { model: existing.model } : {}),
      createdAt: existing?.createdAt ?? new Date().toISOString(),
    }
    if (existing) {
      const idx = pref.channels.indexOf(existing)
      pref.channels[idx] = config
    } else {
      pref.channels.push(config)
    }
    this.save(pref)
    return { ok: true, id }
  }

  removeConfig(id: string): boolean {
    const pref = this.load()
    const idx = pref.channels.findIndex((c) => c.id === id)
    if (idx < 0) return false
    pref.channels.splice(idx, 1)
    this.save(pref)
    return true
  }

  setEnabled(id: string, enabled: boolean): boolean {
    const pref = this.load()
    const c = pref.channels.find((x) => x.id === id)
    if (!c) return false
    c.enabled = enabled
    this.save(pref)
    return true
  }

  // ── webhook surface (public, per-channel verified) ────────────────────────

  async handleWebhook(
    channelId: string,
    req: { method: string; headers: Record<string, string>; rawBody: string; query: Record<string, string> },
  ): Promise<
    | { status: 200; body: unknown; handled: true }
    | { status: 401 | 403 | 404; body: { error: string }; handled: false }
  > {
    const pref = this.load()
    const config = pref.channels.find((c) => c.id === channelId)
    if (!config) return { status: 404, body: { error: 'unknown channel' }, handled: false }
    if (!config.enabled) return { status: 403, body: { error: 'channel disabled' }, handled: false }
    const adapter = channelAdapters[config.kind]
    if (!adapter.verifyWebhook(config.creds, req)) {
      return { status: 401, body: { error: 'webhook verification failed' }, handled: false }
    }
    const parsed = adapter.parseInbound(config.creds, req)
    if (parsed.challengeResponse !== undefined) {
      return { status: 200, body: parsed.challengeResponse, handled: true }
    }
    for (const msg of parsed.messages) {
      if (config.kind === 'qq') rememberQqMessageId(msg.channelChatId, msg.passiveMessageId)
      // Fire-and-forget per message; webhook ACKs immediately (platforms time out fast).
      const turn = this.handleInbound(config, msg).catch(() => {
        // soft: inbound turn failures never break the webhook
      })
      this.pendingTurns.push(turn)
    }
    return { status: 200, body: { ok: true }, handled: true }
  }

  // ── inbound pipeline ──────────────────────────────────────────────────────

  /** Test hook — resolves when all dispatched inbound turns settle. */
  async drainInbound(): Promise<void> {
    await Promise.allSettled([...this.pendingTurns])
    this.pendingTurns = []
  }

  async handleInbound(config: ChannelConfig, msg: import('./types.js').ChannelInbound): Promise<InboundResult> {
    const adapter = channelAdapters[config.kind]
    const chatKey = `${config.id}:${msg.channelChatId}`

    const now = this.now()
    const last = this.lastTurnAt.get(chatKey) ?? 0
    if (now - last < MIN_CHAT_GAP_MS) {
      // Friendly notice instead of a silent drop. Awaited: handleInbound is
      // itself tracked in pendingTurns (test determinism), and the notice is
      // a single small POST.
      await this.deliver(adapter, config, msg, '⏳ 消息发送太快，请稍候再试。').catch(() => {})
      return { accepted: false, reason: 'rate_limited' }
    }
    if (this.inFlight.has(chatKey)) {
      await this.deliver(
        adapter,
        config,
        msg,
        '⏳ 上一条消息仍在处理中，请稍候再发送。',
      ).catch(() => {})
      return { accepted: false, reason: 'rate_limited' }
    }
    this.lastTurnAt.set(chatKey, now)
    this.inFlight.add(chatKey)

    try {
      const pref = this.load()
      const sessionId = pref.sessions[chatKey] ?? (await this.createSession()).id
      if (!pref.sessions[chatKey]) {
        pref.sessions[chatKey] = sessionId
        this.save(pref)
      }

      // Streaming-simulation handle: placeholder → throttled stage edits → final edit.
      let handle: import('./types.js').OutboundHandle | null = null
      let lastEditAt = 0
      const canStream = adapter.supportsEdit && typeof adapter.edit === 'function'

      const onProgress = (event: ChatProgressEvent): void => {
        if (!canStream) return
        const now2 = Date.now()
        if (now2 - lastEditAt < EDIT_THROTTLE_MS) return
        const label =
          event.type === 'thinking'
            ? event.label
            : event.type === 'tool_start'
              ? `正在执行：${event.step.label ?? event.step.tool}`
              : null
        if (!label) return
        lastEditAt = now2
        void (async () => {
          try {
            if (!handle) {
              handle = await adapter.send(config.creds, msg.replyWebhook ?? msg.channelChatId, `⏳ ${label}`, this.transport)
            } else {
              await adapter.edit?.(config.creds, handle, `⏳ ${label}`, this.transport)
            }
          } catch {
            // progress edits are best-effort
          }
        })()
      }

      const result = await this.chat(sessionId, msg.text, config.model, {
        onProgress,
        unattended: true,
      })

      const reply = result.reply?.trim() || '（无回复）'
      await this.deliver(adapter, config, msg, reply, handle)

      return { accepted: true, sessionId, reply }
    } catch (err) {
      const message = `⚠️ 处理失败：${err instanceof Error ? err.message : String(err)}`
      await this.deliver(adapter, config, msg, message).catch(() => {})
      return { accepted: true, sessionId: '', reply: message }
    } finally {
      this.inFlight.delete(chatKey)
    }
  }

  private async deliver(
    adapter: ChannelAdapter,
    config: ChannelConfig,
    msg: import('./types.js').ChannelInbound,
    text: string,
    streamHandle?: import('./types.js').OutboundHandle | null,
  ): Promise<void> {
    const max = CHUNK_MAX[config.kind]
    const chunks = splitChunks(text, max, MAX_CHUNKS)
    const target = msg.replyWebhook ?? msg.channelChatId
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i]
      if (i === 0 && streamHandle && adapter.supportsEdit && adapter.edit) {
        await adapter.edit(config.creds, streamHandle, chunk, this.transport)
      } else {
        await adapter.send(config.creds, target, chunk, this.transport)
      }
    }
  }
}

function splitChunks(text: string, max: number, maxChunks: number): string[] {
  if (text.length <= max) return [text]
  const chunks: string[] = []
  let rest = text
  while (rest.length > 0 && chunks.length < maxChunks) {
    chunks.push(rest.slice(0, max))
    rest = rest.slice(max)
  }
  if (rest.length > 0) chunks.push(rest.slice(0, max) + '\n…（内容过长已截断）')
  return chunks
}
