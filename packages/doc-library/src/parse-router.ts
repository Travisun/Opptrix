/**
 * Parse Router：L0 →（弱文本）L1 →（仍弱 / deepParse）L2。
 * 引擎不可用则保留最佳结果；不把 AGPL 链入主进程。
 */
import type { ParseEngineId, ParseRunOpts, ParseRunResult, ParseRunner } from './types.js'
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
  l1Available: boolean
  l2Available: boolean
}

function asTriedSet(tried: SelectEngineInput['tried']): Set<ParseEngineId> {
  return tried instanceof Set ? tried : new Set(tried)
}

function available(engine: ParseEngineId, input: SelectEngineInput): boolean {
  if (engine === 'pdf-extract-l0') return true
  if (engine === 'pdfplumber-l1') return input.l1Available
  if (engine === 'unlimited-ocr-l2') return input.l2Available
  return false
}

/**
 * 纯函数：根据当前质量与可用性选择下一引擎；无下一档返回 null。
 *
 * 规则：
 * - forceEngine：若可用且未试过 → 该引擎；否则忽略强制并按默认升阶
 * - 默认从未试过 → L0
 * - L0 后弱文本且 L1 可用 → L1
 * - L1 后仍弱或 deepParse，且 L2 可用 → L2
 */
export function selectEngine(input: SelectEngineInput): ParseEngineId | null {
  const tried = asTriedSet(input.tried)

  if (input.forceEngine && available(input.forceEngine, input) && !tried.has(input.forceEngine)) {
    return input.forceEngine
  }

  if (!tried.has('pdf-extract-l0') && !input.forceEngine) {
    return 'pdf-extract-l0'
  }

  // force 且已试过 / 不可用：若尚未跑过 L0，仍可回落 L0
  if (input.forceEngine && !tried.has('pdf-extract-l0') && input.forceEngine !== 'pdf-extract-l0') {
    if (!available(input.forceEngine, input)) {
      return 'pdf-extract-l0'
    }
  }

  const weak = input.current ? isWeakText(input.current) : true

  if (weak && input.l1Available && !tried.has('pdfplumber-l1')) {
    return 'pdfplumber-l1'
  }

  const wantL2 = weak || input.deepParse === true
  if (wantL2 && input.l2Available && !tried.has('unlimited-ocr-l2')) {
    // L2 须 deepParse 或 force（任务：L1 仍弱或 deepParse → L2；须已安装 + deepParse/force）
    if (input.deepParse === true || input.forceEngine === 'unlimited-ocr-l2') {
      return 'unlimited-ocr-l2'
    }
  }

  return null
}

export type ParseRouterDeps = {
  l0: ParseRunner
  l1?: ParseRunner | null
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
  readonly engineVersion = 'router-1.0.0'

  constructor(private readonly deps: ParseRouterDeps) {}

  async isAvailable(): Promise<boolean> {
    return true
  }

  private runnerFor(id: ParseEngineId): ParseRunner | null {
    if (id === 'pdf-extract-l0') return this.deps.l0
    if (id === 'pdfplumber-l1') return this.deps.l1 ?? null
    if (id === 'unlimited-ocr-l2') return this.deps.l2 ?? null
    return null
  }

  async run(blob: Buffer, opts: ParseRunOpts = {}): Promise<ParseRunResult> {
    const l1Available = await runnerAvailable(this.deps.l1)
    const l2Available = await runnerAvailable(this.deps.l2)
    const tried = new Set<ParseEngineId>()
    let best: ParseRunResult | null = null
    let lastError: string | undefined

    // force 不可用时先记录友好提示，再走默认升阶
    if (opts.forceEngine && !available(opts.forceEngine, {
      current: null,
      tried,
      l1Available,
      l2Available,
      forceEngine: opts.forceEngine,
      deepParse: opts.deepParse,
    })) {
      lastError = opts.forceEngine === 'unlimited-ocr-l2'
        ? '深度整理引擎尚未安装，已改用基础整理'
        : opts.forceEngine === 'pdfplumber-l1'
          ? '版面增强尚未就绪，已改用基础整理'
          : '指定整理方式不可用，已改用基础整理'
    }

    for (let step = 0; step < 3; step++) {
      const next = selectEngine({
        current: best ? metricsFromParseResult(best) : null,
        tried,
        deepParse: opts.deepParse,
        forceEngine: opts.forceEngine,
        l1Available,
        l2Available,
      })
      if (!next) break

      const runner = this.runnerFor(next)
      tried.add(next)
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
      return {
        pageCount: 0,
        charCount: 0,
        markdown: '',
        chunks: [],
        error: lastError ?? '未能整理该研报，请换可复制文本的电子版后再试',
        usedEngineId: 'pdf-extract-l0',
        usedEngineVersion: this.deps.l0.engineVersion,
      }
    }

    // 仍弱且用户要深度整理但 L2 不可用：附带提示，不覆盖已有正文
    if (
      opts.deepParse
      && isWeakText(metricsFromParseResult(best))
      && !l2Available
      && !best.error
    ) {
      return {
        ...best,
        error: undefined,
        // 不失败：保留最佳；提示走引擎状态 API / 设置
      }
    }

    if (lastError && best.charCount <= 0) {
      return { ...best, error: lastError }
    }

    return best
  }
}
