import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { evaluateAccessGate } from '@opptrix/shared'
import { getUserDataStore, isAuthSafeModeEnv } from '@opptrix/user-store'
import {
  clearSessionCookie,
  clientLabel,
  isDesktopClient,
  setSessionCookie,
} from './auth-cookies.js'
import { clientIsLocal } from './auth-hook.js'
import {
  clearLoginFailures,
  consumeAuthRateLimit,
  consumeLoginTicket,
  getLoginLockStatus,
  grantStepUp,
  issueLoginTicket,
  recordLoginFailure,
  type LoginLockStatus,
} from './auth-memory.js'

function bodyField(body: unknown, key: string): string {
  if (!body || typeof body !== 'object') return ''
  const v = (body as Record<string, unknown>)[key]
  return typeof v === 'string' ? v : ''
}

function rateLimited(req: FastifyRequest, reply: FastifyReply): boolean {
  // Loopback / trusted-local share one peer (Vite→API). Soft limit is for remote abuse only.
  if (clientIsLocal(req)) return false
  const ip = req.ownerClientIp ?? ''
  if (consumeAuthRateLimit(ip)) return false
  void reply.code(429).send({ error: '尝试过于频繁，请稍后再试', code: 'rate_limited' })
  return true
}

function formatLockMessage(status: LoginLockStatus): string {
  const mins = Math.max(1, Math.ceil(status.retryAfterSec / 60))
  return `登录失败次数过多，请约 ${mins} 分钟后再试`
}

/** Hard lock by visitor IP — skipped for trusted-local clients. */
function loginLocked(req: FastifyRequest, reply: FastifyReply): boolean {
  if (clientIsLocal(req)) return false
  const status = getLoginLockStatus(req.ownerClientIp ?? '')
  if (!status.locked) return false
  void reply.code(429).send({
    error: formatLockMessage(status),
    code: 'login_locked',
    retry_after_sec: status.retryAfterSec,
  })
  return true
}

function noteLoginFailure(req: FastifyRequest, reply: FastifyReply, fallbackError: string): void {
  if (clientIsLocal(req)) {
    void reply.code(401).send({ error: fallbackError })
    return
  }
  const status = recordLoginFailure(req.ownerClientIp ?? '')
  if (status.locked) {
    void reply.code(429).send({
      error: formatLockMessage(status),
      code: 'login_locked',
      retry_after_sec: status.retryAfterSec,
    })
    return
  }
  void reply.code(401).send({ error: fallbackError })
}

function noteLoginSuccess(req: FastifyRequest): void {
  if (!clientIsLocal(req)) clearLoginFailures(req.ownerClientIp ?? '')
}

function requireAuth(req: FastifyRequest, reply: FastifyReply): req is FastifyRequest & {
  auth: { sessionId: string; username: string; desktop: boolean }
} {
  if (req.auth) return true
  void reply.code(401).send({ error: '需要登录', code: 'auth_required' })
  return false
}

function attachSession(
  req: FastifyRequest,
  reply: FastifyReply,
  issued: { id: string; token: string; expires_at: string },
  username: string,
): { id: string; expires_at: string } {
  req.auth = {
    sessionId: issued.id,
    username,
    desktop: isDesktopClient(req),
  }
  setSessionCookie(req, reply, issued.token, issued.expires_at)
  return { id: issued.id, expires_at: issued.expires_at }
}

