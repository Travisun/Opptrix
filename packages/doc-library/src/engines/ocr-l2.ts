/**
 * ocr-l2：Node ONNX OCR（@gutenye/ocr-node + 已有 PP-OCRv4 mobile 模型）。
 * PDF 经 PDFium 栅格化后 OCR；图片直接 OCR。禁止 PyMuPDF/AGPL。
 * 兼容别名：rapidocr-l2 / unlimited-ocr-l2。
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  getBundledRapidOcrModelDir,
  listRapidOcrModelSearchDirs,
  rapidocrUserModelDir,
  type RapidOcrModelSource,
} from '../paths.js'
import type { ParseChunkInput, ParseRunOpts, ParseRunResult, ParseRunner } from '../types.js'
import { buildPageChunks } from './chunk-text.js'

export const OCR_L2_ENGINE_VERSION = '2.0.0'
/** @deprecated 使用 OCR_L2_ENGINE_VERSION */
export const RAPIDOCR_ENGINE_VERSION = OCR_L2_ENGINE_VERSION

const DOWNLOAD_TIMEOUT_MS = 120_000
const DEFAULT_TIMEOUT_MS = 300_000

export const RAPIDOCR_MODEL_FILES = [
  'ch_PP-OCRv4_det_mobile.onnx',
  'ch_PP-OCRv4_rec_mobile.onnx',
  'ch_ppocr_mobile_v2.0_cls_mobile.onnx',
  'ppocr_keys_v1.txt',
] as const

const REMOTE_MODEL_PATHS: Record<(typeof RAPIDOCR_MODEL_FILES)[number], string> = {
  'ch_PP-OCRv4_det_mobile.onnx': 'onnx/PP-OCRv4/det/ch_PP-OCRv4_det_mobile.onnx',
  'ch_PP-OCRv4_rec_mobile.onnx': 'onnx/PP-OCRv4/rec/ch_PP-OCRv4_rec_mobile.onnx',
  'ch_ppocr_mobile_v2.0_cls_mobile.onnx': 'onnx/PP-OCRv4/cls/ch_ppocr_mobile_v2.0_cls_mobile.onnx',
  'ppocr_keys_v1.txt': 'paddle/PP-OCRv4/rec/ch_PP-OCRv4_rec_mobile/ppocr_keys_v1.txt',
}

export type OcrEngineStatus = {
  available: boolean
  installed: boolean
  label: string
  dir: string
  modelDir: string
  workerScript: string | null
  hint: string
  source: RapidOcrModelSource
}

/** @deprecated 使用 OcrEngineStatus */
export type RapidOcrStatus = OcrEngineStatus

export function missingRapidOcrModelFiles(modelDir: string): string[] {
  const missing: string[] = []
  for (const file of RAPIDOCR_MODEL_FILES) {
    if (!fs.existsSync(path.join(modelDir, file))) missing.push(file)
  }
  return missing
}

function sourceForDir(modelDir: string, repoRoot?: string): RapidOcrModelSource {
  const bundled = getBundledRapidOcrModelDir(repoRoot)
  if (bundled && path.resolve(modelDir) === path.resolve(bundled)) return 'bundled'
  if (path.resolve(modelDir) === path.resolve(rapidocrUserModelDir())) return 'user'
  return 'user'
}

export function resolveRapidOcrModelDir(repoRoot?: string): {
  dir: string
  source: RapidOcrModelSource
  missingFiles: string[]
} {
  const fromEnv = process.env.OPPTRIX_RAPIDOCR_MODEL_DIR?.trim()
  if (fromEnv) {
    const dir = path.resolve(fromEnv)
    const missing = missingRapidOcrModelFiles(dir)
    return {
      dir,
      source: missing.length === 0 ? sourceForDir(dir, repoRoot) : 'missing',
      missingFiles: missing,
    }
  }

  for (const dir of listRapidOcrModelSearchDirs(repoRoot)) {
    const missing = missingRapidOcrModelFiles(dir)
    if (missing.length === 0) {
      return { dir, source: sourceForDir(dir, repoRoot), missingFiles: [] }
    }
  }
  const userDir = rapidocrUserModelDir()
  return {
    dir: userDir,
    source: 'missing',
    missingFiles: missingRapidOcrModelFiles(userDir),
  }
}

