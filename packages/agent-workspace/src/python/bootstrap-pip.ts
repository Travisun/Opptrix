import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { promisify } from 'node:util'
import { getPythonSettings } from '../python-settings-store.js'
import {
  getSortedPipIndexUrlsSync,
  invalidatePipMirrorCache,
  isPipMirrorNetworkFailure,
  resolvePreferredPipIndexUrl,
  rotatePreferredPipMirror,
} from './pip-mirrors.js'

const execFileAsync = promisify(execFile)

/** 国内镜像优先；官方 bootstrap 仅作回退 */
const GET_PIP_URLS = [
  'https://mirrors.aliyun.com/pypi/get-pip/get-pip.py',
  'https://mirrors.cloud.tencent.com/pypi/get-pip.py',
  'https://bootstrap.pypa.io/get-pip.py',
]

const MAX_PIP_BOOTSTRAP_ATTEMPTS = 3

async function downloadGetPip(destPath: string): Promise<void> {
  let lastError: Error | null = null
  for (const url of GET_PIP_URLS) {
    try {
      const resp = await fetch(url, { signal: AbortSignal.timeout(120_000) })
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
      const buf = Buffer.from(await resp.arrayBuffer())
      await fs.writeFile(destPath, buf)
      return
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err))
    }
  }
  throw lastError ?? new Error('无法下载 pip 安装脚本')
}

function buildGetPipArgs(scriptPath: string, sortedUrls: readonly string[]): string[] {
  const args = [scriptPath, '--no-warn-script-location']
  const indexUrl = sortedUrls[0]
  if (indexUrl) {
    args.push('--index-url', indexUrl)
    for (const extra of sortedUrls.slice(1)) {
      args.push('--extra-index-url', extra)
    }
  }
  return args
}

async function runGetPipInstall(pythonPath: string, scriptPath: string): Promise<void> {
  const settings = getPythonSettings()
  await resolvePreferredPipIndexUrl(settings.pip_index_urls)
  const sorted = getSortedPipIndexUrlsSync(settings.pip_index_urls)
  await execFileAsync(pythonPath, buildGetPipArgs(scriptPath, sorted), { timeout: 5 * 60 * 1000 })
}

export async function bootstrapPip(pythonPath: string): Promise<void> {
  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'opptrix-get-pip-'))
  const scriptPath = path.join(tmpDir, 'get-pip.py')

  try {
    await downloadGetPip(scriptPath)

    let lastError: Error | null = null
    for (let attempt = 0; attempt < MAX_PIP_BOOTSTRAP_ATTEMPTS; attempt += 1) {
      try {
        await runGetPipInstall(pythonPath, scriptPath)
        return
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err))
        if (!isPipMirrorNetworkFailure(lastError.message)) {
          throw lastError
        }
        if (attempt >= MAX_PIP_BOOTSTRAP_ATTEMPTS - 1) {
          break
        }
        invalidatePipMirrorCache()
        if (attempt === 0) {
          // 首次失败后强制重测
          await resolvePreferredPipIndexUrl(getPythonSettings().pip_index_urls)
        } else {
          rotatePreferredPipMirror(getPythonSettings().pip_index_urls)
        }
      }
    }

    throw lastError ?? new Error('pip 安装失败')
  } finally {
    await fs.rm(tmpDir, { recursive: true, force: true })
  }
}
