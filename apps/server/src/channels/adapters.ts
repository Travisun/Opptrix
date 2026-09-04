/**
 * Channel adapters — Telegram / Slack / DingTalk / Feishu / WeCom / QQ.
 *
 * Every adapter is transport-injectable and unit-tested against local mocks;
 * no vendor SDK dependencies. Signature verification uses node:crypto only.
 *
 * Streaming model (see types.ts): edit-capable channels receive throttled
 * stage updates + final in-place edit; reply-webhook platforms receive the
 * final message once.
 */

import { createHmac, timingSafeEqual, createPrivateKey, verify } from 'node:crypto'
import type {
  ChannelAdapter,
  ChannelCredentials,
  ChannelInbound,
  ChannelTransport,
  ChannelWebhookRequest,
  OutboundHandle,
} from './types.js'

function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ba.length !== bb.length) return false
  return timingSafeEqual(ba, bb)
}

async function postJson(
  transport: ChannelTransport,
  url: string,
  body: unknown,
  headers?: Record<string, string>,
): Promise<{ ok: boolean; status: number; json: Record<string, unknown> }> {
  const resp = await transport(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(headers ?? {}) },
    body: JSON.stringify(body),
  })
  let json: Record<string, unknown> = {}
  try {
    json = (await resp.json()) as Record<string, unknown>
  } catch {
    // non-JSON body
  }
  return { ok: resp.ok && resp.status < 400, status: resp.status, json }
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : text.slice(0, max - 1) + '…'
}

// ── Telegram ────────────────────────────────────────────────────────────────

const TG_API = 'https://api.telegram.org'
const TG_MAX = 4096

export const telegramAdapter: ChannelAdapter = {
  kind: 'telegram',
  supportsEdit: true,
  verifyWebhook(creds, req) {
    const got = req.headers['x-telegram-bot-api-secret-token'] ?? ''
    return Boolean(creds.secretToken) && safeEqual(got, creds.secretToken)
  },
  parseInbound(_creds, req) {
    const body = JSON.parse(req.rawBody || '{}') as {
      message?: {
        text?: string
        chat?: { id?: number | string }
        from?: { id?: number | string }
      }
    }
    const m = body.message
    if (!m?.text || m.chat?.id == null) return { messages: [] }
    const messages: ChannelInbound[] = [
      {
        channelUserId: String(m.from?.id ?? ''),
        channelChatId: String(m.chat.id),
        text: m.text,
      },
    ]
    return { messages }
  },
  async send(creds, chatId, text, transport) {
    const r = await postJson(
      transport,
      `${TG_API}/bot${creds.botToken}/sendMessage`,
      { chat_id: chatId, text: truncate(text, TG_MAX) },
    )
    if (!r.ok) throw new Error(`telegram send failed: ${r.status}`)
    const messageId = (r.json.result as { message_id?: number } | undefined)?.message_id
    return { chatId, messageId: messageId != null ? String(messageId) : undefined }
  },
  async edit(creds, handle, text, transport) {
    const r = await postJson(
      transport,
      `${TG_API}/bot${creds.botToken}/editMessageText`,
      { chat_id: handle.chatId, message_id: Number(handle.messageId), text: truncate(text, TG_MAX) },
    )
    if (!r.ok) throw new Error(`telegram edit failed: ${r.status}`)
  },
  setupGuide() {
    return [
      '1. @BotFather 创建机器人，取得 botToken',
      '2. 将本实例公网地址 + /api/channels/webhook/telegram/{id} 设为 Webhook（secretToken 一并配置）',
      `3. 推荐限制: setWebhook -d secret_token=<随机串>`,
    ].join('\n')
  },
}

// ── Slack ───────────────────────────────────────────────────────────────────

const SLACK_API = 'https://slack.com/api'