async function probeOnnxRuntime(): Promise<boolean> {
  try {
    await import('onnxruntime-node')
    return true
  } catch {
    try {
      await import('@gutenye/ocr-node')
      return true
    } catch {
      return false
    }
  }
}

let onnxProbe: Promise<boolean> | null = null

function onnxReadyCached(): Promise<boolean> {
  if (!onnxProbe) onnxProbe = probeOnnxRuntime()
  return onnxProbe
}

export function getOcrL2Status(): OcrEngineStatus {
  const resolved = resolveRapidOcrModelDir()
  const modelsReady = resolved.source !== 'missing'
  // 同步路径：installed=模型齐全；真正可跑见 isOcrL2Available（含运行时探测）
  const available = modelsReady
  let hint: string
  if (available) {
    hint = resolved.source === 'bundled'
      ? '扫描件文字识别已就绪，应用已自带'
      : '扫描件文字识别已就绪'
  } else {
    hint = '暂时无法识别扫描件中的文字。添加文件时会自动准备，也可稍后重试'
  }
  return {
    available,
    installed: modelsReady,
    label: '扫描件识别',
    dir: resolved.dir,
    modelDir: resolved.dir,
    workerScript: null,
    hint,
    source: modelsReady ? resolved.source : 'missing',
  }
}

/** @deprecated 使用 getOcrL2Status */
export function getRapidOcrStatus(_installDir?: string): OcrEngineStatus {
  return getOcrL2Status()
}

export async function isOcrL2Available(): Promise<boolean> {
  const resolved = resolveRapidOcrModelDir()
  if (resolved.source === 'missing') return false
  return onnxReadyCached()
}

/** @deprecated 使用 isOcrL2Available */
export async function isRapidOcrAvailable(_installDir?: string): Promise<boolean> {
  return isOcrL2Available()
}

function sourcesForRemote(relPath: string): Array<{ label: string; url: string }> {
  const modelscopeBase = String(process.env.OPPTRIX_MODELSCOPE_BASE ?? 'https://modelscope.cn').replace(/\/$/, '')
  const hfMirror = String(process.env.OPPTRIX_HF_MIRROR ?? 'https://hf-mirror.com').replace(/\/$/, '')
  const msRepo = String(process.env.OPPTRIX_RAPIDOCR_MODELSCOPE_REPO ?? 'RapidAI/RapidOCR').replace(/^\/+|\/+$/g, '')
  const hfRepo = String(process.env.OPPTRIX_RAPIDOCR_HF_REPO ?? 'RapidAI/RapidOCR').replace(/^\/+|\/+$/g, '')
  const tag = String(process.env.OPPTRIX_RAPIDOCR_MODELSCOPE_TAG ?? 'v3.9.1').replace(/^\/+|\/+$/g, '')

  return [
    { label: 'modelscope', url: `${modelscopeBase}/models/${msRepo}/resolve/${tag}/${relPath}` },
    { label: 'hf-mirror', url: `${hfMirror}/${hfRepo}/resolve/main/${relPath}?download=true` },
    { label: 'huggingface', url: `https://huggingface.co/${hfRepo}/resolve/main/${relPath}?download=true` },
  ]
}

export type OcrModelDownloadProgress = {
  file: string
  receivedBytes: number
  totalBytes: number | null
}

async function downloadToFile(
  url: string,
  destPath: string,
  timeoutMs: number,
  onProgress?: (p: { receivedBytes: number; totalBytes: number | null }) => void,
): Promise<void> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const resp = await fetch(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'User-Agent': 'Opptrix/1.0' },
    })
    if (!resp.ok || !resp.body) {
      throw new Error(`HTTP ${resp.status}`)
    }
    const contentLength = resp.headers.get('content-length')
    const totalBytes =
      contentLength && Number.isFinite(Number(contentLength))
        ? Number(contentLength)
        : null
    await fs.promises.mkdir(path.dirname(destPath), { recursive: true })
    const tempPath = `${destPath}.download`
    const fileStream = fs.createWriteStream(tempPath, { flags: 'w' })
    const reader = resp.body.getReader()
    let receivedBytes = 0
    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        if (!value) continue
        receivedBytes += value.byteLength
        onProgress?.({ receivedBytes, totalBytes })
        await new Promise<void>((resolve, reject) => {
          fileStream.write(Buffer.from(value), (err) => (err ? reject(err) : resolve()))
        })
      }
      await new Promise<void>((resolve, reject) => {
        fileStream.end((err: Error | null | undefined) => (err ? reject(err) : resolve()))
      })
      await fs.promises.rename(tempPath, destPath)
    } catch (err) {
      try {
        fileStream.destroy()
      } catch {
        /* ignore */
      }
      try {
        await fs.promises.unlink(tempPath)
      } catch {
        /* ignore */
      }
      throw err
    }
  } finally {
    clearTimeout(timer)
  }
}

