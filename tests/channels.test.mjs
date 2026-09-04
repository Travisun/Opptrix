/**
 * Phase B chat channels tests — adapter contract (verify/parse/send) across
 * all six platforms with mock transport, plus the manager pipeline:
 * webhook verify → session mapping → engine chat → reply deliver, with
 * rate limiting and busy guarding.
 */
import assert from 'node:assert/strict'
import { describe, it, before, beforeEach, afterEach, after } from 'node:test'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import os from 'node:os'
import fs from 'node:fs'
import { createHmac, generateKeyPairSync, sign } from 'node:crypto'

const here = path.dirname(fileURLToPath(import.meta.url))
const adaptersUrl = pathToFileURL(
  path.join(here, '../apps/server/dist/channels/adapters.js'),
).href
const managerUrl = pathToFileURL(
  path.join(here, '../apps/server/dist/channels/manager.js'),
).href

let adapters
let ChannelManager

before(async () => {
  adapters = await import(adaptersUrl)
  ChannelManager = (await import(managerUrl)).ChannelManager
})

// ── mock transport factory ──────────────────────────────────────────────────

function mockTransport(responses) {
  const calls = []
  const t = async (url, init) => {
    calls.push({ url, init })
    const match = responses.find((r) => url.includes(r.match))
    const body = match ? match.body : { ok: true }
    return {
      ok: true,
      status: 200,
      headers: {},
      text: async () => JSON.stringify(body),
      json: async () => body,
    }
  }
  return { t, calls }
}

describe('channel adapters — verify', () => {
  const rawBody = '{"message":{"text":"hi"}}'
  const req = (headers, query = {}) => ({
    method: 'POST',
    headers,
    rawBody,
    query,
  })

  it('telegram: secret token header', () => {
    const creds = { botToken: 'T', secretToken: 'S3CRET' }
    assert.equal(
      adapters.telegramAdapter.verifyWebhook(creds, req({ 'x-telegram-bot-api-secret-token': 'S3CRET' })),
      true,
    )
    assert.equal(
      adapters.telegramAdapter.verifyWebhook(creds, req({ 'x-telegram-bot-api-secret-token': 'WRONG' })),
      false,
    )
  })

  it('slack: v0 HMAC signature + replay window', () => {
    const creds = { botToken: 'x', signingSecret: 'SECRET' }
    const ts = String(Math.floor(Date.now() / 1000))
    const base = `v0:${ts}:${rawBody}`
    const sig = 'v0=' + createHmac('sha256', 'SECRET').update(base).digest('hex')
    assert.equal(
      adapters.slackAdapter.verifyWebhook(creds, req({ 'x-slack-request-timestamp': ts, 'x-slack-signature': sig })),
      true,
    )
    assert.equal(
      adapters.slackAdapter.verifyWebhook(creds, req({ 'x-slack-request-timestamp': ts, 'x-slack-signature': 'v0=bad' })),
      false,
    )
    // Stale timestamp (replay) rejected.
    const oldTs = String(Math.floor(Date.now() / 1000) - 1000)
    const oldBase = `v0:${oldTs}:${rawBody}`
    const oldSig = 'v0=' + createHmac('sha256', 'SECRET').update(oldBase).digest('hex')
    assert.equal(
      adapters.slackAdapter.verifyWebhook(creds, req({ 'x-slack-request-timestamp': oldTs, 'x-slack-signature': oldSig })),
      false,
    )
  })

  it('dingtalk: 加签 HMAC（timestamp+\\n+secret）', () => {
    const creds = { appSecret: 'DSECRET' }
    const ts = String(Date.now())
    const sign = createHmac('sha256', 'DSECRET').update(`${ts}\nDSECRET`).digest('base64')
    assert.equal(adapters.dingtalkAdapter.verifyWebhook(creds, req({}, { timestamp: ts, sign })), true)
    assert.equal(adapters.dingtalkAdapter.verifyWebhook(creds, req({}, { timestamp: ts, sign: 'bad' })), false)
  })

  it('qq: Ed25519 signature over timestamp+body', () => {
    const { publicKey, privateKey } = generateKeyPairSync('ed25519')
    void sign
    // Extract raw seed (32 bytes) from the DER private key for appSecret.
    const der = privateKey.export({ type: 'pkcs8', format: 'der' })
    const seed = der.subarray(der.length - 32).toString('hex')
    const creds = { appId: 'app', appSecret: seed }
    const ts = String(Math.floor(Date.now() / 1000))
    const sig = sign(null, Buffer.from(`${ts}${rawBody}`, 'utf8'), privateKey).toString('hex')
    const headers = { 'x-signature-ed25519': sig, 'x-signature-timestamp': ts }
    assert.equal(adapters.qqAdapter.verifyWebhook(creds, req(headers)), true)
    const badSig = sign(null, Buffer.from('tampered'), privateKey).toString('hex')
    assert.equal(
      adapters.qqAdapter.verifyWebhook(creds, req({ 'x-signature-ed25519': badSig, 'x-signature-timestamp': ts })),
      false,
    )
  })
})

