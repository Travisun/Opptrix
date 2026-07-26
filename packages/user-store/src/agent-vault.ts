/**
 * Agent 密钥保险箱 — AES-256-GCM 加密存储。
 * 明文仅经 getPlain() 供 host 注入 sentinel；list/HTTP 永不返回明文。
 */
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import type Database from 'better-sqlite3'
import { resolveUserDataRoot } from '@opptrix/shared'

const VAULT_KEY_FILE = 'vault.key'
const KEY_BYTES = 32
const IV_BYTES = 12

export interface VaultSecretMeta {
  name: string
  hint?: string
  updatedAt: string
  injectHosts?: string[]
}

export interface VaultPutOpts {
  injectHosts?: string[]
  /** 覆盖已有条目；默认 false */
  overwrite?: boolean
}

interface VaultRow {
  name: string
  ciphertext: Buffer
  iv: Buffer
  tag: Buffer
  hint: string | null
  inject_hosts_json: string
  updated_at: string
}

function resolveVaultKeyPath(): string {
  const fromEnv = process.env.OPPTRIX_VAULT_KEY_PATH?.trim()
  if (fromEnv) return fromEnv
  // 固定在 resolveUserDataRoot 下（默认 ~/.opptrix/vault.key），mode 0600
  return path.join(resolveUserDataRoot(), VAULT_KEY_FILE)
}

function loadOrCreateVaultKey(): Buffer {
  const keyPath = resolveVaultKeyPath()
  fs.mkdirSync(path.dirname(keyPath), { recursive: true })
  if (fs.existsSync(keyPath)) {
    const buf = fs.readFileSync(keyPath)
    if (buf.length !== KEY_BYTES) {
      throw new Error('vault.key 长度无效，请勿手动编辑')
    }
    return buf
  }
  const key = crypto.randomBytes(KEY_BYTES)
  fs.writeFileSync(keyPath, key, { mode: 0o600 })
  try {
    fs.chmodSync(keyPath, 0o600)
  } catch {
    /* Windows 等可能不支持 chmod */
  }
  return key
}

function hintFromValue(value: string): string | undefined {
  const trimmed = value.trim()
  if (trimmed.length < 4) return undefined
  return trimmed.slice(-4)
}

function parseInjectHosts(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.map(h => String(h ?? '').trim()).filter(Boolean)
  } catch {
    return []
  }
}

export function initAgentVaultSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS agent_vault (
      name TEXT PRIMARY KEY,
      ciphertext BLOB NOT NULL,
      iv BLOB NOT NULL,
      tag BLOB NOT NULL,
      hint TEXT,
      inject_hosts_json TEXT NOT NULL DEFAULT '[]',
      updated_at TEXT NOT NULL
    );
  `)
}

export class AgentVaultRepository {
  private key: Buffer | null = null

  constructor(private readonly db: Database.Database) {
    initAgentVaultSchema(db)
  }

  private masterKey(): Buffer {
    if (!this.key) this.key = loadOrCreateVaultKey()
    return this.key
  }

  private encrypt(plain: string): { ciphertext: Buffer; iv: Buffer; tag: Buffer } {
    const iv = crypto.randomBytes(IV_BYTES)
    const cipher = crypto.createCipheriv('aes-256-gcm', this.masterKey(), iv)
    const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()])
    const tag = cipher.getAuthTag()
    return { ciphertext: enc, iv, tag }
  }

  private decrypt(row: VaultRow): string {
    const decipher = crypto.createDecipheriv('aes-256-gcm', this.masterKey(), row.iv)
    decipher.setAuthTag(row.tag)
    const plain = Buffer.concat([decipher.update(row.ciphertext), decipher.final()])
    return plain.toString('utf8')
  }

  listSecrets(): VaultSecretMeta[] {
    const rows = this.db.prepare(`
      SELECT name, hint, inject_hosts_json, updated_at
      FROM agent_vault
      ORDER BY name COLLATE NOCASE ASC
    `).all() as Array<{
      name: string
      hint: string | null
      inject_hosts_json: string
      updated_at: string
    }>
    return rows.map(r => ({
      name: r.name,
      hint: r.hint ?? undefined,
      updatedAt: r.updated_at,
      injectHosts: parseInjectHosts(r.inject_hosts_json),
    }))
  }

  has(name: string): boolean {
    const n = name.trim()
    if (!n) return false
    const row = this.db.prepare('SELECT 1 AS ok FROM agent_vault WHERE name = ?').get(n) as
      | { ok: number }
      | undefined
    return Boolean(row)
  }

  /** 仅供 host 注入 sentinel；禁止写入日志或返回给 LLM/HTTP 列表 */
  getPlain(name: string): string | null {
    const n = name.trim()
    if (!n) return null
    const row = this.db.prepare(`
      SELECT name, ciphertext, iv, tag, hint, inject_hosts_json, updated_at
      FROM agent_vault WHERE name = ?
    `).get(n) as VaultRow | undefined
    if (!row) return null
    return this.decrypt(row)
  }

  getMeta(name: string): VaultSecretMeta | null {
    const n = name.trim()
    if (!n) return null
    const row = this.db.prepare(`
      SELECT name, hint, inject_hosts_json, updated_at
      FROM agent_vault WHERE name = ?
    `).get(n) as {
      name: string
      hint: string | null
      inject_hosts_json: string
      updated_at: string
    } | undefined
    if (!row) return null
    return {
      name: row.name,
      hint: row.hint ?? undefined,
      updatedAt: row.updated_at,
      injectHosts: parseInjectHosts(row.inject_hosts_json),
    }
  }

  put(name: string, value: string, opts?: VaultPutOpts): { ok: true } | { exists: true; need_overwrite: true } {
    const n = name.trim()
    if (!n) throw new Error('密钥名称不能为空')
    if (!value) throw new Error('密钥内容不能为空')
    if (this.has(n) && !opts?.overwrite) {
      return { exists: true, need_overwrite: true }
    }
    const { ciphertext, iv, tag } = this.encrypt(value)
    const hosts = opts?.injectHosts?.map(h => String(h).trim()).filter(Boolean) ?? []
    const updatedAt = new Date().toISOString()
    this.db.prepare(`
      INSERT INTO agent_vault(name, ciphertext, iv, tag, hint, inject_hosts_json, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(name) DO UPDATE SET
        ciphertext = excluded.ciphertext,
        iv = excluded.iv,
        tag = excluded.tag,
        hint = excluded.hint,
        inject_hosts_json = excluded.inject_hosts_json,
        updated_at = excluded.updated_at
    `).run(
      n,
      ciphertext,
      iv,
      tag,
      hintFromValue(value) ?? null,
      JSON.stringify(hosts),
      updatedAt,
    )
    return { ok: true }
  }

  delete(name: string): boolean {
    const n = name.trim()
    if (!n) return false
    const result = this.db.prepare('DELETE FROM agent_vault WHERE name = ?').run(n)
    return result.changes > 0
  }

  updateMeta(name: string, opts: { injectHosts?: string[] }): boolean {
    const n = name.trim()
    if (!n || !this.has(n)) return false
    const hosts = opts.injectHosts?.map(h => String(h).trim()).filter(Boolean) ?? []
    const updatedAt = new Date().toISOString()
    this.db.prepare(`
      UPDATE agent_vault
      SET inject_hosts_json = ?, updated_at = ?
      WHERE name = ?
    `).run(JSON.stringify(hosts), updatedAt, n)
    return true
  }
}
