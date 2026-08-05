/**
 * L1 版面增强：pdfplumber Python 侧车（MIT）。
 * 安装目录：~/.opptrix/engines/pdfplumber-worker/
 * 桌面内置 wheels：resources/engines/<plat-arch>/pdfplumber-worker/
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { getBundledEngineDir, pdfplumberWorkerDir } from '../paths.js'
import type { ParseChunkInput, ParseRunResult, ParseRunner } from '../types.js'
import { isRecord, spawnJsonLine } from './spawn-json.js'
import {
  ensureVenvDeps,
  syncEngineWorkerFiles,
  venvPythonBin,
} from './venv-install.js'

export const PDFPLUMBER_ENGINE_VERSION = '1.0.0'
const DEFAULT_TIMEOUT_MS = 90_000
const PING_TIMEOUT_MS = 15_000
const MARKER = 'READY'
const ENGINE_ID = 'pdfplumber-worker' as const
const PYTHON_ENV_KEYS = ['OPPTRIX_PDFPLUMBER_PYTHON']

export function pdfplumberWorkerScriptPath(installDir = pdfplumberWorkerDir()): string | null {
  const installed = path.join(installDir, 'worker.py')
  if (fs.existsSync(installed)) return installed
  const bundled = getBundledEngineDir(ENGINE_ID)
  if (bundled) {
    const p = path.join(bundled, 'worker.py')
    if (fs.existsSync(p)) return p
  }
  return null
}

export function pdfplumberPythonBin(installDir = pdfplumberWorkerDir()): string {
  return venvPythonBin(installDir, PYTHON_ENV_KEYS)
}

export type PdfplumberStatus = {
  available: boolean
  installed: boolean
  label: string
  dir: string
  workerScript: string | null
  hint: string
  /** bundled = 应用自带 wheels/脚本；user = 本机准备；missing = 未就绪 */
  source: 'bundled' | 'user' | 'missing'
}

export function getPdfplumberStatus(installDir = pdfplumberWorkerDir()): PdfplumberStatus {
  const marker = path.join(installDir, MARKER)
  const installed = fs.existsSync(marker)
  const workerScript = pdfplumberWorkerScriptPath(installDir)
  const available = installed && workerScript !== null
  const hasBundled = getBundledEngineDir(ENGINE_ID) !== null

  let hint: string
  if (available) {
    hint = hasBundled ? '版面增强已就绪，应用已自带' : '版面增强已就绪'
  } else if (hasBundled) {
    hint = '应用已自带版面增强；首次使用时会完成本机准备'
  } else {
    hint = '尚未准备版面增强。可先点「准备版面增强」，我们会完成本机准备'
  }

  return {
    available,
    installed,
    label: '版面增强',
    dir: installDir,
    workerScript,
    hint,
    source: available ? (hasBundled ? 'bundled' : 'user') : (hasBundled ? 'bundled' : 'missing'),
  }
}

export function isPdfplumberAvailable(installDir = pdfplumberWorkerDir()): boolean {
  return getPdfplumberStatus(installDir).available
}

/**
 * 同步 worker、venv+pip（优先内置 wheels 离线安装）、ping 成功才写 READY。
 */
