import type { AppConfig } from '../api/client'

export interface LlmActiveSummary {
  providerName: string
  model: string
  totalModels: number
}

export function resolveActiveLlmFromConfig(cfg: AppConfig): LlmActiveSummary | null {
  if (!cfg.llm_configured) return null
  const models = cfg.available_models ?? []
  if (!models.length) return null

  const ref = cfg.default_model?.trim() || models[0]!.ref
  const active = models.find(m => m.ref === ref) ?? models[0]!
  return {
    providerName: active.providerName,
    model: active.model,
    totalModels: models.length,
  }
}
