import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { resolveWhisperModelFilename } from './whisper-download.js'
import { ensureWhisperCliBuilt, findWhisperCliExecutable } from './ensure-whisper-cli.js'
import { getWhisperModelsDir } from '../paths.js'
import { cleanWhisperTranscript } from './whisper-text.js'

export type WhisperCliRunOptions = {
  modelName?: string
  /** ISO 639-1；默认 auto（新闻 enrichment 等）；Composer 语音应显式传 zh */
  language?: string
  /** whisper.cpp --prompt：引导简体、专有名词与数字代码 */
  prompt?: string
}

function resolveModelPath(modelName: string, modelsDir: string): string {
  const filename = resolveWhisperModelFilename(modelName)
  return path.resolve(modelsDir, filename)
}

/**
 * 直接调用 whisper-cli（支持 --prompt）；绕过 nodejs-whisper 未暴露的参数。
 */
export async function runWhisperCli(
  wavPath: string,
  opts: WhisperCliRunOptions = {},
): Promise<string> {
  const modelName = opts.modelName?.trim() || 'tiny'
  const language = opts.language?.trim() || 'auto'
  const modelsDir = getWhisperModelsDir()
  const modelPath = resolveModelPath(modelName, modelsDir)
  if (!fs.existsSync(modelPath)) {
    throw new Error(`Whisper 模型文件不存在：${modelPath}`)
  }
  if (!fs.existsSync(wavPath)) {
    throw new Error(`音频文件不存在：${wavPath}`)
  }

  await ensureWhisperCliBuilt()
  const exe = findWhisperCliExecutable()
  if (!exe) {
    throw new Error('未找到 whisper-cli，请确认已安装 CMake 并完成编译')
  }

  const args = [
    '-l', language,
    '-m', modelPath,
    '-f', wavPath,
    '-nt',
    '-np',
  ]

  const prompt = opts.prompt?.trim()
  if (prompt) {
    args.push('--prompt', prompt)
  }

  return new Promise((resolve, reject) => {
    const child = spawn(exe, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: process.env,
    })
    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => { stdout += String(chunk) })
    child.stderr.on('data', (chunk) => { stderr += String(chunk) })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code !== 0) {
        reject(new Error(stderr.trim() || `whisper-cli exited ${code}`))
        return
      }
      resolve(cleanWhisperTranscript(stdout))
    })
  })
}
