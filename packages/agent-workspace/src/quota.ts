import fs from 'node:fs/promises'
import fsSync from 'node:fs'
import path from 'node:path'
import { QuotaExceededError } from './errors.js'

export const DEFAULT_WORKSPACE_QUOTA_BYTES = 20 * 1024 * 1024 * 1024

async function dirSize(root: string): Promise<number> {
  let total = 0
  let entries: fsSync.Dirent[]
  try {
    entries = await fs.readdir(root, { withFileTypes: true })
  } catch (err) {
    const code = (err as NodeJS.ErrnoException).code
    if (code === 'ENOENT') return 0
    throw err
  }
  for (const ent of entries) {
    const full = path.join(root, ent.name)
    if (ent.isDirectory()) {
      total += await dirSize(full)
    } else if (ent.isFile()) {
      const st = await fs.stat(full)
      total += st.size
    }
  }
  return total
}

export function getFreeDiskBytes(dir: string): number | null {
  try {
    if (typeof fsSync.statfsSync === 'function') {
      const st = fsSync.statfsSync(dir)
      return st.bavail * st.bsize
    }
  } catch { /* unsupported */ }
  return null
}

export class QuotaTracker {
  constructor(
    private readonly workspaceRoot: string,
    private readonly quotaBytes: number,
  ) {}

  async currentUsage(): Promise<number> {
    return dirSize(this.workspaceRoot)
  }

  async assertCanWrite(additionalBytes: number): Promise<void> {
    const usage = await this.currentUsage()
    if (usage + additionalBytes > this.quotaBytes) {
      throw new QuotaExceededError(
        `工作区存储已达 ${Math.round(this.quotaBytes / (1024 ** 3))}GB 上限`,
      )
    }
    const free = getFreeDiskBytes(this.workspaceRoot)
    if (free != null && free < additionalBytes) {
      throw new QuotaExceededError('磁盘剩余空间不足')
    }
  }

  get limitBytes(): number {
    return this.quotaBytes
  }
}