export async function preparePdfplumberInstall(
  installDir = pdfplumberWorkerDir(),
): Promise<PdfplumberStatus> {
  const synced = await syncEngineWorkerFiles(ENGINE_ID, installDir)
  if ('error' in synced) {
    throw new Error(synced.error)
  }
  const { workerDest } = synced

  await fs.promises.writeFile(
    path.join(installDir, 'INSTALL.md'),
    [
      '# 版面增强（开发者）',
      '',
      '禁止 PyMuPDF / fitz（AGPL）。桌面安装包可内置 wheels，离线 pip 安装。',
      '',
      '```bash',
      `cd "${installDir}"`,
      'python3 -m venv venv',
      'source venv/bin/activate  # Windows: venv\\Scripts\\activate',
      'pip install --no-index --find-links wheels -r requirements.txt  # 有内置 wheels 时',
      '# 或: pip install -r requirements.txt',
      '```',
      '',
    ].join('\n'),
    'utf8',
  )

  const deps = await ensureVenvDeps({
    installDir,
    engineId: ENGINE_ID,
    envKeys: PYTHON_ENV_KEYS,
    messages: {
      noPython: '暂时无法完成本机准备，请确认本机已安装可用的运行环境后重试',
      incomplete: '版面增强准备文件不完整，请确认应用完整后再试',
      pipFailed: '版面增强依赖准备失败，请稍后重试',
    },
  })
  if (!deps.ok) {
    if (fs.existsSync(path.join(installDir, MARKER))) {
      try {
        await fs.promises.unlink(path.join(installDir, MARKER))
      } catch {
        /* ignore */
      }
    }
    const status = getPdfplumberStatus(installDir)
    return {
      ...status,
      available: false,
      installed: false,
      hint: deps.error ?? status.hint,
    }
  }

  const python = pdfplumberPythonBin(installDir)
  const ping = await spawnJsonLine({
    command: python,
    args: [workerDest],
    request: { op: 'ping' },
    timeoutMs: PING_TIMEOUT_MS,
    cwd: installDir,
  })
  const pingOk = isRecord(ping.data) && ping.data.ok === true
  if (pingOk) {
    await fs.promises.writeFile(path.join(installDir, MARKER), `${new Date().toISOString()}\n`, 'utf8')
  } else if (fs.existsSync(path.join(installDir, MARKER))) {
    try {
      await fs.promises.unlink(path.join(installDir, MARKER))
    } catch {
      /* ignore */
    }
  }

  const status = getPdfplumberStatus(installDir)
  if (!status.available) {
    return {
      ...status,
      hint: '文件已就位；请再点一次「准备版面增强」，或确认本机准备已完成',
    }
  }
  return status
}

export async function removePdfplumberInstall(installDir = pdfplumberWorkerDir()): Promise<void> {
  if (!fs.existsSync(installDir)) return
  await fs.promises.rm(installDir, { recursive: true, force: true })
}

function parseWorkerPayload(data: unknown): ParseRunResult {
  if (!isRecord(data)) {
    return { pageCount: 0, charCount: 0, markdown: '', chunks: [], error: '版面增强响应无效' }
  }
  if (data.ok === false) {
    const err = typeof data.error === 'string' ? data.error : '版面增强失败'
    return { pageCount: 0, charCount: 0, markdown: '', chunks: [], error: err }
  }

  const pageCount = typeof data.pageCount === 'number' ? data.pageCount : 0
  const charCount = typeof data.charCount === 'number' ? data.charCount : 0
  const markdown = typeof data.markdown === 'string' ? data.markdown : ''
  const emptyPageRatio = typeof data.emptyPageRatio === 'number' ? data.emptyPageRatio : undefined
  const chunksRaw = Array.isArray(data.chunks) ? data.chunks : []
  const chunks: ParseChunkInput[] = []
  for (const c of chunksRaw) {
    if (!isRecord(c)) continue
    if (typeof c.page !== 'number' || typeof c.text !== 'string') continue
    chunks.push({
      page: c.page,
      offset: typeof c.offset === 'number' ? c.offset : 0,
      text: c.text,
    })
  }

  return { pageCount, charCount, markdown, chunks, emptyPageRatio }
}

export function createPdfplumberL1Runner(opts: {
  installDir?: string
  timeoutMs?: number
} = {}): ParseRunner {
  const installDir = opts.installDir ?? pdfplumberWorkerDir()
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS

  return {
    engineId: 'pdfplumber-l1',
    engineVersion: PDFPLUMBER_ENGINE_VERSION,
    isAvailable() {
      return isPdfplumberAvailable(installDir)
    },
    async run(blob) {
      const status = getPdfplumberStatus(installDir)
      if (!status.available || !status.workerScript) {
        return {
          pageCount: 0,
          charCount: 0,
          markdown: '',
          chunks: [],
          error: '版面增强尚未就绪',
        }
      }

      const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'opptrix-pdfplumber-'))
      const pdfPath = path.join(tmpDir, 'input.pdf')
      try {
        await fs.promises.writeFile(pdfPath, blob)
        const python = pdfplumberPythonBin(installDir)
        const spawned = await spawnJsonLine({
          command: python,
          args: [status.workerScript],
          request: { op: 'extract', pdf_path: pdfPath },
          timeoutMs,
          cwd: installDir,
        })
        if (spawned.timedOut) {
          return {
            pageCount: 0,
            charCount: 0,
            markdown: '',
            chunks: [],
            error: '版面增强超时，已保留基础整理结果',
          }
        }
        return parseWorkerPayload(spawned.data)
      } finally {
        try {
          await fs.promises.rm(tmpDir, { recursive: true, force: true })
        } catch {
          /* ignore */
        }
      }
    },
  }
}
