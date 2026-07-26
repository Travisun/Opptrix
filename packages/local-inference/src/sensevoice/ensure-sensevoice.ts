import fs from 'node:fs'
import path from 'node:path'
import {
  downloadSenseVoiceRuntimeArchive,
  extractSenseVoiceRuntime,
  resolveSenseVoiceRuntimePackage,
  SENSEVOICE_CLI_NAME,
} from './sensevoice-download.js'
import { getSenseVoiceBinDir } from '../paths.js'

let ensurePromise: Promise<string> | null = null

async function findExecutableInDir(dir: string, name: string): Promise<string | null> {
  let entries: fs.Dirent[]
  try {
    entries = await fs.promises.readdir(dir, { withFileTypes: true })
  } catch {
    return null
  }

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

export function findSenseVoiceExecutable(binDir = getSenseVoiceBinDir()): string | null {
  const fromEnv = process.env.OPPTRIX_SENSEVOICE_BIN?.trim()
  if (fromEnv && fs.existsSync(fromEnv)) {
    return fromEnv
  }

  const direct = path.join(binDir, SENSEVOICE_CLI_NAME)
  if (fs.existsSync(direct)) {
    return direct
  }

  try {
    const entries = fs.readdirSync(binDir, { withFileTypes: true })
    for (const entry of entries) {
      const fullPath = path.join(binDir, entry.name)
      if (entry.isFile() && entry.name === SENSEVOICE_CLI_NAME) {
        return fullPath
      }
      if (entry.isDirectory()) {
        const nested = path.join(fullPath, SENSEVOICE_CLI_NAME)
        if (fs.existsSync(nested)) return nested
      }
    }
  } catch {
    return null
  }

  return null
}

export async function ensureSenseVoiceRuntime(): Promise<string> {
  if (!ensurePromise) {
    ensurePromise = (async () => {
      const existing = findSenseVoiceExecutable()
      if (existing) return existing

      const pkg = resolveSenseVoiceRuntimePackage()
      if (!pkg) {
        throw new Error('当前平台暂不支持 SenseVoice 预编译包')
      }

      const binDir = getSenseVoiceBinDir()
      const ext = pkg.format === 'zip' ? '.zip' : '.tar.gz'
      const archivePath = path.join(binDir, `funasr-llamacpp${ext}`)

      if (!fs.existsSync(archivePath)) {
        await downloadSenseVoiceRuntimeArchive(archivePath)
      }

      await extractSenseVoiceRuntime(archivePath, binDir)

      const exe = findSenseVoiceExecutable(binDir)
        ?? await findExecutableInDir(binDir, SENSEVOICE_CLI_NAME)
      if (!exe) {
        throw new Error('SenseVoice 运行时解压完成但未找到可执行文件')
      }

      if (process.platform !== 'win32') {
        try {
          await fs.promises.chmod(exe, 0o755)
        } catch {
          /* ignore */
        }
      }

      return exe
    })().catch((err) => {
      ensurePromise = null
      throw err
    })
  }
  return ensurePromise
}
