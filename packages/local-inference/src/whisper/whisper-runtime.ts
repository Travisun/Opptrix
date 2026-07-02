import { globalInferenceQueue } from '../runtime/job-queue.js'
import { ensureDirAsync, getWhisperModelsDir } from '../paths.js'
import type { WhisperSegment } from '../types.js'

export type WhisperTranscribeResult = {
  text: string
  segments: WhisperSegment[]
  lang?: string
}

let whisperReady = false

async function ensureWhisper(): Promise<typeof import('nodejs-whisper')> {
  await ensureDirAsync(getWhisperModelsDir())
  return import('nodejs-whisper')
}

export class WhisperRuntime {
  async ensureModel(modelName = 'tiny'): Promise<void> {
    if (whisperReady) return
    const mod = await ensureWhisper()
    if (typeof mod.nodewhisper === 'function') {
      whisperReady = true
      return
    }
    throw new Error('nodejs-whisper 未安装')
  }

  async transcribe(wavPath: string, modelName = 'tiny'): Promise<WhisperTranscribeResult> {
    return globalInferenceQueue.enqueue(async () => {
      const { nodewhisper } = await ensureWhisper()
      const result = await nodewhisper(wavPath, {
        modelName,
        autoDownloadModelName: modelName,
        modelRootPath: getWhisperModelsDir(),
        whisperOptions: {
          outputInText: true,
          wordTimestamps: false,
        },
      } as Parameters<typeof nodewhisper>[1])

      const text = String(
        (result as { text?: string })?.text
        ?? (typeof result === 'string' ? result : '')
        ?? '',
      ).trim()

      return {
        text,
        segments: text ? [{ text }] : [],
        lang: undefined,
      }
    })
  }
}

export const whisperRuntime = new WhisperRuntime()
