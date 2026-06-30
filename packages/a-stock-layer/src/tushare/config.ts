import fs from 'node:fs'
import path from 'node:path'
import { resolveUserDataRoot } from '@opptrix/shared'

const CONFIG_DIR = resolveUserDataRoot()
const CONFIG_PATH = path.join(CONFIG_DIR, 'tushare-config.json')

export interface TushareRuntimeConfig {
  enabled: boolean
  token: string
}

export interface PublicTushareConfig {
  enabled: boolean
  token: string
  token_configured: boolean
  token_preview: string
  config_path: string
}

const DEFAULTS: TushareRuntimeConfig = {
  enabled: false,
  token: process.env.TUSHARE_TOKEN ?? '',
}

export function tushareConfigPath(): string {
  return CONFIG_PATH
}

export function loadTushareConfig(): TushareRuntimeConfig {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const raw = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) as Partial<TushareRuntimeConfig>
      return {
        enabled: raw.enabled ?? DEFAULTS.enabled,
        token: String(raw.token ?? DEFAULTS.token).trim(),
      }
    }
  } catch { /* defaults */ }
  return { ...DEFAULTS }
}

export function saveTushareConfig(partial: Partial<TushareRuntimeConfig>): TushareRuntimeConfig {
  if (!fs.existsSync(CONFIG_DIR)) fs.mkdirSync(CONFIG_DIR, { recursive: true })
  const current = loadTushareConfig()
  const next: TushareRuntimeConfig = {
    enabled: partial.enabled ?? current.enabled,
    token: partial.token !== undefined ? String(partial.token).trim() : current.token,
  }
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(next, null, 2))
  return next
}

export function isTushareEnabled(cfg = loadTushareConfig()): boolean {
  return cfg.enabled && !!cfg.token
}

export function publicTushareConfig(cfg = loadTushareConfig()): PublicTushareConfig {
  const token = cfg.token
  return {
    enabled: cfg.enabled,
    token,
    token_configured: !!token,
    token_preview: token ? `${token.slice(0, 4)}…${token.slice(-4)}` : '',
    config_path: CONFIG_PATH,
  }
}
