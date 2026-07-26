import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import {
  getSenseVoiceVadFilename,
  resolveSenseVoiceModelFilename,
} from './sensevoice-download.js'
import { ensureSenseVoiceRuntime, findSenseVoiceExecutable } from './ensure-sensevoice.js'
import { listSenseVoiceModelSearchDirs } from '../paths.js'
import { cleanSenseVoiceTranscript } from './sensevoice-text.js'

export type SenseVoiceCliRunOptions = {
  modelName?: string
  repoRoot?: string
}

function resolveAssetPath(filename: string, searchDirs: string[]): string {
  for (const dir of searchDirs) {
    const candidate = path.resolve(dir, filename)
    if (fs.existsSync(candidate)) return candidate
  }
  throw new Error(`SenseVoice 资源文件不存在：${filename}`)
}

export async function runSenseVoiceCli(
  wavPath: string,
  opts: SenseVoiceCliRunOptions = {},
): Promise<string> {
  const modelName = opts.modelName?.trim() || 'q8'
  const searchDirs = listSenseVoiceModelSearchDirs(opts.repoRoot)
  const modelPath = resolveAssetPath(resolveSenseVoiceModelFilename(modelName), searchDirs)
  const vadPath = resolveAssetPath(getSenseVoiceVadFilename(), searchDirs)

  if (!fs.existsSync(wavPath)) {
    throw new Error(`音频文件不存在：${wavPath}`)
  }

  await ensureSenseVoiceRuntime()
  const exe = findSenseVoiceExecutable()
  if (!exe) {
    throw new Error('未找到 SenseVoice 可执行文件，请确认运行时已下载')
  }

  const args = [
    '-m', modelPath,
    '--vad', vadPath,
    '-a', wavPath,
  ]

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
        reject(new Error(stderr.trim() || `llama-funasr-sensevoice exited ${code}`))
        return
      }
      resolve(cleanSenseVoiceTranscript(stdout))
    })
  })
}
