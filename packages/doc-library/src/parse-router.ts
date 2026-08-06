/**
 * Parse Router：按 kind/mime 选首引擎；PDF：l0 →（弱文本 / deepParse）→ OCR。
 * 已移除 pdfplumber L1 默认路径；不把 AGPL 链入主进程。
 */
import type { DocumentKind, ParseEngineId, ParseRunOpts, ParseRunResult, ParseRunner } from './types.js'
import { isOcrEngineId } from './types.js'
import { documentKindFromMime } from './document-kind.js'
import {
  isWeakText,
  metricsFromParseResult,
  pickBetterResult,
  type ParseQualityMetrics,
} from './parse-quality.js'

export type SelectEngineInput = {
  /** 当前最佳结果指标；null = 尚未跑过任何引擎 */
  current: ParseQualityMetrics | null
  tried: ReadonlySet<ParseEngineId> | readonly ParseEngineId[]
  deepParse?: boolean
  forceEngine?: ParseEngineId
  kind?: DocumentKind
  mime?: string
  filename?: string
  /** @deprecated L1 已移除；保留字段以免旧测试编译失败，恒视为 false */
  l1Available?: boolean
  ocrAvailable: boolean
  /** @deprecated 使用 ocrAvailable */
  l2Available?: boolean
}

function asTriedSet(tried: SelectEngineInput['tried']): Set<ParseEngineId> {
  return tried instanceof Set ? tried : new Set(tried)
}

function triedOcr(tried: Set<ParseEngineId>): boolean {
  return tried.has('ocr-l2') || tried.has('rapidocr-l2') || tried.has('unlimited-ocr-l2')
}

function ocrAvailableOf(input: SelectEngineInput): boolean {
  return input.ocrAvailable || input.l2Available === true
}

function resolveKind(input: SelectEngineInput): DocumentKind {
  const fromMime = documentKindFromMime(input.mime ?? '', input.filename)
  // 硬性：mime/扩展名像纯文本时绝不能落到 PDF
  if (fromMime === 'text' || input.kind === 'text') return 'text'
  if (input.kind && input.kind !== 'other') return input.kind
  if (fromMime !== 'other') return fromMime
  // other / 未知：保持 PDF 路径（与历史行为一致）
  return input.kind === 'other' ? 'other' : 'pdf'
}

function available(engine: ParseEngineId, input: SelectEngineInput): boolean {
  if (engine === 'text-l0' || engine === 'office-l0' || engine === 'pdf-extract-l0') return true
  if (engine === 'pdfplumber-l1') return false
  if (isOcrEngineId(engine)) return ocrAvailableOf(input)
  return false
}

/**
 * 纯函数：根据 kind / 质量与可用性选择下一引擎；无下一档返回 null。
 *
 * 规则：
 * - forceEngine：若可用且未试过 → 该引擎
 * - text → text-l0
 * - docx/doc/pptx/ppt → office-l0
 * - image → ocr-l2（不可用则无下一档）
 * - pdf → pdf-extract-l0；弱文本或 deepParse 且 OCR 可用 → ocr-l2
 */
export function selectEngine(input: SelectEngineInput): ParseEngineId | null {
  const tried = asTriedSet(input.tried)
  const kind = resolveKind(input)
  const ocrOk = ocrAvailableOf(input)

  if (input.forceEngine && available(input.forceEngine, input)) {
    if (isOcrEngineId(input.forceEngine)) {
      if (!triedOcr(tried)) return input.forceEngine
    } else if (input.forceEngine !== 'pdfplumber-l1' && !tried.has(input.forceEngine)) {
      return input.forceEngine
    }
  }

  if (kind === 'text') {
    if (!tried.has('text-l0')) return 'text-l0'
    return null
  }

  if (kind === 'docx' || kind === 'doc' || kind === 'pptx' || kind === 'ppt') {
    if (!tried.has('office-l0')) return 'office-l0'
    return null
  }

  if (kind === 'image') {
    if (ocrOk && !triedOcr(tried)) return 'ocr-l2'
    return null
  }

  // pdf / other → PDF 路径
  if (!tried.has('pdf-extract-l0') && !input.forceEngine) {
    return 'pdf-extract-l0'
  }

  if (input.forceEngine && !tried.has('pdf-extract-l0') && input.forceEngine !== 'pdf-extract-l0') {
    if (!available(input.forceEngine, input)) {
      return 'pdf-extract-l0'
    }
  }

  const weak = input.current ? isWeakText(input.current) : true
  const wantOcr = weak || input.deepParse === true
  if (wantOcr && ocrOk && !triedOcr(tried)) {
    return 'ocr-l2'
  }

  return null
}

