import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const CONFIG_PATH = path.resolve(__dirname, '../data/config.json')

export interface LlmConfig {
  provider: string
  model: string
  api_key: string
  base_url: string
}

export interface AppConfig {
  llm: LlmConfig
  default_scorecard: string
  default_top_n: number
}

const DEFAULTS: AppConfig = {
  llm: {
    provider: 'DeepSeek',
    model: 'deepseek-chat',
    api_key: '',
    base_url: 'https://api.deepseek.com',
  },
  default_scorecard: '综合评估',
  default_top_n: 20,
}

export function loadConfig(): AppConfig {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      const raw = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) as Partial<AppConfig>
      return {
        ...DEFAULTS,
        ...raw,
        llm: { ...DEFAULTS.llm, ...raw.llm },
      }
    }
  } catch { /* use defaults */ }
  return { ...DEFAULTS }
}

export function saveConfig(partial: Partial<AppConfig>) {
  const dir = path.dirname(CONFIG_PATH)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  const next = { ...loadConfig(), ...partial, llm: { ...loadConfig().llm, ...partial.llm } }
  fs.writeFileSync(CONFIG_PATH, JSON.stringify(next, null, 2))
  return next
}

export function publicConfig(cfg: AppConfig) {
  return {
    llm: {
      provider: cfg.llm.provider,
      model: cfg.llm.model,
      api_key_configured: !!cfg.llm.api_key,
      base_url: cfg.llm.base_url,
    },
    default_scorecard: cfg.default_scorecard,
    default_top_n: cfg.default_top_n,
  }
}
