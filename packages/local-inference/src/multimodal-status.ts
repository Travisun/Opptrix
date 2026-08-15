import {
  getSenseVoiceModelsDir,
  type SenseVoiceAssetSource,
} from './paths.js'
import {
  getSenseVoiceReadyInfo,
  isSenseVoiceReady,
} from './sensevoice/sensevoice-runtime.js'
import { isSupportedSenseVoiceModel } from './sensevoice/sensevoice-download.js'
import { isFfmpegAvailable, resolveFfmpegBinaryPath } from './media/ffmpeg-runtime.js'

export type MultimodalRuntimeStatus = {
  platform: string
  ffmpeg: {
    ready: boolean
    path: string | null
  }
  sensevoice: {
    modelName: string
    ready: boolean
    modelsDir: string
    source?: SenseVoiceAssetSource
  }
}

export function getMultimodalRuntimeStatus(
  repoRoot?: string,
  speechModel = 'q8',
): MultimodalRuntimeStatus {
  const ffmpegPath = resolveFfmpegBinaryPath()
  const normalizedModel = speechModel.trim().toLowerCase() || 'q8'
  const modelName = isSupportedSenseVoiceModel(normalizedModel) ? normalizedModel : 'q8'
  const readyInfo = getSenseVoiceReadyInfo(modelName, repoRoot)
  const ffmpegReady = isFfmpegAvailable()

  return {
    platform: process.platform,
    ffmpeg: {
      ready: ffmpegReady,
      path: ffmpegPath,
    },
    sensevoice: {
      modelName,
      ready: isSenseVoiceReady(modelName, repoRoot),
      modelsDir: readyInfo.modelsDir || getSenseVoiceModelsDir(),
      source: readyInfo.source,
    },
  }
}