export async function ensureRapidOcrModelsDownloaded(
  modelDir = rapidocrUserModelDir(),
  opts?: { onProgress?: (p: OcrModelDownloadProgress) => void },
): Promise<{ ok: boolean; missingFiles: string[] }> {
  await fs.promises.mkdir(modelDir, { recursive: true })
  for (const file of RAPIDOCR_MODEL_FILES) {
    const dest = path.join(modelDir, file)
    if (fs.existsSync(dest)) continue
    const remote = REMOTE_MODEL_PATHS[file]
    let saved = false
    for (const source of sourcesForRemote(remote)) {
      try {
        await downloadToFile(source.url, dest, DOWNLOAD_TIMEOUT_MS, (p) => {
          opts?.onProgress?.({
            file,
            receivedBytes: p.receivedBytes,
            totalBytes: p.totalBytes,
          })
        })
        saved = true
        break
      } catch {
        /* try next mirror */
      }
    }
    if (!saved) {
      return { ok: false, missingFiles: missingRapidOcrModelFiles(modelDir) }
    }
  }
  const missing = missingRapidOcrModelFiles(modelDir)
  return { ok: missing.length === 0, missingFiles: missing }
}

export async function prepareOcrL2Install(): Promise<OcrEngineStatus> {
  let resolved = resolveRapidOcrModelDir()
  if (resolved.source === 'missing') {
    const downloaded = await ensureRapidOcrModelsDownloaded(rapidocrUserModelDir())
    if (!downloaded.ok) {
      return {
        ...getOcrL2Status(),
        available: false,
        installed: false,
        source: 'missing',
        hint: '暂时无法下载所需文件，请检查网络后稍后重试',
      }
    }
    resolved = resolveRapidOcrModelDir()
  }

  const onnxOk = await onnxReadyCached()
  if (!onnxOk) {
    return {
      ...getOcrL2Status(),
      available: false,
      installed: resolved.source !== 'missing',
      hint: '暂时无法识别扫描件，请确认应用完整或稍后重试',
    }
  }

  return {
    ...getOcrL2Status(),
    available: true,
  }
}

/** @deprecated 使用 prepareOcrL2Install */
export async function prepareRapidOcrInstall(_installDir?: string): Promise<OcrEngineStatus> {
  return prepareOcrL2Install()
}

export async function markOcrL2Ready(): Promise<OcrEngineStatus> {
  return prepareOcrL2Install()
}

/** @deprecated */
export async function markRapidOcrReady(_installDir?: string): Promise<OcrEngineStatus> {
  return markOcrL2Ready()
}

export async function removeOcrL2Install(): Promise<void> {
  const userDir = rapidocrUserModelDir()
  if (fs.existsSync(userDir)) {
    await fs.promises.rm(userDir, { recursive: true, force: true })
  }
}

/** @deprecated 仅清除用户模型副本 */
export async function removeRapidOcrInstall(_installDir?: string): Promise<void> {
  return removeOcrL2Install()
}

type OcrLine = { text?: string }
/** @gutenye/ocr-node 实例；上游若无 dispose/close，释放时仅置空引用供 GC */
type OcrInstance = {
  detect: (input: string | Buffer) => Promise<OcrLine[]>
  dispose?: () => void | Promise<void>
  close?: () => void | Promise<void>
}

/** 默认 12 分钟；`OPPTRIX_OCR_IDLE_MS=0` 关闭空闲卸载 */
export const DEFAULT_OCR_IDLE_MS = 12 * 60 * 1000

export function resolveOcrIdleMs(env: NodeJS.ProcessEnv = process.env): number {
  const raw = env.OPPTRIX_OCR_IDLE_MS
  if (raw == null || raw === '') return DEFAULT_OCR_IDLE_MS
  const n = Number(raw)
  if (!Number.isFinite(n) || n < 0) return DEFAULT_OCR_IDLE_MS
  return n
}

