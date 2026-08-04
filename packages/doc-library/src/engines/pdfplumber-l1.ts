/**
 * L1 版面增强：pdfplumber Python 侧车（MIT）。
 * 安装目录：~/.opptrix/engines/pdfplumber-worker/
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { pdfplumberWorkerDir } from '../paths.js'
import type { ParseChunkInput, ParseRunResult, ParseRunner } from '../types.js'
import { isRecord, spawnJsonLine } from './spawn-json.js'

export const PDFPLUMBER_ENGINE_VERSION = '1.0.0'
const DEFAULT_TIMEOUT_MS = 90_000
const MARKER = 'READY'

function repoWorkerScript(): string | null {
  // packages/doc-library/src/engines → repo root scripts/
  try {
    const here = path.dirname(fileURLToPath(import.meta.url))
    // src/engines → packages/doc-library → packages → repo root
    const candidate = path.resolve(here, '../../../../scripts/pdfplumber-worker/worker.py')
    if (fs.existsSync(candidate)) return candidate
  } catch {
    /* ignore */
  }
  const fromCwd = path.resolve(process.cwd(), 'scripts/pdfplumber-worker/worker.py')
  return fs.existsSync(fromCwd) ? fromCwd : null
}

export function pdfplumberWorkerScriptPath(installDir = pdfplumberWorkerDir()): string | null {
  const installed = path.join(installDir, 'worker.py')
  if (fs.existsSync(installed)) return installed
  return repoWorkerScript()
}

export function pdfplumberPythonBin(installDir = pdfplumberWorkerDir()): string {
  const venvUnix = path.join(installDir, 'venv', 'bin', 'python')
  const venvWin = path.join(installDir, 'venv', 'Scripts', 'python.exe')
  if (fs.existsSync(venvUnix)) return venvUnix
  if (fs.existsSync(venvWin)) return venvWin
  return process.env.OPPTRIX_PDFPLUMBER_PYTHON?.trim()
    || process.env.OPPTRIX_PYTHON?.trim()
    || 'python3'
}

export type PdfplumberStatus = {
  available: boolean
  installed: boolean
  label: string
  dir: string
  workerScript: string | null
  hint: string
}

export function getPdfplumberStatus(installDir = pdfplumberWorkerDir()): PdfplumberStatus {
  const marker = path.join(installDir, MARKER)
  const installed = fs.existsSync(marker)
  const workerScript = pdfplumberWorkerScriptPath(installDir)
  const available = installed && workerScript !== null
  return {
    available,
    installed,
    label: '版面增强',
    dir: installDir,
    workerScript,
    hint: available
      ? '版面增强已就绪'
      : '尚未安装版面增强。可先点「准备版面增强」，再按本机说明完成后续准备',
  }
}

export function isPdfplumberAvailable(installDir = pdfplumberWorkerDir()): boolean {
  return getPdfplumberStatus(installDir).available
}

/**
 * 将仓库 worker 脚本同步到用户目录并写 READY（依赖需用户自行 pip install）。
 * 不自动 pip，避免静默网络与权限问题。
 */
export async function preparePdfplumberInstall(installDir = pdfplumberWorkerDir()): Promise<PdfplumberStatus> {
  await fs.promises.mkdir(installDir, { recursive: true })
  const src = repoWorkerScript()
  if (!src) {
    throw new Error('暂时无法准备版面增强，请确认应用完整后再试')
  }
  const dest = path.join(installDir, 'worker.py')
  await fs.promises.copyFile(src, dest)
  const reqSrc = path.join(path.dirname(src), 'requirements.txt')
  if (fs.existsSync(reqSrc)) {
    await fs.promises.copyFile(reqSrc, path.join(installDir, 'requirements.txt'))
  }
  await fs.promises.writeFile(
    path.join(installDir, 'INSTALL.md'),
    [
      '# 版面增强（开发者）',
      '',
      '```bash',
      `cd "${installDir}"`,
      'python3 -m venv venv',
      'source venv/bin/activate  # Windows: venv\\Scripts\\activate',
      'pip install -r requirements.txt',
      '```',
      '',
      '依赖就绪后再次调用准备接口（或手动创建 READY）即可被 Opptrix 探测。',
      '',
    ].join('\n'),
    'utf8',
  )

  // 仅在 ping 成功时写 READY，避免未 pip 却标可用
  const python = pdfplumberPythonBin(installDir)
  const ping = await spawnJsonLine({
    command: python,
    args: [dest],
    request: { op: 'ping' },
    timeoutMs: 15_000,
    cwd: installDir,
  })
  const pingOk = isRecord(ping.data) && ping.data.ok === true
  if (pingOk) {
    await fs.promises.writeFile(path.join(installDir, MARKER), `${new Date().toISOString()}\n`, 'utf8')
  } else if (fs.existsSync(path.join(installDir, MARKER))) {
    // ping 失败则撤掉误标
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
      hint: '文件已就位；请按本机说明完成后续准备后，再点一次「准备版面增强」',
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
