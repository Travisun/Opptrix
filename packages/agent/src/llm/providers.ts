import { createProvider, isConfigured, fetchOpenAiModelList, type LlmConfig } from './provider.js'

export { fetchOpenAiModelList }

export interface ProviderProfile {
  id: string
  name: string
  baseUrl: string
  apiKey: string
  models: string[]
}

export interface AvailableModel {
  ref: string
  model: string
  providerId: string
  providerName: string
}

export function normalizeBaseUrl(url: string): string {
  return url.trim().replace(/\/$/, '')
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
        out.push({
          ref: `${p.id}:${model}`,
          model,
          providerId: p.id,
          providerName: p.name,
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
    }
  }

  createLlm(ref?: string) {
    const cfg = this.resolve(ref)
    if (!cfg || !isConfigured(cfg)) return null
    return createProvider(cfg)
  }
}
