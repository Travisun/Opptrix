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
    provider: process.env.LLM_PROVIDER ?? 'DeepSeek',
    model: process.env.LLM_MODEL ?? 'deepseek-chat',
    api_key: process.env.LLM_API_KEY ?? '',
    base_url: process.env.LLM_BASE_URL ?? 'https://api.deepseek.com',
  },
  default_scorecard: process.env.DEFAULT_SCORECARD ?? '综合评估',
  default_top_n: Number(process.env.DEFAULT_TOP_N ?? 20),
}

function fromFile(): Partial<AppConfig> {
  try {
    if (fs.existsSync(CONFIG_PATH)) {
      return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')) as Partial<AppConfig>
    }
  } catch { /* use defaults */ }
  return {}
}

export function loadConfig(): AppConfig {
  const file = fromFile()
  return {
    default_scorecard: file.default_scorecard ?? DEFAULTS.default_scorecard,
    default_top_n: file.default_top_n ?? DEFAULTS.default_top_n,
    llm: {
      provider: file.llm?.provider ?? DEFAULTS.llm.provider,
      model: file.llm?.model ?? DEFAULTS.llm.model,
      api_key: process.env.LLM_API_KEY || file.llm?.api_key || DEFAULTS.llm.api_key,
      base_url: file.llm?.base_url ?? DEFAULTS.llm.base_url,
    },
  }
}

export function saveConfig(partial: Partial<AppConfig>) {
  const dir = path.dirname(CONFIG_PATH)
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  const current = loadConfig()
  const next: AppConfig = {
    ...current,
    ...partial,
    llm: { ...current.llm, ...partial.llm },
  }
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
