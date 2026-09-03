import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import {
  isTrustedLocalAccess,
  resolveClientIp,
  trustedLocalCidrsFromEnv,
  trustedProxiesFromEnv,
} from '@opptrix/shared'
import { getUserDataStore, hashSessionToken, isAuthSafeModeEnv } from '@opptrix/user-store'
import { hasValidStepUp } from './auth-memory.js'
import { peerIpOf, readSessionToken, requestPath } from './auth-cookies.js'

declare module 'fastify' {
  interface FastifyRequest {
    auth?: { sessionId: string; username: string; desktop: boolean }
    ownerClientIp?: string
  }
}

function tryAttachSession(req: FastifyRequest): void {
  const token = readSessionToken(req)
  if (!token) return
  const auth = getUserDataStore().appAuth
  const session = auth.getSessionByTokenHash(hashSessionToken(token))
  if (!session) return
  const owner = auth.getOwnerPublic()
  req.auth = {
    sessionId: session.id,
    username: owner?.username ?? '',
    desktop: session.desktop === 1,
  }
  auth.touchSession(session.id)
}

function isSensitiveRoute(method: string, path: string): boolean {
  const m = method.toUpperCase()
  if (m === 'PATCH' && path === '/api/config') return true
  if (m === 'POST' && path === '/api/providers') return true
  if (m === 'POST' && path === '/api/providers/discover-models') return true
  if ((m === 'PATCH' || m === 'PUT') && /^\/api\/providers\/[^/]+$/.test(path)) return true
  if (m === 'DELETE' && /^\/api\/providers\/[^/]+$/.test(path)) return true
  if (m === 'PUT' && path === '/api/settings/sandbox') return true
  if (m === 'POST' && path === '/api/auth/totp/disable') return true
  if (m === 'POST' && path === '/api/auth/password') return true
  if (m === 'POST' && path === '/api/auth/sessions/revoke-all') return true
  return false
}

let safeModeWiped = false

export function maybeWipeOwnerForSafeMode(): void {
  if (!isAuthSafeModeEnv() || safeModeWiped) return
  getUserDataStore().appAuth.wipeOwnerForSafeMode()
  safeModeWiped = true
  console.warn('[auth] OPPTRIX_AUTH_SAFE_MODE=1：已移除本地账户与全部登录会话')
}

export function shouldExposeFullHealth(req: FastifyRequest): boolean {
  tryAttachSession(req)
  if (req.auth) return true
  // First boot (unclaimed): full health for onboarding; after claim, session required.
  return !getUserDataStore().appAuth.isClaimed()
}

async function ownerAuthOnRequest(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const path = requestPath(req)
  if (!path.startsWith('/api')) return

  const opts = {
    trustedProxies: trustedProxiesFromEnv(),
    trustedLocalCidrs: trustedLocalCidrsFromEnv(),
  }
  const peer = peerIpOf(req)
  const clientIp = resolveClientIp({ ip: peer, headers: req.headers }, opts)
  req.ownerClientIp = clientIp

  const auth = getUserDataStore().appAuth
  const claimed = auth.isClaimed()

  if (path === '/api/health' || path.startsWith('/api/legal/')) return
  if (path === '/api/auth/status') {
    tryAttachSession(req)
    return
  }
  if (path === '/api/auth/login' || path === '/api/auth/login/totp') return
  // First-boot setup + all APIs while unclaimed (Docker host→bridge IP is not loopback).
  if (path === '/api/auth/setup' || !claimed) return

  tryAttachSession(req)
  if (!req.auth) {
    await reply.code(401).send({ error: '需要登录', code: 'auth_required' })
    return
  }

  const owner = auth.getOwnerPublic()
  if (isSensitiveRoute(req.method, path) && owner?.totp_enabled) {
    if (!hasValidStepUp(req.auth.sessionId)) {
      await reply.code(403).send({ error: '需要两步验证', code: 'step_up_required' })
      return
    }
  }
}

export function registerOwnerAuthHook(app: FastifyInstance): void {
  maybeWipeOwnerForSafeMode()
  app.addHook('onRequest', ownerAuthOnRequest)
}

export function clientIsLocal(req: FastifyRequest): boolean {
  const clientIp = req.ownerClientIp ?? peerIpOf(req)
  return isTrustedLocalAccess(clientIp, peerIpOf(req))
}
