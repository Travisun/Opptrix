import fs from 'node:fs'
import path from 'node:path'
import { finished } from 'node:stream/promises'
import { ensureDirAsync, getSenseVoiceBinDir } from '../paths.js'

/**
 * 国内优先：官方 FunAudioLLM GGUF（含 embed.weight，兼容 llama-funasr-sensevoice）。
 * 注意：cloudlnk 的 q4_k / q8_0 是另一套转换，会报 missing embed.weight，不可用。
 */
const MODELSCOPE_MODEL_REPO = 'FunAudioLLM/SenseVoiceSmall-GGUF'
const MODELSCOPE_BASE = String(
  process.env.OPPTRIX_MODELSCOPE_BASE ?? 'https://modelscope.cn',
).replace(/\/$/, '')

const HF_MODEL_REPO = 'FunAudioLLM/SenseVoiceSmall-GGUF'
const MODELSCOPE_VAD_REPO = 'FunAudioLLM/fsmn-vad-GGUF'
const HF_VAD_REPO = 'FunAudioLLM/fsmn-vad-GGUF'
const SENSEVOICE_VAD_FILENAME = 'fsmn-vad.gguf'
const DOWNLOAD_USER_AGENT = 'Opptrix-Desktop/1.0'
const HF_MIRROR = String(process.env.OPPTRIX_HF_MIRROR ?? 'https://hf-mirror.com').replace(/\/$/, '')
const HF_OFFICIAL = 'https://huggingface.co'
const FUNASR_RELEASE_BASE = 'https://github.com/modelscope/FunASR/releases/download/v1.3.29'

/** 与官方 FunAudioLLM SenseVoiceSmall-GGUF 文件名一致 */
export const SENSEVOICE_MODEL_FILES: Record<string, string> = {
  q8: 'sensevoice-small-q8.gguf',
  f16: 'sensevoice-small-f16.gguf',
}

export const SENSEVOICE_CLI_NAME = process.platform === 'win32'
  ? 'llama-funasr-sensevoice.exe'
  : 'llama-funasr-sensevoice'

function buildModelScopeResolveUrl(repo: string, filename: string): string {
  return `${MODELSCOPE_BASE}/models/${repo}/resolve/master/${filename}`
}

function buildHfResolveUrl(base: string, repo: string, filename: string): string {
  return `${base}/${repo}/resolve/main/${filename}?download=true`
}

function buildModelDownloadUrls(filename: string): Array<{ label: string; url: string }> {
  return [
    {
      label: 'ModelScope',
      url: buildModelScopeResolveUrl(MODELSCOPE_MODEL_REPO, filename),
    },
    {
      label: 'HF 镜像',
      url: buildHfResolveUrl(HF_MIRROR, HF_MODEL_REPO, filename),
    },
    {
      label: 'Hugging Face',
      url: buildHfResolveUrl(HF_OFFICIAL, HF_MODEL_REPO, filename),
    },
  ]
}

function buildVadDownloadUrls(): Array<{ label: string; url: string }> {
  return [
    {
      label: 'ModelScope',
      url: buildModelScopeResolveUrl(MODELSCOPE_VAD_REPO, SENSEVOICE_VAD_FILENAME),
    },
    {
      label: 'HF 镜像',
      url: buildHfResolveUrl(HF_MIRROR, HF_VAD_REPO, SENSEVOICE_VAD_FILENAME),
    },
    {
      label: 'Hugging Face',
      url: buildHfResolveUrl(HF_OFFICIAL, HF_VAD_REPO, SENSEVOICE_VAD_FILENAME),
    },
  ]
}

export function resolveSenseVoiceModelFilename(modelName: string): string {
  const key = modelName.trim().toLowerCase()
  return SENSEVOICE_MODEL_FILES[key] ?? SENSEVOICE_MODEL_FILES.q8
}

export function isSupportedSenseVoiceModel(modelName: string): boolean {
  const key = modelName.trim().toLowerCase()
  return Object.prototype.hasOwnProperty.call(SENSEVOICE_MODEL_FILES, key)
}

export function resolveSenseVoiceRuntimePackage(): { url: string; format: 'tar.gz' | 'zip' } | null {
  const { platform, arch } = process
  if (platform === 'darwin' && arch === 'arm64') {
    return {
      url: `${FUNASR_RELEASE_BASE}/funasr-llamacpp-macos-arm64.tar.gz`,
      format: 'tar.gz',
    }
  }
  if (platform === 'linux' && arch === 'arm64') {
    return {
      url: `${FUNASR_RELEASE_BASE}/funasr-llamacpp-linux-arm64.tar.gz`,
      format: 'tar.gz',
    }
  }
  if (platform === 'linux' && arch === 'x64') {
    return {
      url: `${FUNASR_RELEASE_BASE}/funasr-llamacpp-linux-x64.tar.gz`,
      format: 'tar.gz',
    }
  }
  if (platform === 'win32' && arch === 'x64') {
    return {
      url: `${FUNASR_RELEASE_BASE}/funasr-llamacpp-windows-x64.zip`,
      format: 'zip',
    }
  }
  return null
}

function looksLikeHtmlBody(head: Uint8Array): boolean {
  const prefix = Buffer.from(head).toString('utf8', 0, Math.min(head.length, 256)).trimStart().toLowerCase()
  return prefix.startsWith('<!doctype') || prefix.startsWith('<html')
}

