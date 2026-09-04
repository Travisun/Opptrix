/**
 * Chat channels — adapter contract (Phase B).
 *
 * A channel connects an external messaging platform (Telegram, Slack,
 * DingTalk, Feishu, WeCom, QQ) to the SAME AgentEngine chat path the web UI
 * uses — identical model, tools, and session persistence. Streaming parity:
 * channels with an edit API receive progressive stage updates (thinking/tool
 * labels, throttled) plus the final reply edited in place; channels without
 * edit support receive the final reply only.
 *
 * All adapters are transport-injectable (no SDK dependencies) so the full
 * normalize/verify/send surface is unit-testable against local mocks.
 */

export type ChannelKind =
  | 'telegram'
  | 'slack'
  | 'dingtalk'
  | 'feishu'
  | 'wecom'
  | 'qq'

export const CHANNEL_KINDS: readonly ChannelKind[] = [
  'telegram',
  'slack',
  'dingtalk',
  'feishu',
  'wecom',
  'qq',
]

/** Provider credentials / config, stored owner-side (never logged). */
export type ChannelCredentials = Record<string, string>

export type ChannelWebhookRequest = {
  method: string
  headers: Record<string, string>
  /** Raw body text (signature verification needs the exact bytes). */
  rawBody: string
  query: Record<string, string>
}

export type ChannelInbound = {
  /** External end-user id (platform-stable). */
  channelUserId: string
  /** Conversation id on the platform (chat / group / open id). */
  channelChatId: string
  text: string
  /**
   * Reply route for platforms that answer via the inbound webhook itself
   * (DingTalk sessionWebhook, WeCom smart-bot inline reply). When set, the
   * adapter ignores chatId and posts here.
   */
  replyWebhook?: string
  /** QQ 被动回复：原消息 id（时效内回复必须携带）。 */
  passiveMessageId?: string
}

export type OutboundHandle = {
  chatId: string
  messageId?: string
  /** For reply-webhook platforms: the URL to answer. */
  replyWebhook?: string
}

export type ChannelTransport = (
  url: string,
  init?: {
    method?: string
    headers?: Record<string, string>
    body?: string
    signal?: AbortSignal
  },
) => Promise<{
  ok: boolean
  status: number
  headers: Record<string, string>
  text: () => Promise<string>
  json: () => Promise<unknown>
}>

export interface ChannelAdapter {
  readonly kind: ChannelKind
  /** True when the platform supports editing a delivered message (stream sim). */
  readonly supportsEdit: boolean
  /** Verify an inbound webhook request using the channel's stored creds. */
  verifyWebhook(creds: ChannelCredentials, req: ChannelWebhookRequest): boolean
  /**
   * Parse the provider callback payload. Returns normalized messages; may be
   * empty (pings, non-message events). May return a `challengeResponse` for
   * platforms with a URL-verification handshake (Slack/Feishu).
   */
  parseInbound(
    creds: ChannelCredentials,
    req: ChannelWebhookRequest,
  ): {
    messages: ChannelInbound[]
    challengeResponse?: unknown
  }
  /** Deliver a text message. chatId may be a reply-webhook for some kinds. */
  send(
    creds: ChannelCredentials,
    chatId: string,
    text: string,
    transport: ChannelTransport,
  ): Promise<OutboundHandle>
  /** In-place edit (streaming simulation). Only called when supportsEdit. */
  edit?(
    creds: ChannelCredentials,
    handle: OutboundHandle,
    text: string,
    transport: ChannelTransport,
  ): Promise<void>
  /** Human-readable setup steps (docs / settings copy). */
  setupGuide(): string
}

/** Bound check: every kind must have a registered adapter. */
export function assertAdaptersComplete(
  registry: Partial<Record<ChannelKind, ChannelAdapter>>,
): void {
  for (const kind of CHANNEL_KINDS) {
    if (!registry[kind]) throw new Error(`missing channel adapter: ${kind}`)
  }
}