function slackSignatureValid(
  signingSecret: string,
  headers: Record<string, string>,
  rawBody: string,
): boolean {
  const ts = headers['x-slack-request-timestamp'] ?? ''
  const sig = headers['x-slack-signature'] ?? ''
  if (!ts || !sig) return false
  // Replay window: 5 minutes.
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false
  const base = `v0:${ts}:${rawBody}`
  const mine =
    'v0=' + createHmac('sha256', signingSecret).update(base).digest('hex')
  return safeEqual(mine, sig)
}

export const slackAdapter: ChannelAdapter = {
  kind: 'slack',
  supportsEdit: true,
  verifyWebhook(creds, req) {
    return slackSignatureValid(creds.signingSecret ?? '', req.headers, req.rawBody)
  },
  parseInbound(_creds, req) {
    const body = JSON.parse(req.rawBody || '{}') as {
      type?: string
      challenge?: string
      event?: {
        type?: string
        bot_id?: string
        subtype?: string
        channel?: string
        user?: string
        text?: string
      }
    }
    if (body.type === 'url_verification') {
      return { messages: [], challengeResponse: { challenge: body.challenge ?? '' } }
    }
    const ev = body.event
    if (ev?.type !== 'message' || !ev.text || ev.bot_id || ev.subtype) {
      return { messages: [] }
    }
    return {
      messages: [
        {
          channelUserId: ev.user ?? '',
          channelChatId: ev.channel ?? '',
          text: ev.text,
        },
      ],
    }
  },
  async send(creds, chatId, text, transport) {
    const r = await postJson(
      transport,
      `${SLACK_API}/chat.postMessage`,
      { channel: chatId, text },
      { authorization: `Bearer ${creds.botToken}` },
    )
    if (!r.ok) throw new Error(`slack send failed: ${r.status}`)
    const ts = r.json.ts as string | undefined
    return { chatId, messageId: ts }
  },
  async edit(creds, handle, text, transport) {
    const r = await postJson(
      transport,
      `${SLACK_API}/chat.update`,
      { channel: handle.chatId, ts: handle.messageId, text },
      { authorization: `Bearer ${creds.botToken}` },
    )
    if (!r.ok) throw new Error(`slack edit failed: ${r.status}`)
  },
  setupGuide() {
    return [
      '1. api.slack.com/apps 创建 App，开 Socket/Events 与 chat:write',
      '2. Event Subscriptions → Request URL 指向 /api/channels/webhook/slack/{id}（url_verification 自动应答）',
      '3. 订阅 message.im / message.channels；配置 signingSecret + botToken',
    ].join('\n')
  },
}

// ── DingTalk（自定义机器人 · 加签 · 通过 sessionWebhook 回包）───────────────

export const dingtalkAdapter: ChannelAdapter = {
  kind: 'dingtalk',
  supportsEdit: false,
  verifyWebhook(creds, req) {
    if (!creds.appSecret) return false
    const ts = req.query.timestamp ?? ''
    const sign = req.query.sign ?? ''
    if (!ts || !sign) return false
    if (Math.abs(Date.now() - Number(ts)) > 3_600_000) return false
    const stringToSign = `${ts}\n${creds.appSecret}`
    const mine = createHmac('sha256', creds.appSecret)
      .update(stringToSign)
      .digest('base64')
    return safeEqual(mine, sign)
  },
  parseInbound(_creds, req) {
    const body = JSON.parse(req.rawBody || '{}') as {
      msgtype?: string
      text?: { content?: string }
      senderStaffId?: string
      senderNick?: string
      sessionWebhook?: string
    }
    const content = (body.text?.content ?? '').trim()
    if (body.msgtype !== 'text' || !content || !body.sessionWebhook) {
      return { messages: [] }
    }
    return {
      messages: [
        {
          channelUserId: body.senderStaffId ?? body.senderNick ?? '',
          channelChatId: body.sessionWebhook, // reply route IS the webhook
          text: content,
          replyWebhook: body.sessionWebhook,
        },
      ],
    }
  },
  async send(_creds, _chatId, text, transport) {
    // DingTalk custom robots answer via the sessionWebhook captured on inbound.
    const replyUrl = _chatId
    const r = await postJson(transport, replyUrl, {
      msgtype: 'text',
      text: { content: truncate(text, 2000) },
    })
    if (!r.ok) throw new Error(`dingtalk reply failed: ${r.status}`)
    return { chatId: replyUrl, replyWebhook: replyUrl }
  },
  setupGuide() {
    return [
      '1. 群设置 → 智能群助手 → 添加自定义机器人（安全设置：加签）',
      '2. 记下 access_token（webhook 地址）与加签密钥 appSecret',
      '3. 使用钉钉开放平台「企业内部应用机器人」接收消息，回调地址指向 /api/channels/webhook/dingtalk/{id}',
    ].join('\n')
  },
}

