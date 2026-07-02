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

function resolveFfmpegBinary(): string {
  const bin = ffmpegBin || process.env.FFMPEG_PATH
  if (!bin) throw new Error('未找到 ffmpeg 可执行文件（ffmpeg-static）')
  return bin
}

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const bin = resolveFfmpegBinary()
    const child = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] })
    let stderr = ''
    child.stderr.on('data', chunk => { stderr += String(chunk) })
    child.on('error', reject)
    child.on('close', code => {
      if (code === 0) resolve()
      else reject(new Error(stderr.trim() || `ffmpeg exited ${code}`))
    })
  })
}

export class FfmpegRuntime {
  async extractAudioWav(inputPath: string, outputWavPath: string): Promise<void> {
    await ensureDirAsync(path.dirname(outputWavPath))
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
      const bin = resolveFfmpegBinary()
      const child = spawn(bin, ['-i', inputPath], { stdio: ['ignore', 'pipe', 'pipe'] })
      let stderr = ''
      child.stderr.on('data', chunk => { stderr += String(chunk) })
      child.on('error', reject)
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