type OcrFactory = (modelDir: string) => Promise<OcrInstance>

let ocrSingleton: Promise<OcrInstance> | null = null
let ocrIdleTimer: ReturnType<typeof setTimeout> | null = null
let ocrIdleUnloadPromise: Promise<void> | null = null
let ocrLastUsedAt = 0
/** 测试可注入，避免真实 Ocr.create */
let ocrFactoryForTests: OcrFactory | null = null

function clearOcrIdleTimer(): void {
  if (ocrIdleTimer) {
    clearTimeout(ocrIdleTimer)
    ocrIdleTimer = null
  }
}

function scheduleOcrIdleUnload(): void {
  clearOcrIdleTimer()
  const idleMs = resolveOcrIdleMs()
  if (idleMs <= 0) return
  ocrIdleTimer = setTimeout(() => {
    ocrIdleTimer = null
    void runOcrIdleUnload()
  }, idleMs)
  if (typeof ocrIdleTimer === 'object' && ocrIdleTimer && 'unref' in ocrIdleTimer) {
    ocrIdleTimer.unref()
  }
}

function touchOcrLastUsed(): void {
  ocrLastUsedAt = Date.now()
  scheduleOcrIdleUnload()
}

async function disposeOcrInstance(instance: OcrInstance): Promise<void> {
  const disposer =
    typeof instance.dispose === 'function'
      ? instance.dispose.bind(instance)
      : typeof instance.close === 'function'
        ? instance.close.bind(instance)
        : null
  if (!disposer) {
    // @gutenye/ocr-node 当前无公开 dispose/close；置空 singleton 依赖 GC 回收 ONNX 会话
    return
  }
  try {
    await disposer()
  } catch {
    /* ignore teardown races */
  }
}

/**
 * 释放 OCR singleton（取消空闲定时器；若有 dispose/close 则调用）。
 * 失败不抛；下次 getOcrInstance / ocrImageBuffer 可再创建。
 */
export async function releaseOcrInstance(): Promise<void> {
  clearOcrIdleTimer()
  const pending = ocrSingleton
  ocrSingleton = null
  if (!pending) return
  let instance: OcrInstance
  try {
    instance = await pending
  } catch {
    return
  }
  await disposeOcrInstance(instance)
}

async function runOcrIdleUnload(): Promise<void> {
  if (ocrIdleUnloadPromise) {
    await ocrIdleUnloadPromise
    return
  }
  ocrIdleUnloadPromise = releaseOcrInstance().finally(() => {
    ocrIdleUnloadPromise = null
  })
  await ocrIdleUnloadPromise
}

/** 关闭 OCR 单例（含进行中的空闲卸载）；server / closeDocLibrary 共用 */
export async function closeOcrService(): Promise<void> {
  clearOcrIdleTimer()
  const pendingUnload = ocrIdleUnloadPromise
  ocrIdleUnloadPromise = null
  if (pendingUnload) {
    try {
      await pendingUnload
    } catch {
      /* ignore */
    }
  }
  await releaseOcrInstance()
}

/** @internal 测试：注入/清空 OCR 工厂 */
export function setOcrFactoryForTests(factory: OcrFactory | null): void {
  ocrFactoryForTests = factory
}

/** @internal 测试：当前是否持有 singleton（含创建中 Promise） */
export function hasOcrSingletonForTests(): boolean {
  return ocrSingleton != null
}

/** @internal 测试：最近一次成功使用时间戳 */
export function getOcrLastUsedAtForTests(): number {
  return ocrLastUsedAt
}

/** @internal 测试：按需创建/复用 OCR 并 touch（不经 isOcrL2Available） */
export async function warmOcrInstanceForTests(modelDir = '/__ocr_test__'): Promise<void> {
  await getOcrInstance(modelDir)
  touchOcrLastUsed()
}