// ── Feishu（自建应用 · 事件订阅 v2 · 支持编辑）──────────────────────────────

const FEISHU_BASE = 'https://open.feishu.cn'
type FeishuTokenCache = { token: string; expiresAt: number }
const feishuTokens = new Map<string, FeishuTokenCache>()

async function feishuTenantToken(
  creds: ChannelCredentials,
  transport: ChannelTransport,
): Promise<string> {
  const cacheKey = creds.appId ?? ''
  const cached = feishuTokens.get(cacheKey)
  if (cached && cached.expiresAt > Date.now() + 30_000) return cached.token
  const r = await postJson(transport, `${FEISHU_BASE}/open-apis/auth/v3/tenant_access_token/internal`, {
    app_id: creds.appId,
    app_secret: creds.appSecret,
  })
  const token = (r.json.tenant_access_token as string | undefined) ?? ''
  const expire = Number(r.json.expire ?? 0)
  if (!token) throw new Error('feishu tenant token failed')
  feishuTokens.set(cacheKey, { token, expiresAt: Date.now() + expire * 1000 })
  return token
}

function feishuSignatureValid(
  creds: ChannelCredentials,
  req: ChannelWebhookRequest,
): boolean {
  if (!creds.encryptKey) return true // 未配置加密密钥时跳过签名（URL 隔离）
  const ts = req.headers['x-lark-request-timestamp'] ?? ''
  const nonce = req.headers['x-lark-request-nonce'] ?? ''
  const sig = req.headers['x-lark-signature'] ?? ''
  if (!ts || !nonce || !sig) return false
  const mine = createHmac('sha256', creds.encryptKey)
    .update(`${ts}${nonce}${req.rawBody}`)
    .digest('hex')
  return safeEqual(mine, sig)
}

export const feishuAdapter: ChannelAdapter = {
  kind: 'feishu',
  supportsEdit: true,
  verifyWebhook(creds, req) {
    return feishuSignatureValid(creds, req)
  },
  parseInbound(_creds, req) {
    const body = JSON.parse(req.rawBody || '{}') as {
      type?: string
      challenge?: string
      header?: { event_type?: string }
      event?: {
        message?: {
          chat_id?: string
          message_id?: string
          message_type?: string
          content?: string // JSON string {"text":"…"}
        }
        sender?: { sender_id?: { open_id?: string } }
      }
    }
    if (body.type === 'url_verification') {
      return { messages: [], challengeResponse: { challenge: body.challenge ?? '' } }
    }
    if (body.header?.event_type !== 'im.message.receive_v1') return { messages: [] }
    const m = body.event?.message
    if (m?.message_type !== 'text' || !m.chat_id) return { messages: [] }
    let text = ''
    try {
      text = (JSON.parse(m.content ?? '{}') as { text?: string }).text ?? ''
    } catch {
      return { messages: [] }
    }
    return {
      messages: [
        {
          channelUserId: body.event?.sender?.sender_id?.open_id ?? '',
          channelChatId: m.chat_id,
          text,
        },
      ],
    }
  },
  async send(creds, chatId, text, transport) {
    const token = await feishuTenantToken(creds, transport)
    const r = await postJson(
      transport,
      `${FEISHU_BASE}/open-apis/im/v1/messages?receive_id_type=chat_id`,
      { receive_id: chatId, msg_type: 'text', content: JSON.stringify({ text: truncate(text, 4000) }) },
      { authorization: `Bearer ${token}` },
    )
    if (!r.ok) throw new Error(`feishu send failed: ${r.status}`)
    const messageId =
      ((r.json.data as { message_id?: string } | undefined)?.message_id) ?? undefined
    return { chatId, messageId }
  },
  async edit(creds, handle, text, transport) {
    if (!handle.messageId) return
    const token = await feishuTenantToken(creds, transport)
    const r = await transport(
      `${FEISHU_BASE}/open-apis/im/v1/messages/${handle.messageId}`,
      {
        method: 'PATCH',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body: JSON.stringify({ content: JSON.stringify({ text: truncate(text, 4000) }) }),
      },
    )
    if (!r.ok && r.status !== 404) throw new Error(`feishu edit failed: ${r.status}`)
  },
  setupGuide() {
    return [
      '1. open.feishu.cn 创建自建应用，开通 im:message 权限',
      '2. 事件订阅 → 请求地址 /api/channels/webhook/feishu/{id}（url_verification 自动应答）',
      '3. 订阅 im.message.receive_v1；配置 appId/appSecret（encryptKey 可选）',
    ].join('\n')
  },
}

