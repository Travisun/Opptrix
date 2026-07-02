import { createRequire } from 'node:module'
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { globalInferenceQueue } from '../runtime/job-queue.js'
import { ensureDirAsync, getWhisperModelsDir } from '../paths.js'
import type { WhisperSegment } from '../types.js'

const require = createRequire(import.meta.url)

const WHISPER_MODEL_FILES: Record<string, string> = {
  tiny: 'ggml-tiny.bin',
  'tiny.en': 'ggml-tiny.en.bin',
  base: 'ggml-base.bin',
  'base.en': 'ggml-base.en.bin',
  small: 'ggml-small.bin',
  'small.en': 'ggml-small.en.bin',
  medium: 'ggml-medium.bin',
  'medium.en': 'ggml-medium.en.bin',
  'large-v1': 'ggml-large-v1.bin',
  large: 'ggml-large.bin',
  'large-v3-turbo': 'ggml-large-v3-turbo.bin',
}

export type WhisperTranscribeResult = {
  text: string
  segments: WhisperSegment[]
  lang?: string
}

function resolveWhisperPackageDir(): string {
  try {
    return path.dirname(require.resolve('nodejs-whisper/package.json'))
  } catch {
    throw new Error(
      '未安装语音转写组件 nodejs-whisper。请在项目根目录执行 npm install 后重启服务。',
    )
  }
}

async function loadWhisperEntry() {
  const entry = require.resolve('nodejs-whisper')
  return import(pathToFileURL(entry).href) as Promise<{ nodewhisper: Function }>
}

function runWhisperModelDownloadScript(modelName: string, destDir: string): Promise<void> {
  const pkgDir = resolveWhisperPackageDir()
  const modelsScriptDir = path.join(pkgDir, 'cpp', 'whisper.cpp', 'models')
  const script = process.platform === 'win32' ? 'download-ggml-model.cmd' : './download-ggml-model.sh'

  return new Promise((resolve, reject) => {
    const child = spawn(script, [modelName, destDir], {
      cwd: modelsScriptDir,
      stdio: 'inherit',
      shell: true,
    })
    child.on('error', reject)
    child.on('close', code => {
      if (code === 0) resolve()
      else reject(new Error(`Whisper 模型下载失败（退出码 ${code ?? 'unknown'}）`))
    })
  })
}

async function downloadWhisperModelFile(modelName: string, destDir: string): Promise<void> {
  if (!WHISPER_MODEL_FILES[modelName]) {
    throw new Error(`不支持的 Whisper 模型：${modelName}`)
  }
  await ensureDirAsync(destDir)
  await runWhisperModelDownloadScript(modelName, destDir)
}

export function isWhisperModelInstalled(modelName = 'tiny', modelsDir = getWhisperModelsDir()): boolean {
  const filename = WHISPER_MODEL_FILES[modelName] ?? `ggml-${modelName}.bin`
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
        autoDownloadModelName: modelName,
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