async function getOcrInstance(modelDir: string): Promise<OcrInstance> {
  if (!ocrSingleton) {
    const creating = (async () => {
      if (ocrFactoryForTests) {
        return ocrFactoryForTests(modelDir)
      }
      const mod = await import('@gutenye/ocr-node')
      const Ocr = mod.default
      const instance = (await Ocr.create({
        models: {
          detectionPath: path.join(modelDir, 'ch_PP-OCRv4_det_mobile.onnx'),
          recognitionPath: path.join(modelDir, 'ch_PP-OCRv4_rec_mobile.onnx'),
          dictionaryPath: path.join(modelDir, 'ppocr_keys_v1.txt'),
        },
      })) as OcrInstance
      return instance
    })()
    ocrSingleton = creating
    creating.catch(() => {
      if (ocrSingleton === creating) ocrSingleton = null
    })
  }
  return ocrSingleton
}

function linesToText(lines: OcrLine[]): string {
  return lines
    .map(l => (typeof l.text === 'string' ? l.text.trim() : ''))
    .filter(Boolean)
    .join('\n')
}

function isPdfBlob(blob: Buffer, opts?: ParseRunOpts): boolean {
  if (opts?.kind === 'pdf') return true
  if ((opts?.mime ?? '').toLowerCase().includes('pdf')) return true
  if (extOf(opts?.filename) === '.pdf') return true
  return blob.length >= 5 && blob.subarray(0, 5).toString('ascii') === '%PDF-'
}

function extOf(filename?: string): string {
  if (!filename) return ''
  const i = filename.lastIndexOf('.')
  return i >= 0 ? filename.slice(i).toLowerCase() : ''
}

async function rasterizePdfPages(blob: Buffer): Promise<Buffer[]> {
  const { PDFiumLibrary } = await import('@hyzyla/pdfium')
  const sharpMod = await import('sharp')
  const sharp = sharpMod.default
  const library = await PDFiumLibrary.init()
  try {
    const document = await library.loadDocument(new Uint8Array(blob))
    try {
      const pages: Buffer[] = []
      const pageCount = document.getPageCount()
      for (let i = 0; i < pageCount; i++) {
        const page = document.getPage(i)
        const rendered = await page.render({
          scale: 2,
          render: async (options) => {
            return sharp(options.data, {
              raw: {
                width: options.width,
                height: options.height,
                channels: 4,
              },
            })
              .png()
              .toBuffer()
          },
        })
        pages.push(Buffer.from(rendered.data))
      }
      return pages
    } finally {
      document.destroy()
    }
  } finally {
    library.destroy()
  }
}

async function detectImageWithOcr(ocr: OcrInstance, image: Buffer): Promise<string> {
  const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'opptrix-ocr-'))
  const imgPath = path.join(tmpDir, 'page.png')
  try {
    await fs.promises.writeFile(imgPath, image)
    const lines = await ocr.detect(imgPath)
    return linesToText(lines)
  } finally {
    try {
      await fs.promises.rm(tmpDir, { recursive: true, force: true })
    } catch {
      /* ignore */
    }
  }
}

/**
 * 低级 API：对单张图片做 OCR。模型/运行时未就绪或失败时返回空串（不抛）。
 * 供 office/PDF 内嵌图增强复用；整页扫描仍走 runOcrL2。
 */
export async function ocrImageBuffer(image: Buffer): Promise<string> {
  try {
    if (!(await isOcrL2Available())) return ''
    const resolved = resolveRapidOcrModelDir()
    if (resolved.source === 'missing') return ''
    const ocr = await getOcrInstance(resolved.dir)
    const text = (await detectImageWithOcr(ocr, image)).trim()
    touchOcrLastUsed()
    return text
  } catch {
    return ''
  }
}

export type OcrBatchOpts = {
  /** 并行度，默认 3 */
  concurrency?: number
}

/**
 * 低级 API：批量 OCR；按 concurrency 限流。单项失败记为空串。
 */
export async function ocrImageBuffers(
  images: Buffer[],
  opts: OcrBatchOpts = {},
): Promise<string[]> {
  if (!images.length) return []
  const concurrency = Math.max(1, Math.min(opts.concurrency ?? 3, 4))
  const out: string[] = new Array(images.length).fill('')
  let next = 0

  async function worker(): Promise<void> {
    while (next < images.length) {
      const i = next
      next += 1
      const img = images[i]
      if (!img) continue
      out[i] = await ocrImageBuffer(img)
    }
  }

  const workers = Array.from(
    { length: Math.min(concurrency, images.length) },
    () => worker(),
  )
  await Promise.all(workers)
  return out
}

