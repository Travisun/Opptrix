import { randomUUID } from 'node:crypto'
import type Database from 'better-sqlite3'
import { generateSessionToken, hashSessionToken } from './app-auth-crypto.js'
import { AUTH_SESSION_TTL_DESKTOP_MS, AUTH_SESSION_TTL_WEB_MS } from './app-auth-schema.js'

export interface AuthSessionRow {
  id: string
  token_hash: string
  label: string | null
  client_ip: string | null
  user_agent: string | null
  created_at: string
  last_seen_at: string
  expires_at: string
  desktop: number
}

export interface AuthSessionPublic {
  id: string
  label: string | null
  client_ip: string | null
  user_agent: string | null
  created_at: string
  last_seen_at: string
  expires_at: string
  desktop: boolean
}

export interface CreateSessionInput {
  tokenPlain: string
  label?: string
  clientIp?: string
  userAgent?: string
  desktop?: boolean
  ttlMs?: number
}

function nowIso(): string {
  return new Date().toISOString()
}

function asSession(row: AuthSessionRow): AuthSessionPublic {
  return {
    id: row.id,
    label: row.label,
    client_ip: row.client_ip,
    user_agent: row.user_agent,
    created_at: row.created_at,
    last_seen_at: row.last_seen_at,
    expires_at: row.expires_at,
    desktop: row.desktop === 1,
  }
}

export function insertAuthSession(
  db: Database.Database,
  input: CreateSessionInput,
): { id: string; expires_at: string } {
  const desktop = Boolean(input.desktop)
  const ttl = input.ttlMs
    ?? (desktop ? AUTH_SESSION_TTL_DESKTOP_MS : AUTH_SESSION_TTL_WEB_MS)
  const id = randomUUID()
  const created = nowIso()
  const expires = new Date(Date.now() + ttl).toISOString()
  db.prepare(`
    INSERT INTO auth_sessions(
      id, token_hash, label, client_ip, user_agent, created_at, last_seen_at, expires_at, desktop
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    hashSessionToken(input.tokenPlain),
    input.label?.slice(0, 120) ?? null,
    input.clientIp?.slice(0, 64) ?? null,
    input.userAgent?.slice(0, 240) ?? null,
    created,
    created,
    expires,
    desktop ? 1 : 0,
  )
  return { id, expires_at: expires }
}

export function issueAuthSession(
  db: Database.Database,
  input: Omit<CreateSessionInput, 'tokenPlain'>,
): { id: string; token: string; expires_at: string } {
  const token = generateSessionToken()
  const created = insertAuthSession(db, { ...input, tokenPlain: token })
  return { id: created.id, token, expires_at: created.expires_at }
}

export function touchAuthSession(db: Database.Database, id: string): void {
  db.prepare('UPDATE auth_sessions SET last_seen_at = ? WHERE id = ?').run(nowIso(), id)
}

export function revokeAuthSession(db: Database.Database, id: string): boolean {
  return db.prepare('DELETE FROM auth_sessions WHERE id = ?').run(id).changes > 0
}

export function getAuthSessionByTokenHash(
  db: Database.Database,
  hash: string,
): AuthSessionRow | null {
  const row = db.prepare(
    'SELECT * FROM auth_sessions WHERE token_hash = ?',
  ).get(hash) as AuthSessionRow | undefined
  if (!row) return null
  if (Date.parse(row.expires_at) <= Date.now()) {
    revokeAuthSession(db, row.id)
    return null
  }
  return row
}

export function listAuthSessions(db: Database.Database): AuthSessionPublic[] {
  const rows = db.prepare(`
    SELECT * FROM auth_sessions WHERE expires_at > ? ORDER BY last_seen_at DESC
  `).all(nowIso()) as AuthSessionRow[]
  return rows.map(asSession)
}

export function revokeAllAuthSessions(db: Database.Database, exceptId?: string): number {
  if (exceptId) {
    return db.prepare('DELETE FROM auth_sessions WHERE id != ?').run(exceptId).changes
  }
  return db.prepare('DELETE FROM auth_sessions').run().changes
}

export function wipeAuthTables(db: Database.Database): void {
  db.exec('DELETE FROM auth_sessions; DELETE FROM app_owner;')
}
