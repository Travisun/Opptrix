import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { finished } from 'node:stream/promises'
import { getOpptrixHome, ensureDirAsync } from '../paths.js'

/** 与 llama.cpp 官方 release 对齐，可按需升级 */
const DEFAULT_LLAMA_CPP_RELEASE = process.env.OPPTRIX_LLAMA_CPP_RELEASE?.trim() || 'b9859'

const DOWNLOAD_USER_AGENT = 'Opptrix-Desktop/1.0'

type PlatformAsset = {
  filename: string
  kind: 'tar.gz' | 'zip'
  binaryRel: string
}

function getPlatformAsset(releaseTag: string): PlatformAsset | null {
  const { platform, arch } = process
  if (platform === 'darwin' && arch === 'arm64') {
    return {
      filename: `llama-${releaseTag}-bin-macos-arm64.tar.gz`,
      kind: 'tar.gz',
      binaryRel: `llama-${releaseTag}/llama-mtmd-cli`,
    }
  }
  if (platform === 'darwin' && arch === 'x64') {
    return {
      filename: `llama-${releaseTag}-bin-macos-x64.tar.gz`,
      kind: 'tar.gz',
      binaryRel: `llama-${releaseTag}/llama-mtmd-cli`,
    }
  }
  if (platform === 'linux' && arch === 'x64') {
    return {
      filename: `llama-${releaseTag}-bin-ubuntu-x64.tar.gz`,
      kind: 'tar.gz',
      binaryRel: `llama-${releaseTag}/llama-mtmd-cli`,
    }
  }
  if (platform === 'win32' && arch === 'x64') {
    return {
      filename: `llama-${releaseTag}-bin-win-cpu-x64.zip`,
      kind: 'zip',
      binaryRel: `llama-${releaseTag}/llama-mtmd-cli.exe`,
    }
  }
  return null
}

export function getLlamaCppToolsDir(releaseTag = DEFAULT_LLAMA_CPP_RELEASE): string {
  return path.join(getOpptrixHome(), 'llama-cpp-tools', releaseTag)
}

/** 仅探测已缓存/显式配置的路径，不触发下载 */
export function probeMtmdCliPath(releaseTag = DEFAULT_LLAMA_CPP_RELEASE): string | null {
  const override = process.env.OPPTRIX_LLAMA_MTMD_CLI?.trim()
  if (override && fs.existsSync(override)) return override

  const asset = getPlatformAsset(releaseTag)
  if (!asset) return null

  const binaryPath = path.join(getLlamaCppToolsDir(releaseTag), asset.binaryRel)
  return fs.existsSync(binaryPath) ? binaryPath : null
}

async function downloadFile(url: string, destPath: string): Promise<void> {
  const resp = await fetch(url, {
    redirect: 'follow',
    headers: { 'User-Agent': DOWNLOAD_USER_AGENT },
  })
  if (!resp.ok || !resp.body) {
    throw new Error(`下载失败 HTTP ${resp.status}`)
  }
  await ensureDirAsync(path.dirname(destPath))
  const fileStream = fs.createWriteStream(destPath)
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
    try { await fs.promises.unlink(destPath) } catch { /* ignore */ }
    throw error
  }
}

function runCommand(cmd: string, args: string[], cwd?: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, stdio: 'inherit', shell: false })
    child.on('error', reject)
    child.on('close', code => {
      if (code === 0) resolve()
      else reject(new Error(`${cmd} exited ${code}`))
    })
  })
}

async function extractArchive(archivePath: string, destDir: string, kind: 'tar.gz' | 'zip'): Promise<void> {
  await ensureDirAsync(destDir)
  if (kind === 'tar.gz') {
    await runCommand('tar', ['-xzf', archivePath, '-C', destDir])
    return
  }
  if (process.platform === 'win32') {
    await runCommand('powershell', [
      '-NoProfile',
      '-Command',
      `Expand-Archive -Path '${archivePath.replace(/'/g, "''")}' -DestinationPath '${destDir.replace(/'/g, "''")}' -Force`,
    ])
    return
  }
  await runCommand('unzip', ['-o', archivePath, '-d', destDir])
}

function chmodExecutable(binaryPath: string): void {
  if (process.platform === 'win32') return
  try {
    fs.chmodSync(binaryPath, 0o755)
  } catch { /* ignore */ }
}

function clearMacQuarantine(binaryDir: string): void {
  if (process.platform !== 'darwin') return
  try {
    spawn('xattr', ['-rd', 'com.apple.quarantine', binaryDir], { stdio: 'ignore' })
  } catch { /* ignore */ }
}

let ensurePromise: Promise<string> | null = null

/**
 * 解析 llama-mtmd-cli 路径：
 * 1. OPPTRIX_LLAMA_MTMD_CLI 显式覆盖
 * 2. ~/.opptrix/llama-cpp-tools/{release}/ 已缓存
 * 3. 按当前系统自动下载官方 llama.cpp release 并解压
 */
export async function resolveMtmdCli(): Promise<string> {
  const override = process.env.OPPTRIX_LLAMA_MTMD_CLI?.trim()
  if (override) {
    if (!fs.existsSync(override)) throw new Error(`OPPTRIX_LLAMA_MTMD_CLI 指向的文件不存在：${override}`)
    return override
  }

  if (ensurePromise) return ensurePromise

  ensurePromise = (async () => {
    const releaseTag = DEFAULT_LLAMA_CPP_RELEASE
    const asset = getPlatformAsset(releaseTag)
    if (!asset) {
      throw new Error(`当前系统 ${process.platform}/${process.arch} 暂不支持自动安装视觉 OCR 工具`)
    }

    const toolsDir = getLlamaCppToolsDir(releaseTag)
    const binaryPath = path.join(toolsDir, asset.binaryRel)
    if (fs.existsSync(binaryPath)) {
      return binaryPath
    }

    const url = `https://github.com/ggml-org/llama.cpp/releases/download/${releaseTag}/${asset.filename}`
    const cacheDir = path.join(getOpptrixHome(), 'llama-cpp-tools', '.cache')
    const archivePath = path.join(cacheDir, asset.filename)

    await downloadFile(url, archivePath)
    await extractArchive(archivePath, toolsDir, asset.kind)

    if (!fs.existsSync(binaryPath)) {
      throw new Error(`解压后未找到 llama-mtmd-cli：${binaryPath}`)
    }

    chmodExecutable(binaryPath)
    clearMacQuarantine(path.dirname(binaryPath))

    try { await fs.promises.unlink(archivePath) } catch { /* ignore */ }

    return binaryPath
  })()

  try {
    return await ensurePromise
  } finally {
    ensurePromise = null
  }
}

export function getMtmdCliStatus(): {
  release: string
  platform: string
  supported: boolean
  toolsDir: string
} {
  const releaseTag = DEFAULT_LLAMA_CPP_RELEASE
  const asset = getPlatformAsset(releaseTag)
  return {
    release: releaseTag,
    platform: `${process.platform}/${process.arch}`,
    supported: Boolean(asset),
    toolsDir: getLlamaCppToolsDir(releaseTag),
  }
}
