import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { getModelsDevCatalog, resolveModelsDevProviderMeta } from '@opptrix/agent'
import {
  normalizeProviderProxyMode,
  resolveOutboundProxyInit,
  validateProxyUrlInput,
  type ProviderProxyMode,
  type SystemProxySettings,
} from '@opptrix/shared'
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
  /** inherit = global outbound proxy; none = direct; custom = proxy_url */
  proxy_mode?: ProviderProxyMode
  proxy_url?: string
}

export type { ProviderProxyMode, SystemProxySettings }

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
  system_proxy?: SystemProxySettings
  /** @deprecated migrated to providers */
  llm?: LegacyLlmConfig
}

const DEFAULTS: AppConfig = {
  providers: [],
  default_scorecard: process.env.DEFAULT_SCORECARD ?? 'G=B+M',
  default_top_n: Number(process.env.DEFAULT_TOP_N ?? 20),
}

export type ProviderPresetRegion = 'cn' | 'global' | 'custom'

export interface ProviderPresetSpec {
  id: string
  name: string
  region: ProviderPresetRegion
  /** OpenAI 兼容地址；catalog 缺失或非 OpenAI 路径时使用 */
  fallback_base_url: string
}

export interface ProviderPreset {
  id: string
  name: string
  base_url: string
  region: ProviderPresetRegion
}

/** 有序白名单：中国组 → 海外组 → 自定义；展示名以产品文案为准 */
export const PROVIDER_PRESET_WHITELIST: readonly ProviderPresetSpec[] = [
  { id: 'deepseek', name: 'DeepSeek', region: 'cn', fallback_base_url: 'https://api.deepseek.com/v1' },
  { id: 'minimax-cn', name: 'MiniMax', region: 'cn', fallback_base_url: 'https://api.minimaxi.com/v1' },
  { id: 'moonshotai-cn', name: 'Kimi', region: 'cn', fallback_base_url: 'https://api.moonshot.cn/v1' },
  { id: 'xiaomi', name: 'MiMo', region: 'cn', fallback_base_url: 'https://api.xiaomimimo.com/v1' },
  { id: 'siliconflow-cn', name: 'SiliconFlow (China)', region: 'cn', fallback_base_url: 'https://api.siliconflow.cn/v1' },
  { id: 'alibaba-cn', name: 'Alibaba (China)', region: 'cn', fallback_base_url: 'https://dashscope.aliyuncs.com/compatible-mode/v1' },
  { id: 'zhipuai', name: 'Zhipu AI', region: 'cn', fallback_base_url: 'https://open.bigmodel.cn/api/paas/v4' },
  { id: 'moonshotai', name: 'Moonshot AI', region: 'cn', fallback_base_url: 'https://api.moonshot.ai/v1' },
  { id: 'longcat', name: 'Meituan', region: 'cn', fallback_base_url: 'https://api.longcat.chat/openai' },
  { id: 'openai', name: 'OpenAI', region: 'global', fallback_base_url: 'https://api.openai.com/v1' },
  { id: 'openrouter', name: 'OpenRouter', region: 'global', fallback_base_url: 'https://openrouter.ai/api/v1' },
  {
    id: 'google',
    name: 'Google',
    region: 'global',
    fallback_base_url: 'https://generativelanguage.googleapis.com/v1beta/openai',
  },
  { id: 'meta', name: 'Meta', region: 'global', fallback_base_url: 'https://api.meta.ai/v1' },
  { id: 'ollama', name: '本地 Ollama', region: 'global', fallback_base_url: 'http://127.0.0.1:11434/v1' },
  { id: 'custom', name: '自定义', region: 'custom', fallback_base_url: '' },
]

function isOpenAiCompatibleApi(api: string): boolean {
  const lower = api.toLowerCase()
  // models.dev 上 MiniMax 等可能给出 anthropic 路径，本产品仅接 OpenAI 兼容
  return !lower.includes('/anthropic')
}

/** 仅 trim + 去尾斜杠；不补/不剥版本路径（/v1、/v4 等由预置或用户完整给出）。 */
function normalizeBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, '')
}

/** 用 models.dev 缓存填充 api；miss / 非 OpenAI 兼容时用静态 fallback */
export async function resolveProviderPresets(): Promise<ProviderPreset[]> {
  const catalog = await getModelsDevCatalog()
  return PROVIDER_PRESET_WHITELIST.map((spec) => {
    if (spec.id === 'custom') {
      return { id: spec.id, name: spec.name, base_url: '', region: spec.region }
    }
    const meta = resolveModelsDevProviderMeta(spec.id, catalog)
    const catalogApi = meta?.api?.trim()
    const base_url = catalogApi && isOpenAiCompatibleApi(catalogApi)
      ? normalizeBaseUrl(catalogApi)
      : normalizeBaseUrl(spec.fallback_base_url)
    return {
      id: spec.id,
      name: spec.name,
      base_url,
      region: spec.region,
    }
  })
}

