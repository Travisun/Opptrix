import { spawn, spawnSync } from 'node:child_process'
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

/** -version 冒烟结果短时缓存，避免 status 轮询每次 spawn */
const VERSION_PROBE_TTL_MS = 30_000

type VersionProbeCache = {
  path: string
  ok: boolean
  at: number
}

let versionProbeCache: VersionProbeCache | null = null

function ffmpegBinaryName(): string {
  return process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg'
}

/** Electron asar → asar.unpacked（可执行文件不能留在 asar 内） */
function expandAsarUnpacked(candidate: string): string[] {
  const out = [candidate]
  if (candidate.includes(`${path.sep}app.asar${path.sep}`)) {
    out.push(
      candidate.replace(
        `${path.sep}app.asar${path.sep}`,
        `${path.sep}app.asar.unpacked${path.sep}`,
      ),
    )
  } else if (candidate.includes('app.asar') && !candidate.includes('app.asar.unpacked')) {
    out.push(candidate.replace('app.asar', 'app.asar.unpacked'))
  }
  return out
}

/** 桌面 sidecar：`OPPTRIX_RUNTIME_STAGE/node_modules/ffmpeg-static/ffmpeg` */
function candidateFromRuntimeStage(): string | null {
  const stage = process.env.OPPTRIX_RUNTIME_STAGE?.trim()
  if (!stage) return null
  return path.join(stage, 'node_modules', 'ffmpeg-static', ffmpegBinaryName())
}

function hasExecuteAccess(binPath: string): boolean {
  try {
    fs.accessSync(binPath, fs.constants.X_OK)
    return true
  } catch {
    return false
  }
}

/**
 * 文件存在但无执行位时尝试 chmod 0o755（开发机 ffmpeg-static 偶发仅 0644 → spawn EACCES）。
 * @returns 之后是否具备 X_OK
 */
export function ensureFfmpegExecutable(binPath: string): boolean {
  if (!fs.existsSync(binPath)) return false
  if (hasExecuteAccess(binPath)) return true
  try {
    fs.chmodSync(binPath, 0o755)
  } catch {
    return false
  }
  return hasExecuteAccess(binPath)
}

function invalidateVersionProbeCache(binPath?: string): void {
  if (!versionProbeCache) return
  if (binPath == null || versionProbeCache.path === binPath) {
    versionProbeCache = null
  }
}

/** 测试 / 强制重探用 */
export function clearFfmpegAvailabilityCache(): void {
  versionProbeCache = null
}

function probeFfmpegVersion(binPath: string): boolean {
  const now = Date.now()
  if (
    versionProbeCache
    && versionProbeCache.path === binPath
    && now - versionProbeCache.at < VERSION_PROBE_TTL_MS
  ) {
    return versionProbeCache.ok
  }
  const ver = spawnSync(binPath, ['-version'], {
    encoding: 'utf8',
    timeout: 8_000,
    windowsHide: true,
  })
  const ok = ver.error == null && ver.status === 0
  versionProbeCache = { path: binPath, ok, at: now }
  return ok
}

function firstUsablePath(seeds: Array<string | null | undefined>): string | null {
  const seen = new Set<string>()
  for (const seed of seeds) {
    if (!seed) continue
    for (const candidate of expandAsarUnpacked(seed)) {
      if (seen.has(candidate)) continue
      seen.add(candidate)
      try {
        if (!fs.existsSync(candidate)) continue
        if (!ensureFfmpegExecutable(candidate)) continue
        return candidate
      } catch {
        /* try next */
      }
    }
  }
  return null
}

/**
 * 解析可用的 ffmpeg 可执行路径。
 * 顺序：FFMPEG_PATH → ffmpeg-static → OPPTRIX_RUNTIME_STAGE 下的静态包；
 * 并对 asar 路径尝试 asar.unpacked；存在但无 +x 时尝试 chmod。
 * 仅返回具备执行权限的路径（不跑 -version）。
 */
export function resolveFfmpegBinaryPath(): string | null {
  const fromEnv = process.env.FFMPEG_PATH?.trim() || null
  const fromStatic = ffmpegBin && String(ffmpegBin).trim() ? String(ffmpegBin) : null
  return firstUsablePath([fromEnv, fromStatic, candidateFromRuntimeStage()])
}

/**
 * 就绪探测：路径可执行 + 轻量 `ffmpeg -version`（短时缓存）。
 * 禁止仅用 existsSync（无 +x 时会误报 ready，随后 spawn EACCES）。
 */
export function isFfmpegAvailable(): boolean {
  const bin = resolveFfmpegBinaryPath()
  if (!bin) return false
  return probeFfmpegVersion(bin)
}

function resolveFfmpegBinary(): string {
  const bin = resolveFfmpegBinaryPath()
  if (!bin) {
    throw new Error(`${FFMPEG_MISSING_MARKER}: 语音处理组件未就绪（未找到可执行文件）`)
  }
  return bin
}

function classifySpawnError(err: NodeJS.ErrnoException | Error): Error {
  const code = 'code' in err && typeof err.code === 'string' ? err.code : ''
  const msg = err.message || String(err)
  if (code === 'EACCES' || /eacces|permission denied|无执行权限/i.test(msg)) {
    return new Error(`${FFMPEG_MISSING_MARKER}: 语音处理组件无执行权限`)
  }
  if (code === 'ENOENT' || /enoent|not found|spawn/i.test(msg)) {
    return new Error(`${FFMPEG_MISSING_MARKER}: 语音处理组件无法启动`)
  }
  return new Error(`${FFMPEG_MISSING_MARKER}: ${msg}`)
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
    // 转写前再确保一次 +x，修复开发机 npm 装出的 0644
    if (!ensureFfmpegExecutable(bin)) {
      reject(new Error(`${FFMPEG_MISSING_MARKER}: 语音处理组件无执行权限`))
      return
    }
    invalidateVersionProbeCache(bin)
    const child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let stderr = ''
    child.stderr.on('data', chunk => { stderr += String(chunk) })
    child.on('error', (err) => {
      reject(classifySpawnError(err))
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
      if (!ensureFfmpegExecutable(bin)) {
        reject(new Error(`${FFMPEG_MISSING_MARKER}: 语音处理组件无执行权限`))
        return
      }
      const child = spawn(bin, ['-i', inputPath], { stdio: ['ignore', 'pipe', 'pipe'] })
      let stderr = ''
      child.stderr.on('data', chunk => { stderr += String(chunk) })
      child.on('error', (err) => {
        reject(classifySpawnError(err))
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
