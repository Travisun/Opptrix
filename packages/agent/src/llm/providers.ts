import { createProvider, isConfigured, fetchOpenAiModelList, type LlmConfig } from './provider.js'
import { resolveModelContextTokens } from './model-context.js'
import {
  resolveModelContextTokensAsync,
  resolveModelMediaCapabilitiesAsync,
  defaultTextOnlyMediaCapabilities,
} from './models-dev-context.js'
import type { ModelMediaCapabilities } from '../media-types.js'

export { fetchOpenAiModelList }

export interface ProviderProfile {
  id: string
  name: string
  baseUrl: string
  apiKey: string
  models: string[]
  /** Resolved outbound proxy; `false` forces direct (ignore process default). */
  proxyUrl?: string | false
}

export interface AvailableModel {
  ref: string
  model: string
  providerId: string
  providerName: string
  /** 启发式上下文窗口（tokens） */
  contextTokens: number
  /** 是否支持附件上传 */
  attachment?: boolean
  inputModalities?: import('../media-types.js').MediaKind[]
  outputModalities?: import('../media-types.js').MediaKind[]
  attachmentLimits?: import('../media-types.js').AttachmentLimits
  /** 嵌套媒体能力（与上述字段等价，便于 API 消费） */
  media?: ModelMediaCapabilities
}

/** 仅 trim + 去尾斜杠；不补/不剥 /v1 等路径段。 */
export function normalizeBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, '')
}

export class ProviderRegistry {
  private defaultModelRef?: string

  constructor(private providers: ProviderProfile[] = []) {}

  setProviders(providers: ProviderProfile[], defaultModelRef?: string) {
    this.providers = providers
    this.defaultModelRef = defaultModelRef
  }

  get configured() {
    return this.providers.some(p => p.apiKey && p.baseUrl && p.models.length > 0)
  }

  listAvailable(): AvailableModel[] {
    const out: AvailableModel[] = []
    for (const p of this.providers) {
      if (!p.apiKey || !p.baseUrl) continue
      for (const model of p.models) {
        const media = defaultTextOnlyMediaCapabilities()
        out.push({
          ref: `${p.id}:${model}`,
          model,
          providerId: p.id,
          providerName: p.name,
          contextTokens: resolveModelContextTokens(model),
          attachment: media.attachment,
          inputModalities: media.input,
          outputModalities: media.output,
          attachmentLimits: media.limits,
          media,
        })
      }
    }
    return out
  }

  async listAvailableAsync(): Promise<AvailableModel[]> {
    const out: AvailableModel[] = []
    for (const p of this.providers) {
      if (!p.apiKey || !p.baseUrl) continue
      for (const model of p.models) {
        const [contextTokens, media] = await Promise.all([
          resolveModelContextTokensAsync(model, p.id),
          resolveModelMediaCapabilitiesAsync(model, p.id),
        ])
        out.push({
          ref: `${p.id}:${model}`,
          model,
          providerId: p.id,
          providerName: p.name,
          contextTokens,
          attachment: media.attachment,
          inputModalities: media.input,
          outputModalities: media.output,
          attachmentLimits: media.limits,
          media,
        })
      }
    }
    return out
  }

  resolve(ref?: string): LlmConfig | null {
    const available = this.listAvailable()
    if (!available.length) return null

    let target = ref?.trim()
    if (!target) target = this.defaultModelRef
    if (!target && available[0]) target = available[0].ref

    if (target) {
      const byRef = available.find(m => m.ref === target)
      if (byRef) {
        const p = this.providers.find(x => x.id === byRef.providerId)
        if (p) return this.toLlmConfig(p, byRef.model)
      }
      // legacy: bare model id
      for (const p of this.providers) {
        if (p.models.includes(target)) return this.toLlmConfig(p, target)
      }
    }
    return null
  }

  private toLlmConfig(p: ProviderProfile, model: string): LlmConfig {
    return {
      provider: p.name,
      apiKey: p.apiKey,
      model,
      baseUrl: normalizeBaseUrl(p.baseUrl),
      ...(p.proxyUrl !== undefined ? { proxyUrl: p.proxyUrl } : {}),
    }
  }

  createLlm(ref?: string) {
    const cfg = this.resolve(ref)
    if (!cfg || !isConfigured(cfg)) return null
    return createProvider(cfg)
  }
}
