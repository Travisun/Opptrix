import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export function getOpptrixHome(): string {
  return path.resolve(os.homedir(), '.opptrix')
}

export function getLlmsDir(): string {
  return path.resolve(getOpptrixHome(), 'llms')
}

export function getWhisperModelsDir(): string {
  return path.resolve(getOpptrixHome(), 'whisper-models')
}

export function getSenseVoiceHome(): string {
  return path.resolve(getOpptrixHome(), 'sensevoice')
}

export function getSenseVoiceModelsDir(): string {
  return path.resolve(getSenseVoiceHome(), 'models')
}

export function getSenseVoiceBinDir(): string {
  return path.resolve(getSenseVoiceHome(), 'bin')
}

/** 安装包内置 SenseVoice GGUF 目录；开发态或 env 覆盖时可能不存在。 */
export function getBundledSenseVoiceDir(repoRoot?: string): string | null {
  const fromEnv = process.env.OPPTRIX_SENSEVOICE_BUNDLED_DIR?.trim()
  if (fromEnv) return path.resolve(fromEnv)

  const resourcesPath = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath
  if (resourcesPath) {
    return path.join(resourcesPath, 'sensevoice')
  }

  if (repoRoot) {
    const dev = path.join(repoRoot, 'apps/desktop/resources/sensevoice')
    if (fs.existsSync(dev)) return dev
  }

  const cwdDev = path.resolve('apps/desktop/resources/sensevoice')
  if (fs.existsSync(cwdDev)) return cwdDev

  return null
}

/** 模型/VAD 查找顺序：内置 → 用户 ~/.opptrix/sensevoice/models */
export function listSenseVoiceModelSearchDirs(repoRoot?: string): string[] {
  const dirs: string[] = []
  const bundled = getBundledSenseVoiceDir(repoRoot)
  if (bundled) dirs.push(bundled)
  dirs.push(getSenseVoiceModelsDir())
  return dirs
}

export type SenseVoiceAssetSource = 'bundled' | 'user' | 'missing'

export function resolveSenseVoiceAssetInSearchDirs(
  filename: string,
  repoRoot?: string,
): { path: string | null; source: SenseVoiceAssetSource } {
  const bundled = getBundledSenseVoiceDir(repoRoot)
  if (bundled) {
    const bundledPath = path.join(bundled, filename)
    try {
      if (fs.existsSync(bundledPath)) {
        return { path: bundledPath, source: 'bundled' }
      }
    } catch {
      /* ignore */
    }
  }

  const userPath = path.join(getSenseVoiceModelsDir(), filename)
  try {
    if (fs.existsSync(userPath)) {
      return { path: userPath, source: 'user' }
    }
  } catch {
    /* ignore */
  }

  return { path: null, source: 'missing' }
}

export function getMediaCacheDir(): string {
  return path.resolve(getOpptrixHome(), 'media-cache')
}

export function listLlmsSearchDirs(repoRoot?: string): string[] {
  return [
    process.env.OPPTRIX_LLM_DIR,
    repoRoot ? path.join(repoRoot, 'apps/server/llms') : undefined,
    repoRoot ? path.join(repoRoot, 'llms') : undefined,
    getLlmsDir(),
  ].filter((d): d is string => Boolean(d))
}

export function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true })
}

export async function ensureDirAsync(dir: string): Promise<void> {
  await fs.promises.mkdir(dir, { recursive: true })
}
