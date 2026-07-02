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