export type ParseRouterDeps = {
  text?: ParseRunner | null
  office?: ParseRunner | null
  pdf: ParseRunner
  ocr?: ParseRunner | null
  /** @deprecated 已忽略 */
  l0?: ParseRunner
  /** @deprecated 已忽略 */
  l1?: ParseRunner | null
  /** @deprecated 使用 ocr */
  l2?: ParseRunner | null
}

async function runnerAvailable(runner: ParseRunner | null | undefined): Promise<boolean> {
  if (!runner) return false
  if (!runner.isAvailable) return true
  return Boolean(await runner.isAvailable())
}

function withUsedEngine(result: ParseRunResult, runner: ParseRunner): ParseRunResult {
  return {
    ...result,
    usedEngineId: runner.engineId,
    usedEngineVersion: runner.engineVersion,
  }
}

/**
 * 级联执行 ParseRunner；实现 ParseRunner 以便注入 DocLibraryService。
 */
export class ParseRouter implements ParseRunner {
  readonly engineId: ParseEngineId = 'pdf-extract-l0'
  readonly engineVersion = 'router-2.0.0'

  constructor(private readonly deps: ParseRouterDeps) {}

  async isAvailable(): Promise<boolean> {
    return true
  }

  private pdfRunner(): ParseRunner {
    return this.deps.pdf ?? this.deps.l0!
  }

  private runnerFor(id: ParseEngineId): ParseRunner | null {
    if (id === 'text-l0') return this.deps.text ?? null
    if (id === 'office-l0') return this.deps.office ?? null
    if (id === 'pdf-extract-l0') return this.pdfRunner()
    if (isOcrEngineId(id)) return this.deps.ocr ?? this.deps.l2 ?? null
    return null
  }

  async run(blob: Buffer, opts: ParseRunOpts = {}): Promise<ParseRunResult> {
    const ocrRunner = this.deps.ocr ?? this.deps.l2
    const ocrAvailable = await runnerAvailable(ocrRunner)
    const tried = new Set<ParseEngineId>()
    let best: ParseRunResult | null = null
    let lastError: string | undefined

    const selectBase = {
      kind: opts.kind,
      mime: opts.mime,
      filename: opts.filename,
      ocrAvailable,
      l2Available: ocrAvailable,
      deepParse: opts.deepParse,
      forceEngine: opts.forceEngine,
    }

    if (opts.forceEngine && !available(opts.forceEngine, {
      current: null,
      tried,
      ...selectBase,
    })) {
      lastError = isOcrEngineId(opts.forceEngine)
        ? '扫描件识别尚未安装，已改用基础整理'
        : opts.forceEngine === 'pdfplumber-l1'
          ? '指定整理方式已停用，已改用基础整理'
          : '指定整理方式不可用，已改用基础整理'
    }

    for (let step = 0; step < 4; step++) {
      const next = selectEngine({
        current: best ? metricsFromParseResult(best) : null,
        tried,
        ...selectBase,
      })
      if (!next) break

      const runner = this.runnerFor(next)
      tried.add(next)
      if (isOcrEngineId(next)) {
        tried.add('ocr-l2')
        tried.add('rapidocr-l2')
        tried.add('unlimited-ocr-l2')
      }
      if (!runner) continue

      try {
        const raw = await runner.run(blob, opts)
        const tagged = withUsedEngine(raw, runner)
        if (tagged.error && tagged.charCount <= 0) {
          lastError = tagged.error
          continue
        }
        best = best ? pickBetterResult(best, tagged) : tagged
        if (tagged.error) lastError = tagged.error
      } catch (err) {
        lastError = err instanceof Error ? err.message : '整理失败'
      }
    }

    if (!best) {
      const imageNoOcr = selectBase.kind === 'image' || (selectBase.mime ?? '').startsWith('image/')
      const fallbackError = imageNoOcr && !ocrAvailable
        ? '暂时无法识别图片中的文字，请稍后重试或换更清晰的图片'
        : (lastError ?? '未能整理该文件，请换可读文本后再试')
      return {
        pageCount: 0,
        charCount: 0,
        markdown: '',
        chunks: [],
        error: fallbackError,
        usedEngineId: imageNoOcr ? 'ocr-l2' : 'pdf-extract-l0',
        usedEngineVersion: imageNoOcr
          ? (ocrRunner?.engineVersion ?? 'unavailable')
          : this.pdfRunner().engineVersion,
      }
    }

    if (
      opts.deepParse
      && isWeakText(metricsFromParseResult(best))
      && !ocrAvailable
      && !best.error
    ) {
      return { ...best, error: undefined }
    }

    if (lastError && best.charCount <= 0) {
      return { ...best, error: lastError }
    }

    return best
  }
}