/** @deprecated 同步静态列表；请优先 `resolveProviderPresets()` */
export const PROVIDER_PRESETS: readonly ProviderPreset[] = PROVIDER_PRESET_WHITELIST.map((spec) => ({
  id: spec.id,
  name: spec.name,
  base_url: spec.fallback_base_url,
  region: spec.region,
}))

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
      // 完整兼容根（含路径）；运行时不再自动补 /v1
      base_url: llm?.base_url ?? process.env.LLM_BASE_URL ?? 'https://api.deepseek.com/v1',
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
  const availableModelRefs = new Set(
    providers.flatMap(p => p.models.map(model => `${p.id}:${model}`)),
  )
  const fallbackModel = providers[0]?.models[0]
    ? `${providers[0].id}:${providers[0].models[0]}`
    : undefined
  // 本地配置可能留下已删除 provider 的 default_model；启动时自动回落到第一个可用模型。
  const defaultModel = file.default_model && availableModelRefs.has(file.default_model)
    ? file.default_model
    : fallbackModel

  return {
    providers,
    default_model: defaultModel,
    default_scorecard: file.default_scorecard ?? DEFAULTS.default_scorecard,
    default_top_n: file.default_top_n ?? DEFAULTS.default_top_n,
    system_proxy: normalizeSystemProxy(file.system_proxy),
  }
}

export function saveConfig(partial: Partial<AppConfig>): AppConfig {
  const current = loadConfig()
  const next: AppConfig = {
    ...current,
    ...partial,
    providers: partial.providers ?? current.providers,
    system_proxy: partial.system_proxy ?? current.system_proxy,
  }
  const toWrite = {
    providers: next.providers,
    default_model: next.default_model,
    default_scorecard: next.default_scorecard,
    default_top_n: next.default_top_n,
    system_proxy: next.system_proxy,
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
      proxy_mode: normalizeProviderProxyMode(p.proxy_mode),
      proxy_url: p.proxy_url?.trim() || undefined,
    })),
    available_models,
    default_model: cfg.default_model,
    default_scorecard: cfg.default_scorecard,
    default_top_n: cfg.default_top_n,
    system_proxy: normalizeSystemProxy(cfg.system_proxy),
    llm_configured: cfg.providers.some(p => p.api_key && p.base_url && p.models.length > 0),
  }
}

function normalizeSystemProxy(raw: unknown): SystemProxySettings {
  if (!raw || typeof raw !== 'object') return { enabled: false }
  const rec = raw as Record<string, unknown>
  const enabled = rec.enabled === true
  const url = typeof rec.url === 'string' ? rec.url.trim() : undefined
  return { enabled, ...(url ? { url } : {}) }
}

export function parseSystemProxyInput(raw: unknown): SystemProxySettings {
  const base = normalizeSystemProxy(raw)
  if (base.enabled && base.url) {
    return { enabled: true, url: validateProxyUrlInput(base.url) ?? undefined }
  }
  if (base.enabled && !base.url?.trim()) {
    throw new Error('启用网络代理时请填写代理地址')
  }
  return { enabled: false }
}

export function parseProviderProxyFields(body: {
  proxy_mode?: unknown
  proxy_url?: unknown
}): Pick<StoredProvider, 'proxy_mode' | 'proxy_url'> {
  const mode = normalizeProviderProxyMode(body.proxy_mode)
  if (mode === 'custom') {
    const url = validateProxyUrlInput(typeof body.proxy_url === 'string' ? body.proxy_url : '')
    if (!url) throw new Error('自定义代理模式下请填写代理地址')
    return { proxy_mode: 'custom', proxy_url: url }
  }
  if (mode === 'none') {
    return { proxy_mode: 'none' }
  }
  return { proxy_mode: 'inherit' }
}

export function toAgentProviders(cfg: AppConfig) {
  const system = cfg.system_proxy
  return cfg.providers.map(p => ({
    id: p.id,
    name: p.name,
    baseUrl: p.base_url,
    apiKey: p.api_key,
    models: p.models,
    proxyUrl: resolveOutboundProxyInit(
      { mode: normalizeProviderProxyMode(p.proxy_mode), url: p.proxy_url },
      system,
    ),
  }))
}