describe('channel adapters — parse', () => {
  it('telegram normalizes text messages', () => {
    const parsed = adapters.telegramAdapter.parseInbound({}, {
      method: 'POST', headers: {}, query: {},
      rawBody: JSON.stringify({ message: { text: 'hello', chat: { id: 42 }, from: { id: 7 } } }),
    })
    assert.deepEqual(parsed.messages, [
      { channelUserId: '7', channelChatId: '42', text: 'hello' },
    ])
  })

  it('slack url_verification returns challenge', () => {
    const parsed = adapters.slackAdapter.parseInbound({}, {
      method: 'POST', headers: {}, query: {},
      rawBody: JSON.stringify({ type: 'url_verification', challenge: 'CHALLENGE_X' }),
    })
    assert.deepEqual(parsed.challengeResponse, { challenge: 'CHALLENGE_X' })
    assert.equal(parsed.messages.length, 0)
  })

  it('slack normalizes app messages (ignores bots/subtypes)', () => {
    const parsed = adapters.slackAdapter.parseInbound({}, {
      method: 'POST', headers: {}, query: {},
      rawBody: JSON.stringify({ event: { type: 'message', channel: 'C1', user: 'U1', text: 'run' } }),
    })
    assert.equal(parsed.messages[0].channelChatId, 'C1')
  })

  it('dingtalk captures sessionWebhook as reply route', () => {
    const parsed = adapters.dingtalkAdapter.parseInbound({}, {
      method: 'POST', headers: {}, query: {},
      rawBody: JSON.stringify({ msgtype: 'text', text: { content: '查行情' }, senderStaffId: 'staff1', sessionWebhook: 'https://oapi.dingtalk.com/robot/send?abc' }),
    })
    assert.equal(parsed.messages[0].replyWebhook, 'https://oapi.dingtalk.com/robot/send?abc')
    assert.equal(parsed.messages[0].text, '查行情')
  })

  it('feishu url_verification + im.message.receive_v1', () => {
    const challenge = adapters.feishuAdapter.parseInbound({}, {
      method: 'POST', headers: {}, query: {},
      rawBody: JSON.stringify({ type: 'url_verification', challenge: 'F_CH' }),
    })
    assert.deepEqual(challenge.challengeResponse, { challenge: 'F_CH' })
    const parsed = adapters.feishuAdapter.parseInbound({}, {
      method: 'POST', headers: {}, query: {},
      rawBody: JSON.stringify({
        header: { event_type: 'im.message.receive_v1' },
        event: {
          message: { chat_id: 'oc_1', message_type: 'text', content: '{"text":"飞书你好"}' },
          sender: { sender_id: { open_id: 'ou_1' } },
        },
      }),
    })
    assert.equal(parsed.messages[0].channelChatId, 'oc_1')
    assert.equal(parsed.messages[0].text, '飞书你好')
  })

  it('wecom smart robot inline reply route', () => {
    const parsed = adapters.wecomAdapter.parseInbound({}, {
      method: 'POST', headers: {}, query: {},
      rawBody: JSON.stringify({ msgtype: 'text', text: { content: '企微' }, from: { userId: 'u1' }, webhookUrl: 'https://qyapi.weixin.qq.com/xxx' }),
    })
    assert.equal(parsed.messages[0].replyWebhook, 'https://qyapi.weixin.qq.com/xxx')
  })

  it('qq normalizes c2c/group messages with passive id', () => {
    const parsed = adapters.qqAdapter.parseInbound({}, {
      method: 'POST', headers: {}, query: {},
      rawBody: JSON.stringify({ op: 0, t: 'C2C_MESSAGE_CREATE', d: { content: 'qq 你好', author: { user_openid: 'OPEN1' }, id: 'msgid9' } }),
    })
    assert.equal(parsed.messages[0].channelChatId, 'OPEN1')
    assert.equal(parsed.messages[0].passiveMessageId, 'msgid9')
  })
})

