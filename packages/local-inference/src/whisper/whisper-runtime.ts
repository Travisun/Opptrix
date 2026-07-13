import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { globalInferenceQueue } from '../runtime/job-queue.js'
import { ensureDirAsync, getWhisperModelsDir } from '../paths.js'
import type { WhisperSegment } from '../types.js'
import {
  downloadWhisperModelFile,
  resolveWhisperModelFilename,
} from './whisper-download.js'

const require = createRequire(import.meta.url)

export type WhisperTranscribeResult = {
  text: string
  segments: WhisperSegment[]
  lang?: string
}

async function loadWhisperEntry() {
  try {
    require.resolve('nodejs-whisper/package.json')
  } catch {
    throw new Error(
      '未安装语音转写组件 nodejs-whisper。请在项目根目录执行 npm install 后重启服务。',
    )
  }
  const entry = require.resolve('nodejs-whisper')
  return import(pathToFileURL(entry).href) as Promise<{ nodewhisper: Function }>
}

export function isWhisperModelInstalled(modelName = 'tiny', modelsDir = getWhisperModelsDir()): boolean {
  const filename = resolveWhisperModelFilename(modelName)
  try {
    return fs.existsSync(path.join(modelsDir, filename))
  } catch {
    return false
  }
}

export class WhisperRuntime {
  async ensureModel(modelName = 'tiny'): Promise<void> {
    await ensureDirAsync(getWhisperModelsDir())
    if (isWhisperModelInstalled(modelName)) return

    await downloadWhisperModelFile(modelName, getWhisperModelsDir())
    if (!isWhisperModelInstalled(modelName)) {
      throw new Error(`Whisper 模型 ${modelName} 下载后仍未找到，请检查网络或稍后重试`)
    }
  }

  async transcribe(wavPath: string, modelName = 'tiny'): Promise<WhisperTranscribeResult> {
    return globalInferenceQueue.enqueue(async () => {
      await this.ensureModel(modelName)
      const { nodewhisper } = await loadWhisperEntry()
      const result = await nodewhisper(wavPath, {
        modelName,
        modelRootPath: getWhisperModelsDir(),
        whisperOptions: {
          outputInText: true,
          wordTimestamps: false,
        },
      })

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