function buildResult(pages: Array<{ page: number; text: string }>): ParseRunResult {
  const mdParts: string[] = []
  let empty = 0
  for (const p of pages) {
    mdParts.push(`<!-- page:${p.page} -->`)
    if (p.text) mdParts.push(p.text)
    else empty += 1
    mdParts.push('')
  }
  const markdown = mdParts.join('\n').trim()
  const n = pages.length
  const chunks: ParseChunkInput[] = buildPageChunks(pages)
  return {
    pageCount: n,
    charCount: markdown.length,
    markdown,
    chunks,
    emptyPageRatio: n > 0 ? empty / n : 1,
  }
}

export async function runOcrL2(blob: Buffer, opts?: ParseRunOpts): Promise<ParseRunResult> {
  if (!(await isOcrL2Available())) {
    return {
      pageCount: 0,
      charCount: 0,
      markdown: '',
      chunks: [],
      error: '暂时无法识别扫描件中的文字',
    }
  }

  const resolved = resolveRapidOcrModelDir()
  if (resolved.source === 'missing') {
    return {
      pageCount: 0,
      charCount: 0,
      markdown: '',
      chunks: [],
      error: '识别所需文件尚未就绪，请稍后重试',
    }
  }

  try {
    const ocr = await getOcrInstance(resolved.dir)
    if (isPdfBlob(blob, opts)) {
      const images = await rasterizePdfPages(blob)
      if (!images.length) {
        return {
          pageCount: 0,
          charCount: 0,
          markdown: '',
          chunks: [],
          error: '未能读取该研报页面',
        }
      }
      const pages: Array<{ page: number; text: string }> = []
      for (let i = 0; i < images.length; i++) {
        const img = images[i]
        let text = ''
        if (img) {
          try {
            text = (await detectImageWithOcr(ocr, img)).trim()
            touchOcrLastUsed()
          } catch {
            text = ''
          }
        }
        pages.push({ page: i + 1, text })
      }
      return buildResult(pages)
    }

    // 图片或其它：整文件当一页 OCR
    const text = (await detectImageWithOcr(ocr, blob)).trim()
    touchOcrLastUsed()
    if (!text) {
      return {
        pageCount: 1,
        charCount: 0,
        markdown: '',
        chunks: [],
        error: '未能识别图片中的文字，请换更清晰的图片后重试',
        emptyPageRatio: 1,
      }
    }
    return buildResult([{ page: 1, text }])
  } catch (err) {
    return {
      pageCount: 0,
      charCount: 0,
      markdown: '',
      chunks: [],
      error: err instanceof Error ? err.message : '未能识别扫描件中的文字',
    }
  }
}

export function createOcrL2Runner(opts: {
  timeoutMs?: number
  engineId?: 'ocr-l2' | 'rapidocr-l2' | 'unlimited-ocr-l2'
} = {}): ParseRunner {
  const engineId = opts.engineId ?? 'ocr-l2'
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS
  return {
    engineId,
    engineVersion: OCR_L2_ENGINE_VERSION,
    async isAvailable() {
      return isOcrL2Available()
    },
    async run(blob, runOpts) {
      const work = runOcrL2(blob, runOpts)
      if (!timeoutMs || timeoutMs <= 0) return work
      let timer: ReturnType<typeof setTimeout> | undefined
      try {
        return await Promise.race([
          work,
          new Promise<ParseRunResult>((resolve) => {
            timer = setTimeout(() => {
              resolve({
                pageCount: 0,
                charCount: 0,
                markdown: '',
                chunks: [],
                error: '识别超时，已保留先前整理结果',
              })
            }, timeoutMs)
          }),
        ])
      } finally {
        if (timer) clearTimeout(timer)
      }
    },
  }
}

/** @deprecated 使用 createOcrL2Runner；默认 engineId 仍为 rapidocr-l2 以兼容旧测试 */
export function createRapidOcrL2Runner(opts: {
  installDir?: string
  timeoutMs?: number
} = {}): ParseRunner {
  return createOcrL2Runner({ timeoutMs: opts.timeoutMs, engineId: 'rapidocr-l2' })
}

/** 兼容旧 API 占位 */
export function rapidocrWorkerScriptPath(_installDir?: string): string | null {
  return null
}

export function rapidocrPythonBin(_installDir?: string): string {
  return process.env.OPPTRIX_RAPIDOCR_PYTHON?.trim() || 'python3'
}