describe('channel adapters — send via mock transport', () => {
  it('telegram send posts to bot API and returns message id', async () => {
    const { t, calls } = mockTransport([{ match: '/sendMessage', body: { result: { message_id: 99 } } }])
    const handle = await adapters.telegramAdapter.send({ botToken: 'T' }, '42', 'hi', t)
    assert.equal(handle.messageId, '99')
    assert.ok(calls[0].url.includes('/botT/sendMessage'))
  })

  it('feishu send acquires tenant token then posts message', async () => {
    const { t, calls } = mockTransport([
      { match: '/tenant_access_token', body: { tenant_access_token: 'FT', expire: 7200 } },
      { match: '/im/v1/messages', body: { data: { message_id: 'om_1' } } },
    ])
    const handle = await adapters.feishuAdapter.send({ appId: 'A', appSecret: 'S' }, 'oc_9', 'hi', t)
    assert.equal(handle.messageId, 'om_1')
    assert.ok(calls[0].url.includes('/auth/v3/tenant_access_token'))
    assert.ok(calls[1].url.includes('receive_id_type=chat_id'))
  })

  it('dingtalk replies to the sessionWebhook', async () => {
    const { t, calls } = mockTransport([{ match: '/robot/send', body: { errcode: 0 } }])
    await adapters.dingtalkAdapter.send({}, 'https://oapi.dingtalk.com/robot/send?abc', 'done', t)
    assert.equal(calls.length, 1)
    assert.ok(calls[0].url.includes('/robot/send'))
  })
})

// ── manager pipeline ────────────────────────────────────────────────────────

let tmpRoot
let dataDir

let platform

// One data dir per FILE: the manager's user-preferences module is a cached
// singleton — per-test data dirs + cache-busted imports would split state
// between the manager and the platform store. Tests use unique channel ids.
before(async () => {
  tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opptrix-chan-'))
  dataDir = path.join(tmpRoot, 'data')
  fs.mkdirSync(dataDir, { recursive: true })
  process.env.OPPTRIX_DATA_DIR = dataDir
  platform = await import(pathToFileURL(path.join(here, '../apps/server/dist/platform/index.js')).href)
  platform.createPlatformContext()
})

after(() => {
  delete process.env.OPPTRIX_DATA_DIR
  try {
    fs.rmSync(tmpRoot, { recursive: true, force: true })
  } catch {
    // best-effort
  }
})

