/** In-memory login tickets, step-up grants, soft rate limits, and login lockouts. */
import { randomBytes } from 'node:crypto'

const LOGIN_TICKET_TTL_MS = 5 * 60 * 1000
const STEP_UP_TTL_MS = 8 * 60 * 1000
/** Soft ceiling for all rate-limited auth endpoints (Scheme A). */
const RATE_WINDOW_MS = 15 * 60 * 1000
const RATE_MAX = 30

/** Failed logins before hard lock engages. */
const LOGIN_FAIL_LOCK_AT = 5
const LOGIN_LOCK_BASE_MIN = 30
const LOGIN_LOCK_STEP_MIN = 35

interface TicketRow {
  expiresAt: number
}

interface LoginFailRow {
  fails: number
  lockedUntil: number
}

const tickets = new Map<string, TicketRow>()
const stepUps = new Map<string, number>()
const rateBuckets = new Map<string, { count: number; resetAt: number }>()
const loginFails = new Map<string, LoginFailRow>()

function pruneMap(now: number): void {
  for (const [k, row] of tickets) {
    if (row.expiresAt <= now) tickets.delete(k)
  }
  for (const [k, exp] of stepUps) {
    if (exp <= now) stepUps.delete(k)
  }
  for (const [k, row] of rateBuckets) {
    if (row.resetAt <= now) rateBuckets.delete(k)
  }
  for (const [k, row] of loginFails) {
    if (row.lockedUntil > 0 && row.lockedUntil <= now && row.fails < LOGIN_FAIL_LOCK_AT) {
      loginFails.delete(k)
    }
  }
}

function lockDurationMs(fails: number): number {
  if (fails < LOGIN_FAIL_LOCK_AT) return 0
  const minutes = LOGIN_LOCK_BASE_MIN + (fails - LOGIN_FAIL_LOCK_AT) * LOGIN_LOCK_STEP_MIN
  return minutes * 60 * 1000
}

export function issueLoginTicket(): string {
  const now = Date.now()
  pruneMap(now)
  const ticket = randomBytes(32).toString('base64url')
  tickets.set(ticket, { expiresAt: now + LOGIN_TICKET_TTL_MS })
  return ticket
}

export function consumeLoginTicket(ticket: string): boolean {
  const now = Date.now()
  const row = tickets.get(ticket)
  tickets.delete(ticket)
  return Boolean(row && row.expiresAt > now)
}

export function grantStepUp(sessionId: string): void {
  pruneMap(Date.now())
  stepUps.set(sessionId, Date.now() + STEP_UP_TTL_MS)
}

export function hasValidStepUp(sessionId: string): boolean {
  const exp = stepUps.get(sessionId)
  if (!exp) return false
  if (exp <= Date.now()) {
    stepUps.delete(sessionId)
    return false
  }
  return true
}

export function clearStepUp(sessionId: string): void {
  stepUps.delete(sessionId)
}

export function consumeAuthRateLimit(ip: string): boolean {
  const now = Date.now()
  if (rateBuckets.size > 8000) pruneMap(now)
  const key = ip || 'unknown'
  const cur = rateBuckets.get(key)
  if (!cur || cur.resetAt <= now) {
    rateBuckets.set(key, { count: 1, resetAt: now + RATE_WINDOW_MS })
    return true
  }
  if (cur.count >= RATE_MAX) return false
  cur.count += 1
  return true
}

export type LoginLockStatus = {
  locked: boolean
  retryAfterSec: number
  fails: number
}

export function getLoginLockStatus(ip: string): LoginLockStatus {
  const now = Date.now()
  const key = ip || 'unknown'
  const row = loginFails.get(key)
  if (!row) return { locked: false, retryAfterSec: 0, fails: 0 }
  if (row.lockedUntil > now) {
    return {
      locked: true,
      retryAfterSec: Math.max(1, Math.ceil((row.lockedUntil - now) / 1000)),
      fails: row.fails,
    }
  }
  return { locked: false, retryAfterSec: 0, fails: row.fails }
}

/** Record a failed password/TOTP login. Returns updated lock status. */
export function recordLoginFailure(ip: string): LoginLockStatus {
  const now = Date.now()
  if (loginFails.size > 8000) pruneMap(now)
  const key = ip || 'unknown'
  const prev = loginFails.get(key)
  const fails = (prev?.fails ?? 0) + 1
  const duration = lockDurationMs(fails)
  const lockedUntil = duration > 0 ? now + duration : 0
  loginFails.set(key, { fails, lockedUntil })
  if (lockedUntil > now) {
    return {
      locked: true,
      retryAfterSec: Math.max(1, Math.ceil((lockedUntil - now) / 1000)),
      fails,
    }
  }
  return { locked: false, retryAfterSec: 0, fails }
}

export function clearLoginFailures(ip: string): void {
  loginFails.delete(ip || 'unknown')
}

export function resetAuthMemoryForTests(): void {
  tickets.clear()
  stepUps.clear()
  rateBuckets.clear()
  loginFails.clear()
}
