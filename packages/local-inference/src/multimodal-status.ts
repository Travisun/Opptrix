import { createRequire } from 'node:module'
import {
  getMtmdCliStatus,
  getLlamaCppToolsDir,
  probeMtmdCliPath,
} from './vision/mtmd-binary.js'
import { resolveVisionModelPaths } from './catalog/installed.js'
import { getWhisperModelsDir } from './paths.js'
import fs from 'node:fs'

const require = createRequire(import.meta.url)

export type MultimodalRuntimeStatus = {
  platform: string
  ffmpeg: {
    ready: boolean
    path: string | null
  }
  vision: {
    modelInstalled: boolean
    mmprojInstalled: boolean
    modelName: string | null
    mmprojName: string | null
    mtmdSupported: boolean
    mtmdReady: boolean
    mtmdPath: string | null
    mtmdRelease: string
    mtmdToolsDir: string
  }
  whisper: {
    modelName: string
    ready: boolean
    modelsDir: string
  }
  canEnrichOffline: boolean
}

function isWhisperModelCached(modelName: string): boolean {
  try {
    const files = fs.readdirSync(getWhisperModelsDir())
    const key = modelName.toLowerCase()
    return files.some(name => name.toLowerCase().includes(key))
  } catch {
    return false
  }
}

export function getMultimodalRuntimeStatus(
  repoRoot?: string,
  whisperModel = 'tiny',
): MultimodalRuntimeStatus {
  const mtmdStatus = getMtmdCliStatus()
  const mtmdPath = probeMtmdCliPath(mtmdStatus.release)
  const visionPaths = resolveVisionModelPaths(repoRoot)

  let ffmpegPath: string | null = null
  try {
    ffmpegPath = require('ffmpeg-static') as string | null
  } catch {
    ffmpegPath = process.env.FFMPEG_PATH ?? null
  }

  const modelInstalled = Boolean(visionPaths?.modelPath)
  const mmprojInstalled = Boolean(visionPaths?.mmprojPath)
  const mtmdReady = Boolean(mtmdPath)
  const whisperReady = isWhisperModelCached(whisperModel)
  const ffmpegReady = Boolean(ffmpegPath)

  return {
    platform: mtmdStatus.platform,
    ffmpeg: {
      ready: ffmpegReady,
      path: ffmpegPath,
    },
    vision: {
      modelInstalled,
      mmprojInstalled,
      modelName: visionPaths?.modelPath?.split(/[/\\]/).pop() ?? null,
      mmprojName: visionPaths?.mmprojPath?.split(/[/\\]/).pop() ?? null,
      mtmdSupported: mtmdStatus.supported,
      mtmdReady,
      mtmdPath,
      mtmdRelease: mtmdStatus.release,
      mtmdToolsDir: getLlamaCppToolsDir(mtmdStatus.release),
    },
    whisper: {
      modelName: whisperModel,
      ready: whisperReady,
      modelsDir: getWhisperModelsDir(),
    },
    canEnrichOffline: ffmpegReady
      && modelInstalled
      && mmprojInstalled
      && (mtmdReady || mtmdStatus.supported),
  }
}