// ── WeCom（企业微信智能机器人 · 回调内直接应答）────────────────────────────

export const wecomAdapter: ChannelAdapter = {
  kind: 'wecom',
  supportsEdit: false,
  verifyWebhook(creds, req) {
    // 智能机器人回调无标准签名 — 用 URL 上的可选 secret 做 URL 级隔离。
    if (!creds.webhookSecret) return true
    return safeEqual(req.query.secret ?? '', creds.webhookSecret)
  },
  parseInbound(_creds, req) {
    const body = JSON.parse(req.rawBody || '{}') as {
      msgtype?: string
      text?: { content?: string }
      from?: { userId?: string }
      chatId?: string
      webhookUrl?: string
    }
    const content = (body.text?.content ?? '').trim()
    if (body.msgtype !== 'text' || !content) return { messages: [] }
    return {
      messages: [
        {
          channelUserId: body.from?.userId ?? '',
          channelChatId: body.chatId ?? body.from?.userId ?? '',
          text: content,
          replyWebhook: body.webhookUrl,
        },
      ],
    }
  },
  async send(_creds, _chatId, text, transport) {
    // Smart robots reply inline; when replying later (async), use the stored
    // webhookUrl passed as chatId.
    if (_chatId.startsWith('http')) {
      const r = await postJson(transport, _chatId, {
        msgtype: 'text',
        text: { content: truncate(text, 2000) },
      })
      if (!r.ok) throw new Error(`wecom reply failed: ${r.status}`)
    }
    return { chatId: _chatId, replyWebhook: _chatId.startsWith('http') ? _chatId : undefined }
  },
  setupGuide() {
    return [
      '1. 企业微信群 → 添加智能机器人（回调模式）',
      '2. 回调 URL 指向 /api/channels/webhook/wecom/{id}（可加 ?secret= 隔离）',
      '3. 机器人在回调 POST 内直接应答（无需额外 send API）',
    ].join('\n')
  },
}

// ── QQ（QQ 开放平台 · 机器人 Webhook · Ed25519 签名）────────────────────────

function qqSignatureValid(creds: ChannelCredentials, req: ChannelWebhookRequest): boolean {
  if (!creds.appSecret || !creds.appId) return false
  const sig = req.headers['x-signature-ed25519'] ?? ''
  const ts = req.headers['x-signature-timestamp'] ?? ''
  if (!sig || !ts) return false
  try {
    // QQ 平台使用 Ed25519 裸签名（64 字节 hex）；appSecret 即 Ed25519 seed。
    const msg = Buffer.from(`${ts}${req.rawBody}`, 'utf8')
    const sigBuf = Buffer.from(sig, 'hex')
    const key = createPrivateKey({
      key: Buffer.concat([
        Buffer.from('302e020100300506032b657004220420', 'hex'),
        Buffer.from(creds.appSecret, 'hex'),
      ]),
      type: 'pkcs8',
      format: 'der',
    })
    return verify(null, msg, key, sigBuf)
  } catch {
    return false
  }
}