async function downloadToFile(url: string, destPath: string): Promise<void> {
  const resp = await fetch(url, {
    redirect: 'follow',
    headers: { 'User-Agent': DOWNLOAD_USER_AGENT },
  })
  if (!resp.ok || !resp.body) {
    throw new Error(`HTTP ${resp.status}`)
  }

  const contentType = resp.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() ?? ''
  if (contentType === 'text/html' || contentType === 'application/xhtml+xml') {
    throw new Error('下载源返回了无效页面')
  }

  const fileStream = fs.createWriteStream(destPath, { flags: 'w' })
  const reader = resp.body.getReader()
  let htmlChecked = false

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value) continue
      if (!htmlChecked) {
        if (looksLikeHtmlBody(value)) {
          throw new Error('下载源返回了无效页面')
        }
        htmlChecked = true
      }
      if (!fileStream.write(Buffer.from(value))) {
        await new Promise<void>((resolve) => fileStream.once('drain', resolve))
      }
    }
    fileStream.end()
    await finished(fileStream)
  } catch (error) {
    fileStream.destroy()
    throw error
  }
}

async function downloadFromSources(
  sources: Array<{ label: string; url: string }>,
  targetPath: string,
  errorPrefix: string,
): Promise<void> {
  if (fs.existsSync(targetPath)) return

  await ensureDirAsync(path.dirname(targetPath))
  const tempPath = `${targetPath}.download`
  const errors: string[] = []

  for (const source of sources) {
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

  throw new Error(errors.join('；') || errorPrefix)
}

export async function downloadSenseVoiceModelFile(modelName: string, destDir: string): Promise<void> {
  const key = modelName.trim().toLowerCase()
  if (!isSupportedSenseVoiceModel(key)) {
    throw new Error(`不支持的 SenseVoice 模型：${modelName}（请使用 q8 或 f16）`)
  }

  const filename = resolveSenseVoiceModelFilename(key)
  await downloadFromSources(
    buildModelDownloadUrls(filename),
    path.join(destDir, filename),
    'SenseVoice 模型下载失败',
  )
}

export async function downloadSenseVoiceVadFile(destDir: string): Promise<void> {
  await downloadFromSources(
    buildVadDownloadUrls(),
    path.join(destDir, SENSEVOICE_VAD_FILENAME),
    'SenseVoice VAD 模型下载失败',
  )
}

export function getSenseVoiceVadFilename(): string {
  return SENSEVOICE_VAD_FILENAME
}

export async function downloadSenseVoiceRuntimeArchive(destPath: string): Promise<void> {
  const pkg = resolveSenseVoiceRuntimePackage()
  if (!pkg) {
    throw new Error('当前平台暂不支持 SenseVoice 预编译包')
  }

  await ensureDirAsync(path.dirname(destPath))
  const tempPath = `${destPath}.download`
  const errors: string[] = []

  try {
    await downloadToFile(pkg.url, tempPath)
    await fs.promises.rename(tempPath, destPath)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    errors.push(message)
    try {
      await fs.promises.unlink(tempPath)
    } catch { /* ignore */ }
    throw new Error(errors.join('；') || 'SenseVoice 运行时下载失败')
  }
}

export async function extractSenseVoiceRuntime(archivePath: string, binDir = getSenseVoiceBinDir()): Promise<void> {
  const pkg = resolveSenseVoiceRuntimePackage()
  if (!pkg) {
    throw new Error('当前平台暂不支持 SenseVoice 预编译包')
  }

  await ensureDirAsync(binDir)

  if (pkg.format === 'tar.gz') {
    await extractTarGz(archivePath, binDir)
  } else {
    await extractZip(archivePath, binDir)
  }

  await chmodSenseVoiceExecutable(binDir)
}

async function extractTarGz(archivePath: string, destDir: string): Promise<void> {
  const { spawn } = await import('node:child_process')
  await new Promise<void>((resolve, reject) => {
    const child = spawn('tar', ['-xzf', archivePath, '-C', destDir], {
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
    })
    let stderr = ''
    child.stderr.on('data', (chunk) => { stderr += String(chunk) })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(stderr.trim() || `tar exited ${code}`))
    })
  })
}

async function extractZip(archivePath: string, destDir: string): Promise<void> {
  const { spawn } = await import('node:child_process')
  if (process.platform === 'win32') {
    const psDest = destDir.replace(/'/g, "''")
    const psArchive = archivePath.replace(/'/g, "''")
    await new Promise<void>((resolve, reject) => {
      const child = spawn(
        'powershell',
        ['-NoProfile', '-Command', `Expand-Archive -Path '${psArchive}' -DestinationPath '${psDest}' -Force`],
        { stdio: ['ignore', 'pipe', 'pipe'], shell: false },
      )
      let stderr = ''
      child.stderr.on('data', (chunk) => { stderr += String(chunk) })
      child.on('error', reject)
      child.on('close', (code) => {
        if (code === 0) resolve()
        else reject(new Error(stderr.trim() || `Expand-Archive exited ${code}`))
      })
    })
    return
  }

  await new Promise<void>((resolve, reject) => {
    const child = spawn('unzip', ['-o', archivePath, '-d', destDir], {
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
    })
    let stderr = ''
    child.stderr.on('data', (chunk) => { stderr += String(chunk) })
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) resolve()
      else reject(new Error(stderr.trim() || `unzip exited ${code}`))
    })
  })
}

async function chmodSenseVoiceExecutable(binDir: string): Promise<void> {
  if (process.platform === 'win32') return

  const exe = await findExecutableInDir(binDir, SENSEVOICE_CLI_NAME)
  if (!exe) return

  try {
    await fs.promises.chmod(exe, 0o755)
  } catch {
    /* ignore */
  }
}

async function findExecutableInDir(dir: string, name: string): Promise<string | null> {
  const entries = await fs.promises.readdir(dir, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isFile() && entry.name === name) {
      return fullPath
    }
    if (entry.isDirectory()) {
      const nested = await findExecutableInDir(fullPath, name)
      if (nested) return nested
    }
  }
  return null
}