export function registerAuthRoutes(app: FastifyInstance): void {
  app.get('/api/auth/status', async (req) => {
    const auth = getUserDataStore().appAuth
    const claimed = auth.isClaimed()
    const owner = auth.getOwnerPublic()
    const local = clientIsLocal(req)
    const gate = evaluateAccessGate(claimed, local)
    const session = req.auth
      ? auth.listSessions().find(s => s.id === req.auth?.sessionId)
      : null
    return {
      claimed,
      auth_required: gate === 'auth_required',
      local_access: local,
      totp_enabled: owner?.totp_enabled,
      username: owner?.username,
      session: session ? { id: session.id, expires_at: session.expires_at } : undefined,
      safe_mode: isAuthSafeModeEnv() || undefined,
    }
  })

  app.post('/api/auth/setup', async (req, reply) => {
    if (rateLimited(req, reply)) return
    const auth = getUserDataStore().appAuth
    if (auth.isClaimed()) {
      return reply.code(409).send({ error: '账户已创建', code: 'already_claimed' })
    }
    try {
      auth.createOwner({
        username: bodyField(req.body, 'username'),
        password: bodyField(req.body, 'password'),
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : '无法创建账户'
      return reply.code(400).send({ error: msg })
    }
    const owner = auth.getOwnerPublic()
    const issued = auth.issueSession({
      label: clientLabel(req),
      clientIp: req.ownerClientIp,
      userAgent: String(req.headers['user-agent'] ?? ''),
      desktop: isDesktopClient(req),
    })
    const session = attachSession(req, reply, issued, owner?.username ?? '')
    return { claimed: true, username: owner?.username, session }
  })

  app.post('/api/auth/login', async (req, reply) => {
    if (rateLimited(req, reply)) return
    if (loginLocked(req, reply)) return
    const auth = getUserDataStore().appAuth
    if (!auth.isClaimed()) {
      return reply.code(400).send({ error: '尚未创建账户', code: 'unclaimed' })
    }
    const username = bodyField(req.body, 'username')
    const password = bodyField(req.body, 'password')
    if (!auth.verifyUsernamePassword(username, password)) {
      noteLoginFailure(req, reply, '用户名或密码不正确')
      return
    }
    const owner = auth.getOwnerPublic()
    if (owner?.totp_enabled) {
      const ticket = issueLoginTicket()
      return { totp_required: true, ticket }
    }
    noteLoginSuccess(req)
    const issued = auth.issueSession({
      label: clientLabel(req),
      clientIp: req.ownerClientIp,
      userAgent: String(req.headers['user-agent'] ?? ''),
      desktop: isDesktopClient(req),
    })
    const session = attachSession(req, reply, issued, owner?.username ?? '')
    return { totp_required: false, session }
  })

  app.post('/api/auth/login/totp', async (req, reply) => {
    if (rateLimited(req, reply)) return
    if (loginLocked(req, reply)) return
    const auth = getUserDataStore().appAuth
    const ticket = bodyField(req.body, 'ticket')
    const code = bodyField(req.body, 'code')
    if (!consumeLoginTicket(ticket)) {
      return reply.code(401).send({ error: '登录已过期，请重新输入密码', code: 'ticket_expired' })
    }
    if (!auth.verifyTotp(code)) {
      noteLoginFailure(req, reply, '验证码不正确')
      return
    }
    noteLoginSuccess(req)
    const owner = auth.getOwnerPublic()
    const issued = auth.issueSession({
      label: clientLabel(req),
      clientIp: req.ownerClientIp,
      userAgent: String(req.headers['user-agent'] ?? ''),
      desktop: isDesktopClient(req),
    })
    const session = attachSession(req, reply, issued, owner?.username ?? '')
    return { session }
  })

  app.post('/api/auth/logout', async (req, reply) => {
    if (req.auth) getUserDataStore().appAuth.revokeSession(req.auth.sessionId)
    clearSessionCookie(req, reply)
    return { ok: true }
  })

  app.get('/api/auth/sessions', async (req, reply) => {
    if (!requireAuth(req, reply)) return
    return { sessions: getUserDataStore().appAuth.listSessions() }
  })

  app.delete<{ Params: { id: string } }>('/api/auth/sessions/:id', async (req, reply) => {
    if (!requireAuth(req, reply)) return
    const ok = getUserDataStore().appAuth.revokeSession(req.params.id)
    if (!ok) return reply.code(404).send({ error: '会话不存在' })
    if (req.auth.sessionId === req.params.id) clearSessionCookie(req, reply)
    return { ok: true }
  })

  app.post('/api/auth/sessions/revoke-all', async (req, reply) => {
    if (!requireAuth(req, reply)) return
    const n = getUserDataStore().appAuth.revokeAllSessions(req.auth.sessionId)
    return { revoked: n }
  })

  app.post('/api/auth/totp/begin', async (req, reply) => {
    if (rateLimited(req, reply)) return
    if (!requireAuth(req, reply)) return
    try {
      return getUserDataStore().appAuth.beginTotpSetup()
    } catch (e) {
      const msg = e instanceof Error ? e.message : '无法开始两步验证'
      return reply.code(400).send({ error: msg })
    }
  })

  app.post('/api/auth/totp/confirm', async (req, reply) => {
    if (rateLimited(req, reply)) return
    if (!requireAuth(req, reply)) return
    try {
      return getUserDataStore().appAuth.confirmTotp(bodyField(req.body, 'code'))
    } catch (e) {
      const msg = e instanceof Error ? e.message : '无法启用两步验证'
      return reply.code(400).send({ error: msg })
    }
  })

  app.post('/api/auth/totp/disable', async (req, reply) => {
    if (!requireAuth(req, reply)) return
    try {
      getUserDataStore().appAuth.disableTotp(
        bodyField(req.body, 'password'),
        bodyField(req.body, 'code') || undefined,
      )
      return { ok: true, totp_enabled: false }
    } catch (e) {
      const msg = e instanceof Error ? e.message : '无法关闭两步验证'
      return reply.code(400).send({ error: msg })
    }
  })

  app.post('/api/auth/password', async (req, reply) => {
    if (!requireAuth(req, reply)) return
    const auth = getUserDataStore().appAuth
    const current = bodyField(req.body, 'current_password')
    const next = bodyField(req.body, 'new_password')
    if (!auth.verifyPassword(current)) {
      return reply.code(401).send({ error: '当前密码不正确' })
    }
    const owner = auth.getOwnerPublic()
    const totpCode = bodyField(req.body, 'totp_code')
    if (owner?.totp_enabled && totpCode && !auth.verifyTotp(totpCode)) {
      return reply.code(401).send({ error: '验证码不正确' })
    }
    try {
      auth.setPassword(next)
    } catch (e) {
      const msg = e instanceof Error ? e.message : '无法更新密码'
      return reply.code(400).send({ error: msg })
    }
    return { ok: true }
  })

  app.post('/api/auth/step-up', async (req, reply) => {
    if (!requireAuth(req, reply)) return
    const auth = getUserDataStore().appAuth
    const owner = auth.getOwnerPublic()
    if (!owner?.totp_enabled) {
      grantStepUp(req.auth.sessionId)
      return { ok: true, step_up: true }
    }
    if (!auth.verifyTotp(bodyField(req.body, 'code'))) {
      return reply.code(401).send({ error: '验证码不正确' })
    }
    grantStepUp(req.auth.sessionId)
    return { ok: true, step_up: true }
  })
}