export const qqAdapter: ChannelAdapter = {
  kind: 'qq',
  supportsEdit: false,
  verifyWebhook(creds, req) {
    return qqSignatureValid(creds, req)
  },
  parseInbound(_creds, req) {
    const body = JSON.parse(req.rawBody || '{}') as {
      op?: number
      t?: string
      d?: {
        content?: string
        author?: { id?: string; user_openid?: string }
        group_openid?: string
        id?: string
      }
    }
    if (body.op === 13) {
      // Callback validation ping (op 13) — echoed by the http layer.
      return { messages: [] }
    }
    const isC2C = body.t === 'C2C_MESSAGE_CREATE'
    const isGroup = body.t === 'GROUP_AT_MESSAGE_CREATE'
    if (!isC2C && !isGroup) return { messages: [] }
    const text = (body.d?.content ?? '').trim()
    const userId = body.d?.author?.user_openid ?? body.d?.author?.id ?? ''
    const chatId = isGroup ? (body.d?.group_openid ?? '') : userId
    if (!text || !chatId) return { messages: [] }
    return {
      messages: [
        {
          channelUserId: userId,
          channelChatId: chatId,
          text,
          passiveMessageId: body.d?.id,
        },
      ],
    }
  },
  async send(creds, chatId, text, transport) {
    // App access token (appid + clientSecret JSON).
    const tokenResp = await postJson(transport, 'https://bots.qq.com/app/getAppAccessToken', {
      appId: creds.appId,
      clientSecret: creds.appSecret,
    })
    const token = String(tokenResp.json.access_token ?? '')
    const isGroup = chatId.startsWith('group:')
    const url = isGroup
      ? `https://api.sgroup.qq.com/v2/groups/${chatId.slice(6)}/messages`
      : `https://api.sgroup.qq.com/v2/users/${chatId}/messages`
    const r = await postJson(
      transport,
      url,
      {
        content: truncate(text, 1500),
        msg_type: 0,
        msg_id: qqLastMsgId.get(chatId) ?? '',
        msg_seq: (qqMsgSeq.get(chatId) ?? 0) + 1,
      },
      { authorization: `Bearer ${token}` },
    )
    qqMsgSeq.set(chatId, (qqMsgSeq.get(chatId) ?? 0) + 1)
    if (!r.ok) throw new Error(`qq send failed: ${r.status}`)
    return { chatId }
  },
  setupGuide() {
    return [
      '1. q.qq.com 创建机器人，取得 appId/appSecret（Ed25519 seed）',
      '2. 回调配置 → 请求地址 /api/channels/webhook/qq/{id}',
      '3. 订阅 C2C_MESSAGE_CREATE 与 GROUP_AT_MESSAGE_CREATE',
    ].join('\n')
  },
}

/** QQ 被动回复需要原消息 id（被动消息时效内才能回复）。 */
const qqLastMsgId = new Map<string, string>()
const qqMsgSeq = new Map<string, number>()

/** 供 http 层在 parse 后记录 QQ 原消息 id（被动回复契约）。 */
export function rememberQqMessageId(channelChatId: string, messageId: string | undefined): void {
  if (messageId) qqLastMsgId.set(channelChatId, messageId)
}

export const channelAdapters: Record<
  import('./types.js').ChannelKind,
  ChannelAdapter
> = {
  telegram: telegramAdapter,
  slack: slackAdapter,
  dingtalk: dingtalkAdapter,
  feishu: feishuAdapter,
  wecom: wecomAdapter,
  qq: qqAdapter,
}
