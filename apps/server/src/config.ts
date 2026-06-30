import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { getUserDataStore } from '@opptrix/user-store'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const LEGACY_CONFIG_PATH = path.resolve(__dirname, '../data/config.json')
const NAMESPACE = 'app_config'
const DOC_ID = 'default'

export interface StoredProvider {
  id: string
  name: string
  base_url: string
  api_key: string
  models: string[]
}

export interface LegacyLlmConfig {
  provider: string
  model: string
  api_key: string
  base_url: string
}

export interface AppConfig {
  providers: StoredProvider[]
  default_model?: string
  default_scorecard: string
  default_top_n: number
  /** @deprecated migrated to providers */
  llm?: LegacyLlmConfig
}

const DEFAULTS: AppConfig = {
  providers: [],
  default_scorecard: process.env.DEFAULT_SCORECARD ?? '综合评估',
  default_top_n: Number(process.env.DEFAULT_TOP_N ?? 20),
}

export const PROVIDER_PRESETS = [
  { id: 'deepseek', name: 'DeepSeek', base_url: 'https://api.deepseek.com' },
  { id: 'openai', name: 'OpenAI', base_url: 'https://api.openai.com' },
  { id: 'moonshot', name: 'Moonshot', base_url: 'https://api.moonshot.cn' },
  { id: 'custom', name: '自定义', base_url: '' },
] as const

function migrateLegacy(file: Partial<AppConfig> & { llm?: LegacyLlmConfig }): StoredProvider[] {
  if (file.providers?.length) return file.providers
  const llm = file.llm
  const envKey = process.env.LLM_API_KEY ?? ''
  if (llm?.api_key || envKey) {
    const id = randomUUID()
    const model = llm?.model ?? process.env.LLM_MODEL ?? 'deepseek-chat'
    return [{
      id,
      name: llm?.provider ?? process.env.LLM_PROVIDER ?? 'DeepSeek',
      base_url: llm?.base_url ?? process.env.LLM_BASE_URL ?? 'https://api.deepseek.com',
      api_key: envKey || llm?.api_key || '',
      models: [model],
    }]
  }
  return []
}

function readLegacyConfigFile(): Partial<AppConfig> & { llm?: LegacyLlmConfig } {
  try {
    if (fs.existsSync(LEGACY_CONFIG_PATH)) {
      return JSON.parse(fs.readFileSync(LEGACY_CONFIG_PATH, 'utf8')) as Partial<AppConfig> & { llm?: LegacyLlmConfig }
    }
  } catch { /* use defaults */ }
  return {}
}

function readStoredConfig(): Partial<AppConfig> & { llm?: LegacyLlmConfig } {
  const fromDb = getUserDataStore().getDocument<Partial<AppConfig> & { llm?: LegacyLlmConfig }>(NAMESPACE, DOC_ID)
  if (fromDb) return fromDb
  const legacy = readLegacyConfigFile()
  if (Object.keys(legacy).length) {
    getUserDataStore().setDocument(NAMESPACE, DOC_ID, legacy)
  }
  return legacy
}

export function loadConfig(): AppConfig {
  const file = readStoredConfig()
  const providers = migrateLegacy(file)
  const defaultModel = file.default_model
    ?? (providers[0] ? `${providers[0].id}:${providers[0].models[0]}` : undefined)

  return {
    providers,
    default_model: defaultModel,
    default_scorecard: file.default_scorecard ?? DEFAULTS.default_scorecard,
    default_top_n: file.default_top_n ?? DEFAULTS.default_top_n,
  }
}

export function saveConfig(partial: Partial<AppConfig>): AppConfig {
  const current = loadConfig()
  const next: AppConfig = {
    ...current,
    ...partial,
    providers: partial.providers ?? current.providers,
  }
  const toWrite = {
    providers: next.providers,
    default_model: next.default_model,
    default_scorecard: next.default_scorecard,
    default_top_n: next.default_top_n,
  }
  getUserDataStore().setDocument(NAMESPACE, DOC_ID, toWrite)
  return next
}

export function publicConfig(cfg: AppConfig) {
  const available_models = cfg.providers.flatMap(p =>
    p.models.map(model => ({
      ref: `${p.id}:${model}`,
      model,
      provider_id: p.id,
      provider_name: p.name,
    })),
  ).filter(() => true)

  return {
    providers: cfg.providers.map(p => ({
      id: p.id,
      name: p.name,
      base_url: p.base_url,
      models: p.models,
      api_key_configured: !!p.api_key,
    })),
    available_models,
    default_model: cfg.default_model,
    default_scorecard: cfg.default_scorecard,
    default_top_n: cfg.default_top_n,
    llm_configured: cfg.providers.some(p => p.api_key && p.base_url && p.models.length > 0),
  }
}

export function toAgentProviders(cfg: AppConfig) {
  return cfg.providers.map(p => ({
    id: p.id,
    name: p.name,
    baseUrl: p.base_url,
    apiKey: p.api_key,
    models: p.models,
  }))
}
