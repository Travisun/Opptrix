import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'
import { ensureDirAsync } from '../paths.js'

const require = createRequire(import.meta.url)
const ffmpegBin: string | null = require('ffmpeg-static')

export type FfmpegProbe = {
  durationSec: number | null
  hasAudio: boolean
}

/** 内部错误前缀：供 speech 文案映射区分「组件未就绪」与「文件问题」 */
export const FFMPEG_MISSING_MARKER = 'SPEECH_COMPONENT_MISSING'
export const FFMPEG_FILE_ERROR_MARKER = 'SPEECH_MEDIA_FILE_ERROR'

export function resolveFfmpegBinaryPath(): string | null {
  const fromStatic = ffmpegBin && String(ffmpegBin).trim() ? String(ffmpegBin) : null
  const fromEnv = process.env.FFMPEG_PATH?.trim() || null
  const bin = fromStatic || fromEnv
  if (!bin) return null
  try {
    if (!fs.existsSync(bin)) return null
  } catch {
    return null
  }
  return bin
}

export function isFfmpegAvailable(): boolean {
  return resolveFfmpegBinaryPath() != null
}

function resolveFfmpegBinary(): string {
  const bin = resolveFfmpegBinaryPath()
  if (!bin) {
    throw new Error(`${FFMPEG_MISSING_MARKER}: 语音处理组件未就绪（未找到可执行文件）`)
  }
  return bin
}

function classifyFfmpegFailure(stderr: string, code: number | null): Error {
  const text = stderr.trim()
  const lower = text.toLowerCase()
  // 输入损坏 / 无法解码 / 无有效流 → 文件问题
  if (
    /invalid data|invalid argument|could not find codec|unknown format|moov atom not found|error opening input|no such file or directory|does not contain any stream|invalid.*header/i.test(lower)
    || /无法打开|打开失败|格式无效|损坏/.test(text)
  ) {
    return new Error(
      `${FFMPEG_FILE_ERROR_MARKER}: 无法解析该媒体文件${text ? `（${text.slice(0, 160)}）` : ''}`,
    )
  }
  // 二进制缺失 / 无法启动 → 组件未就绪
  if (/enoent|not found|no such file|cannot find|无法找到/i.test(lower)) {
    return new Error(`${FFMPEG_MISSING_MARKER}: 语音处理组件启动失败`)
  }
  // 其它非零退出：默认按组件/环境问题，避免误导成「文件坏了」
  return new Error(
    `${FFMPEG_MISSING_MARKER}: 语音处理失败${code != null ? `（code ${code}）` : ''}${text ? `: ${text.slice(0, 200)}` : ''}`,
  )
}

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    let bin: string
    try {
      bin = resolveFfmpegBinary()
    } catch (err) {
      reject(err)
      return
    }
    const child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let stderr = ''
    child.stderr.on('data', chunk => { stderr += String(chunk) })
    child.on('error', (err) => {
      const msg = err instanceof Error ? err.message : String(err)
      if (/enoent|not found|spawn/i.test(msg)) {
        reject(new Error(`${FFMPEG_MISSING_MARKER}: 语音处理组件无法启动`))
        return
      }
      reject(new Error(`${FFMPEG_MISSING_MARKER}: ${msg}`))
    })
    child.on('close', code => {
      if (code === 0) resolve()
      else reject(classifyFfmpegFailure(stderr, code))
    })
  })
}

export class FfmpegRuntime {
  async extractAudioWav(inputPath: string, outputWavPath: string): Promise<void> {
    await ensureDirAsync(path.dirname(outputWavPath))
    if (!fs.existsSync(inputPath)) {
      throw new Error(`${FFMPEG_FILE_ERROR_MARKER}: 媒体文件不存在或无法读取`)
    }
    await runFfmpeg([
      '-y',
      '-i', inputPath,
      '-vn',
      '-acodec', 'pcm_s16le',
      '-ar', '16000',
      '-ac', '1',
      outputWavPath,
    ])
  }

  async probe(inputPath: string): Promise<FfmpegProbe> {
    if (!fs.existsSync(inputPath)) {
      return { durationSec: null, hasAudio: false }
    }
    return new Promise((resolve, reject) => {
      let bin: string
      try {
        bin = resolveFfmpegBinary()
      } catch (err) {
        reject(err)
        return
      }
      const child = spawn(bin, ['-i', inputPath], { stdio: ['ignore', 'pipe', 'pipe'] })
      let stderr = ''
      child.stderr.on('data', chunk => { stderr += String(chunk) })
      child.on('error', (err) => {
        const msg = err instanceof Error ? err.message : String(err)
        if (/enoent|not found|spawn/i.test(msg)) {
          reject(new Error(`${FFMPEG_MISSING_MARKER}: 语音处理组件无法启动`))
          return
        }
        reject(new Error(`${FFMPEG_MISSING_MARKER}: ${msg}`))
      })
      child.on('close', () => {
        const durMatch = stderr.match(/Duration:\s*(\d+):(\d+):([\d.]+)/)
        let durationSec: number | null = null
        if (durMatch) {
          durationSec = Number(durMatch[1]) * 3600 + Number(durMatch[2]) * 60 + Number(durMatch[3])
        }
        const hasAudio = /Audio:/i.test(stderr)
        resolve({ durationSec, hasAudio })
      })
    })
  }
}

export const ffmpegRuntime = new FfmpegRuntime()
