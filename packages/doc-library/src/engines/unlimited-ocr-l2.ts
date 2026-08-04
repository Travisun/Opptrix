/**
 * L2 深度整理：Unlimited-OCR 可选本地包（MIT）。
 * 默认不捆绑权重；安装到 ~/.opptrix/engines/unlimited-ocr/
 * 环境无模型时清晰失败，不崩主进程。
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { unlimitedOcrDir } from '../paths.js'
import type { ParseChunkInput, ParseRunResult, ParseRunner } from '../types.js'
import { isRecord, spawnJsonLine } from './spawn-json.js'

export const UNLIMITED_OCR_ENGINE_VERSION = '0.1.0-stub'
const MARKER = 'READY'
const DEFAULT_TIMEOUT_MS = 180_000

function repoStubScript(): string | null {
  try {
    const here = path.dirname(fileURLToPath(import.meta.url))
    const candidate = path.resolve(here, '../../../../scripts/unlimited-ocr/worker_stub.py')
    if (fs.existsSync(candidate)) return candidate
  } catch {
    /* ignore */
  }
  const fromCwd = path.resolve(process.cwd(), 'scripts/unlimited-ocr/worker_stub.py')
  return fs.existsSync(fromCwd) ? fromCwd : null
}

export type UnlimitedOcrStatus = {
  available: boolean
  installed: boolean
  label: string
  dir: string
  hint: string
}

export function getUnlimitedOcrStatus(installDir = unlimitedOcrDir()): UnlimitedOcrStatus {
  const ready = fs.existsSync(path.join(installDir, MARKER))
  const worker = path.join(installDir, 'worker.py')
  const hasWorker = fs.existsSync(worker)
  const available = ready && hasWorker
  return {
    available,
    installed: ready,
    label: '深度整理',
    dir: installDir,
    hint: available
      ? '深度整理已就绪'
      : '深度整理为可选能力，需按开发者说明安装本地引擎后再用',
  }
}

export function isUnlimitedOcrAvailable(installDir = unlimitedOcrDir()): boolean {
  return getUnlimitedOcrStatus(installDir).available
}

/**
 * 安装钩子：创建目录、复制 stub worker 与 README；**不**下载大型模型权重。
 * 真正可用性取决于用户按 README 放入模型并替换 worker。
 */
export async function prepareUnlimitedOcrInstall(
  installDir = unlimitedOcrDir(),
): Promise<UnlimitedOcrStatus> {
  await fs.promises.mkdir(installDir, { recursive: true })
  const stub = repoStubScript()
  const destWorker = path.join(installDir, 'worker.py')
  if (stub) {
    await fs.promises.copyFile(stub, destWorker)
  } else {
    await fs.promises.writeFile(
      destWorker,
      [
        '#!/usr/bin/env python3',
        'import json, sys',
        'req = json.loads(sys.stdin.readline())',
        'print(json.dumps({"ok": False, "error": "深度整理引擎未配置模型"}))',
        'sys.exit(2)',
        '',
      ].join('\n'),
      'utf8',
    )
  }

  await fs.promises.writeFile(
    path.join(installDir, 'INSTALL.md'),
    [
      '# 深度整理引擎（Unlimited-OCR，开发者）',
      '',
      '许可：MIT。禁止将 PyMuPDF / AGPL 链入 Opptrix 主进程。',
      '',
      '## 路径',
      '',
      `\`${installDir}\``,
      '',
      '## 步骤摘要',
      '',
      '1. 按上游 Unlimited-OCR 文档准备 Python 环境与模型权重（体积较大，可选）',
      '2. 将可执行入口写为本目录 `worker.py`，协议见仓库 `scripts/unlimited-ocr/README.md`',
      '3. 写入 `READY` 文件后，Opptrix 才会在「深度整理」路径调用',
      '',
      '未安装时应用会保留基础 / 版面增强结果，不会崩溃。',
      '',
    ].join('\n'),
    'utf8',
  )

  // stub 默认不可用：不写 READY，避免误升 L2
  // 提供显式「标记已配置」API 给开发者
  return getUnlimitedOcrStatus(installDir)
}

/** 开发者在完成模型配置后调用，标记可用 */
export async function markUnlimitedOcrReady(installDir = unlimitedOcrDir()): Promise<UnlimitedOcrStatus> {
  await fs.promises.mkdir(installDir, { recursive: true })
  if (!fs.existsSync(path.join(installDir, 'worker.py'))) {
    await prepareUnlimitedOcrInstall(installDir)
  }
  await fs.promises.writeFile(path.join(installDir, MARKER), `${new Date().toISOString()}\n`, 'utf8')
  return getUnlimitedOcrStatus(installDir)
}

export async function removeUnlimitedOcrInstall(installDir = unlimitedOcrDir()): Promise<void> {
  if (!fs.existsSync(installDir)) return
  await fs.promises.rm(installDir, { recursive: true, force: true })
}

function parsePayload(data: unknown): ParseRunResult {
  if (!isRecord(data)) {
    return { pageCount: 0, charCount: 0, markdown: '', chunks: [], error: '深度整理响应无效' }
  }
  if (data.ok === false) {
    const err = typeof data.error === 'string' ? data.error : '深度整理失败'
    return { pageCount: 0, charCount: 0, markdown: '', chunks: [], error: err }
  }
  const pageCount = typeof data.pageCount === 'number' ? data.pageCount : 0
  const charCount = typeof data.charCount === 'number' ? data.charCount : 0
  const markdown = typeof data.markdown === 'string' ? data.markdown : ''
  const emptyPageRatio = typeof data.emptyPageRatio === 'number' ? data.emptyPageRatio : undefined
  const chunks: ParseChunkInput[] = []
  if (Array.isArray(data.chunks)) {
    for (const c of data.chunks) {
      if (!isRecord(c) || typeof c.page !== 'number' || typeof c.text !== 'string') continue
      chunks.push({
        page: c.page,
        offset: typeof c.offset === 'number' ? c.offset : 0,
        text: c.text,
      })
    }
  }
  return { pageCount, charCount, markdown, chunks, emptyPageRatio }
}

export function createUnlimitedOcrL2Runner(opts: {
  installDir?: string
  timeoutMs?: number
} = {}): ParseRunner {
  const installDir = opts.installDir ?? unlimitedOcrDir()
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS

  return {
    engineId: 'unlimited-ocr-l2',
    engineVersion: UNLIMITED_OCR_ENGINE_VERSION,
    isAvailable() {
      return isUnlimitedOcrAvailable(installDir)
    },
    async run(blob) {
      const status = getUnlimitedOcrStatus(installDir)
      if (!status.available) {
        return {
          pageCount: 0,
          charCount: 0,
          markdown: '',
          chunks: [],
          error: '深度整理引擎尚未安装或未配置模型',
        }
      }

      const worker = path.join(installDir, 'worker.py')
      const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'opptrix-ocr-'))
      const pdfPath = path.join(tmpDir, 'input.pdf')
      try {
        await fs.promises.writeFile(pdfPath, blob)
        const python = process.env.OPPTRIX_UNLIMITED_OCR_PYTHON?.trim()
          || process.env.OPPTRIX_PYTHON?.trim()
          || 'python3'
        const spawned = await spawnJsonLine({
          command: python,
          args: [worker],
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
            error: '深度整理超时，已保留先前整理结果',
          }
        }
        return parsePayload(spawned.data)
      } catch (err) {
        return {
          pageCount: 0,
          charCount: 0,
          markdown: '',
          chunks: [],
          error: err instanceof Error ? err.message : '深度整理失败',
        }
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