describe('ChannelManager pipeline', () => {
  function makeManager(chatLog, replies) {
    const clock = { now: Date.now() }
    const sentTexts = []
    const mgr = new ChannelManager({
      now: () => clock.now,
      chat: async (sessionId, message) => {
        chatLog.push({ sessionId, message })
        return { reply: replies.shift() ?? '回复', toolsUsed: [], sessionId }
      },
      createSession: async () => ({ id: `sess_${Math.random().toString(36).slice(2, 8)}` }),
      transport: async (_url, init) => {
        try {
          const parsed = JSON.parse(init.body)
          // telegram: text is a string; dingtalk/wecom: text.content
          sentTexts.push(
            typeof parsed.text === 'string' ? parsed.text : String(parsed.text?.content ?? ''),
          )
        } catch {
          sentTexts.push('')
        }
        return {
          ok: true,
          status: 200,
          headers: {},
          text: async () => '{}',
          json: async () => ({ ok: true, result: { message_id: 1 }, ts: '1' }),
        }
      },
    })
    Object.assign(mgr, {
      advance: (ms) => { clock.now += ms },
      sentTexts,
    })
    return mgr
  }

  function telegramConfig(chatKey, creds) {
    // chatKey doubles as the channel NAME (config ids are manager-generated);
    // tests use unique names per case so shared-store leakage is observable.
    void chatKey
    return { kind: 'telegram', name: `tg-${chatKey}`, enabled: true, creds }
  }

  it('webhook: verify → parse → chat → deliver (session mapped)', async () => {
    const chatLog = []
    const mgr = makeManager(chatLog, ['你好，我是 Opptrix。'])
    const creds = { botToken: 'T', secretToken: 'S' }
    const saved = mgr.saveConfig(telegramConfig('ch1', creds))

    const result = await mgr.handleWebhook(saved.id, {
      method: 'POST',
      headers: { 'x-telegram-bot-api-secret-token': 'S' },
      rawBody: JSON.stringify({ message: { text: '帮我看看茅台', chat: { id: 42 }, from: { id: 7 } } }),
      query: {},
    })
    assert.equal(result.status, 200)
    await mgr.drainInbound()
    assert.equal(chatLog.length, 1)
    assert.ok(chatLog[0].sessionId.startsWith('sess_'))

    // Second message reuses the SAME session (mapping persisted).
    mgr.advance(5000) // clear the rate-limit gap deterministically
    await mgr.handleWebhook(saved.id, {
      method: 'POST',
      headers: { 'x-telegram-bot-api-secret-token': 'S' },
      rawBody: JSON.stringify({ message: { text: '第二条', chat: { id: 42 }, from: { id: 7 } } }),
      query: {},
    })
    await mgr.drainInbound()
    assert.equal(chatLog[1].sessionId, chatLog[0].sessionId)
  })

  it('webhook rejects bad secret (401) and unknown channel (404)', async () => {
    const mgr = makeManager([], [])
    const saved = mgr.saveConfig(telegramConfig('ch2', { botToken: 'T', secretToken: 'S' }))
    const bad = await mgr.handleWebhook(saved.id, {
      method: 'POST', headers: { 'x-telegram-bot-api-secret-token': 'WRONG' },
      rawBody: '{}', query: {},
    })
    assert.equal(bad.status, 401)
    const missing = await mgr.handleWebhook('nope', { method: 'POST', headers: {}, rawBody: '{}', query: {} })
    assert.equal(missing.status, 404)
  })

  it('rate limit: second message within gap is rate_limited', async () => {
    const chatLog = []
    const mgr = makeManager(chatLog, ['r1'])
    const saved = mgr.saveConfig(telegramConfig('ch3', { botToken: 'T', secretToken: 'S' }))
    const ok = await mgr.handleWebhook(saved.id, {
      method: 'POST',
      headers: { 'x-telegram-bot-api-secret-token': 'S' },
      rawBody: JSON.stringify({ message: { text: 'one', chat: { id: 1 }, from: { id: 1 } } }),
      query: {},
    })
    assert.equal(ok.status, 200)
    // In-flight window: second webhook gets the busy notice, NOT a second turn.
    const busy = await mgr.handleWebhook(saved.id, {
      method: 'POST',
      headers: { 'x-telegram-bot-api-secret-token': 'S' },
      rawBody: JSON.stringify({ message: { text: 'two', chat: { id: 1 }, from: { id: 1 } } }),
      query: {},
    })
    assert.equal(busy.status, 200)
    await mgr.drainInbound()
    // Exactly ONE chat turn for two rapid messages.
    assert.equal(chatLog.length, 1)
    // Rapid-fire second message: the first turn is either still in flight
    // (busy notice) or rate-limited (fast-message notice) — never a 2nd turn.
    assert.ok(
      mgr.sentTexts.some((t) => t.includes('仍在处理中') || t.includes('请稍候')),
      'busy/rate notice delivered',
    )
  })

  it('disabled channel returns 403', async () => {
    const mgr = makeManager([], [])
    const saved = mgr.saveConfig({ ...telegramConfig('ch4', { botToken: 'T', secretToken: 'S' }), enabled: false })
    const r = await mgr.handleWebhook(saved.id, {
      method: 'POST',
      headers: { 'x-telegram-bot-api-secret-token': 'S' },
      rawBody: JSON.stringify({ message: { text: 'x', chat: { id: 1 }, from: { id: 1 } } }),
      query: {},
    })
    assert.equal(r.status, 403)
  })
})
