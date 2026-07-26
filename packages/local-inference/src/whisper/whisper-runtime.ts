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
import { ensureWhisperCliBuilt } from './ensure-whisper-cli.js'
import { runWhisperCli } from './run-whisper-cli.js'
import { cleanWhisperTranscript } from './whisper-text.js'

export { cleanWhisperTranscript, COMPOSER_SPEECH_PROMPT } from './whisper-text.js'
export { runWhisperCli } from './run-whisper-cli.js'

const require = createRequire(import.meta.url)

export type WhisperTranscribeResult = {
  text: string
  segments: WhisperSegment[]
  lang?: string
}

export type WhisperTranscribeOptions = {
  /** ISO 639-1 / whisper language code；默认 auto */
  language?: string
  /**
   * whisper.cpp initial prompt。
   * 用于偏置简体中文、股票代码等；不会作为用户可见正文输出。
   */
  prompt?: string
  /**
   * true（默认）：走自研 whisper-cli 封装（支持 prompt）。
   * false：回退 nodejs-whisper（无 prompt）。
   */
  useCli?: boolean
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

  async transcribe(
    wavPath: string,
    modelName = 'tiny',
    opts?: WhisperTranscribeOptions,
  ): Promise<WhisperTranscribeResult> {
    return globalInferenceQueue.enqueue(async () => {
      await this.ensureModel(modelName)
      const language = opts?.language?.trim() || undefined
      const prompt = opts?.prompt?.trim() || undefined
      const useCli = opts?.useCli !== false

      if (useCli) {
        await ensureWhisperCliBuilt()
        const text = await runWhisperCli(wavPath, {
          modelName,
          language: language || 'auto',
          prompt,
        })
        return {
          text,
          segments: text ? [{ text }] : [],
          lang: language || 'auto',
        }
      }

      await ensureWhisperCliBuilt()
      const { nodewhisper } = await loadWhisperEntry()
      const result = await nodewhisper(wavPath, {
        modelName,
        modelRootPath: getWhisperModelsDir(),
        whisperOptions: {
          outputInText: true,
          wordTimestamps: false,
          ...(language ? { language } : {}),
        },
      })

      const text = cleanWhisperTranscript(String(
        (result as { text?: string })?.text
        ?? (typeof result === 'string' ? result : '')
        ?? '',
      ))

      return {
        text,
        segments: text ? [{ text }] : [],
        lang: language,
      }
    })
  }
}

export const whisperRuntime = new WhisperRuntime()
