import type Database from 'better-sqlite3'

export const APP_AUTH_SCHEMA_MIGRATION_KEY = 'app_auth_v1'
export const OWNER_ROW_ID = 'owner'

export const AUTH_SESSION_TTL_DESKTOP_MS = 30 * 24 * 60 * 60 * 1000
export const AUTH_SESSION_TTL_WEB_MS = 12 * 60 * 60 * 1000

export function initAppAuthSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS app_owner (
      id TEXT PRIMARY KEY,
      username TEXT NOT NULL,
      password_salt BLOB NOT NULL,
      password_hash BLOB NOT NULL,
      totp_secret_enc BLOB,
      totp_secret_iv BLOB,
      totp_secret_tag BLOB,
      totp_enabled INTEGER NOT NULL DEFAULT 0,
      recovery_codes_json TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS auth_sessions (
      id TEXT PRIMARY KEY,
      token_hash TEXT NOT NULL UNIQUE,
      label TEXT,
      client_ip TEXT,
      user_agent TEXT,
      created_at TEXT NOT NULL,
      last_seen_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      desktop INTEGER NOT NULL DEFAULT 0
    );
  `)
}
