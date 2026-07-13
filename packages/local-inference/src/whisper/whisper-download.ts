import fs from 'node:fs'
import path from 'node:path'
import { finished } from 'node:stream/promises'
import { ensureDirAsync } from '../paths.js'

const WHISPER_HF_REPO = 'ggerganov/whisper.cpp'
const DOWNLOAD_USER_AGENT = 'Opptrix-Desktop/1.0'
const HF_MIRROR = String(process.env.OPPTRIX_HF_MIRROR ?? 'https://hf-mirror.com').replace(/\/$/, '')
const HF_OFFICIAL = 'https://huggingface.co'

export const WHISPER_MODEL_FILES: Record<string, string> = {
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

function buildHfResolveUrl(base: string, repo: string, filename: string): string {
  return `${base}/${repo}/resolve/main/${filename}?download=true`
}

function buildWhisperDownloadUrls(filename: string): Array<{ label: string; url: string }> {
  return [
    {
      label: 'HF 镜像',
      url: buildHfResolveUrl(HF_MIRROR, WHISPER_HF_REPO, filename),
    },
    {
      label: 'Hugging Face',
      url: buildHfResolveUrl(HF_OFFICIAL, WHISPER_HF_REPO, filename),
    },
  ]
}

export function resolveWhisperModelFilename(modelName: string): string {
  return WHISPER_MODEL_FILES[modelName] ?? `ggml-${modelName}.bin`
}

export function isSupportedWhisperModel(modelName: string): boolean {
  return Object.prototype.hasOwnProperty.call(WHISPER_MODEL_FILES, modelName)
}

async function downloadToFile(url: string, destPath: string): Promise<void> {
  const resp = await fetch(url, {
    redirect: 'follow',
    headers: { 'User-Agent': DOWNLOAD_USER_AGENT },
  })
  if (!resp.ok || !resp.body) {
    throw new Error(`HTTP ${resp.status}`)
  }

  const fileStream = fs.createWriteStream(destPath, { flags: 'w' })
  const reader = resp.body.getReader()

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value) continue
      if (!fileStream.write(Buffer.from(value))) {
        await new Promise<void>(resolve => fileStream.once('drain', resolve))
      }
    }
    fileStream.end()
    await finished(fileStream)
  } catch (error) {
    fileStream.destroy()
    throw error
  }
}

/** Node fetch 静默下载，避免 Windows 上 whisper.cpp 脚本弹出 BITS Transfer 窗口 */
export async function downloadWhisperModelFile(modelName: string, destDir: string): Promise<void> {
  if (!isSupportedWhisperModel(modelName)) {
    throw new Error(`不支持的 Whisper 模型：${modelName}`)
  }

  const filename = resolveWhisperModelFilename(modelName)
  const targetPath = path.join(destDir, filename)
  if (fs.existsSync(targetPath)) return

  await ensureDirAsync(destDir)
  const tempPath = `${targetPath}.download`
  const errors: string[] = []

  for (const source of buildWhisperDownloadUrls(filename)) {
    try {
      await downloadToFile(source.url, tempPath)
      await fs.promises.rename(tempPath, targetPath)
      return
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      errors.push(`${source.label}: ${message}`)
      try {
        await fs.promises.unlink(tempPath)
      } catch { /* ignore */ }
    }
  }

  throw new Error(errors.join('；') || 'Whisper 模型下载失败')
}
