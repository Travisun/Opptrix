import type { DownloadProgress } from '../types.js'
import { bootstrapModels } from './download.js'
import { TRANSLATION_BOOTSTRAP_MODEL_IDS } from './models.js'

export type TranslationBootstrapSettings = {
  service_mode?: 'offline' | 'remote'
}

export type EnrichmentBootstrapSettings = {
  enabled?: boolean
  extract_audio?: boolean
  extract_video?: boolean
  offline_whisper_model?: string
}

export function isOfflineTranslationEnabled(settings: TranslationBootstrapSettings): boolean {
  return settings.service_mode === 'offline'
}

export function shouldBootstrapWhisper(settings: EnrichmentBootstrapSettings): boolean {
  return Boolean(
    settings.enabled
    && (settings.extract_audio || settings.extract_video),
  )
}

/** 离线翻译开启且本地无 HY-MT 时后台下载 */
export async function maybeBootstrapTranslationModel(
  settings: TranslationBootstrapSettings,
  onProgress?: (p: DownloadProgress) => void,
): Promise<void> {
  if (!isOfflineTranslationEnabled(settings)) return
  await bootstrapModels(TRANSLATION_BOOTSTRAP_MODEL_IDS, onProgress)
}
