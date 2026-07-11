import { createRequire } from 'node:module'
import { isWhisperModelInstalled } from './whisper/whisper-runtime.js'
import { getWhisperModelsDir } from './paths.js'

const require = createRequire(import.meta.url)

export type MultimodalRuntimeStatus = {
  platform: string
  ffmpeg: {
    ready: boolean
    path: string | null
  }
  whisper: {
    modelName: string
    ready: boolean
    modelsDir: string
  }
}

export function getMultimodalRuntimeStatus(
  _repoRoot?: string,
  whisperModel = 'tiny',
): MultimodalRuntimeStatus {
  let ffmpegPath: string | null = null
  try {
    ffmpegPath = require('ffmpeg-static') as string | null
  } catch {
    ffmpegPath = process.env.FFMPEG_PATH ?? null
  }

  const whisperReady = isWhisperModelInstalled(whisperModel)
  const ffmpegReady = Boolean(ffmpegPath)

  return {
    platform: process.platform,
    ffmpeg: {
      ready: ffmpegReady,
      path: ffmpegPath,
    },
    whisper: {
      modelName: whisperModel,
      ready: whisperReady,
      modelsDir: getWhisperModelsDir(),
    },
  }
}
