import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { fetchStockAnalysis, getConfig, research, saveStockAnalysis } from '../api/client'
import { displayCodeFromInstrument, instrumentKey, parseInstrumentInput } from './instrument'
import { hasApplicationCapability } from './capabilities'
import type { ApplicationCapability, InstrumentRef } from '../types/instrument'
import type { RawDecisionPayload } from './useStockDecisionCard'

export type AnalysisStepStatus = 'pending' | 'running' | 'done' | 'error' | 'skipped'
export type AnalysisJobStatus = 'idle' | 'loading' | 'running' | 'done' | 'error'

export interface AnalysisStep {
  id: string
  label: string
  status: AnalysisStepStatus
  message: string | null
}

function stepPercent(steps: AnalysisStep[]): number {
  const done = steps.filter(s => s.status === 'done' || s.status === 'skipped').length
  const running = steps.filter(s => s.status === 'running').length
  return Math.min(99, Math.round(((done + running * 0.4) / steps.length) * 100))
}

const STEP_CAPS: Record<string, ApplicationCapability> = {
  eval: 'scorecard',
  strategy: 'strategy_signal',
  institution: 'institution_rating',
  cyq: 'cyq',
  radar: 'scorecard',
}

const STEP_DEFS = [
  { id: 'eval', label: '综合评分' },
  { id: 'strategy', label: '多空倾向' },
  { id: 'institution', label: '研报观点' },
  { id: 'cyq', label: '筹码分布' },
  { id: 'radar', label: '估值与评分' },
]

function freshSteps(ref: InstrumentRef | null): AnalysisStep[] {
  return STEP_DEFS
    .filter(def => {
      const cap = STEP_CAPS[def.id]
      return !ref || (cap != null && hasApplicationCapability(ref, cap))
    })
    .map(def => ({ ...def, status: 'pending' as const, message: null }))
}

function isAbort(e: unknown): boolean {
  return e instanceof Error && e.name === 'AbortError'
}

function isRawPayload(value: unknown): value is RawDecisionPayload {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) return false
  const o = value as Record<string, unknown>
  return 'evalData' in o && 'strategy' in o && 'institution' in o && 'cyq' in o && 'radar' in o
}

const STEP_HINTS: Record<string, string> = {
  eval: '正在计算基本面与动量评分…',
  strategy: '正在汇总多种策略看法，约需 10–30 秒',
  institution: '正在汇总券商研报观点，这一步通常最久',
  cyq: '正在获取筹码与成本区…',
  radar: '正在整理估值分位与评分摘要…',
}

export function useStockAnalysis(code: string | null, instrument?: InstrumentRef | null) {
  const instrumentRef = useMemo(
    () => instrument ?? (code ? parseInstrumentInput(code) : null),
    [code, instrument],
  )
  const [status, setStatus] = useState<AnalysisJobStatus>('idle')
  const [steps, setSteps] = useState<AnalysisStep[]>(() => freshSteps(instrumentRef))
  const [percent, setPercent] = useState(0)
  const [raw, setRaw] = useState<RawDecisionPayload | null>(null)
  const [analyzedAt, setAnalyzedAt] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [canRestoreLast, setCanRestoreLast] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const hydrateSeqRef = useRef(0)
  const analysisSeqRef = useRef(0)
  const lastGoodRef = useRef<{ raw: RawDecisionPayload; analyzedAt: string } | null>(null)

  const reset = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    hydrateSeqRef.current += 1
    analysisSeqRef.current += 1
    lastGoodRef.current = null
    setCanRestoreLast(false)
    setStatus('idle')
    setSteps(freshSteps(instrumentRef))
    setPercent(0)
    setRaw(null)
    setAnalyzedAt(null)
    setError('')
  }, [instrumentRef])

  const restoreLast = useCallback(() => {
    const last = lastGoodRef.current
    if (!last) return
    setRaw(last.raw)
    setAnalyzedAt(last.analyzedAt)
    setError('')
    setPercent(100)
    setStatus('done')
  }, [])

  useEffect(() => {
    abortRef.current?.abort()
    abortRef.current = null
    analysisSeqRef.current += 1
    const hydrateSeq = ++hydrateSeqRef.current
    lastGoodRef.current = null
    setCanRestoreLast(false)
    setSteps(freshSteps(instrumentRef))
    setPercent(0)
    setRaw(null)
    setAnalyzedAt(null)
    setError('')

    if (!instrumentRef) {
      setStatus('idle')
      return
    }

    const key = instrumentKey(instrumentRef)
    setStatus('loading')
    const controller = new AbortController()
    abortRef.current = controller

    void (async () => {
      try {
        const cached = await fetchStockAnalysis(key, controller.signal)
        if (hydrateSeq !== hydrateSeqRef.current || controller.signal.aborted) return
        if (cached && isRawPayload(cached.raw) && typeof cached.analyzedAt === 'string') {
          lastGoodRef.current = { raw: cached.raw, analyzedAt: cached.analyzedAt }
          setCanRestoreLast(true)
          setRaw(cached.raw)
          setAnalyzedAt(cached.analyzedAt)
          setPercent(100)
          setStatus('done')
          return
        }
        setStatus('idle')
      } catch (e) {
        if (controller.signal.aborted || isAbort(e)) return
        if (hydrateSeq !== hydrateSeqRef.current) return
        setStatus('idle')
      } finally {
        if (abortRef.current === controller) abortRef.current = null
      }
    })()

    return () => {
      controller.abort()
    }
  }, [code, instrumentRef])

  const start = useCallback(async (force = false) => {
    if (!code || status === 'running' || status === 'loading') return
    if (!force && status === 'done' && raw) return
    if (!instrumentRef || !steps.length) {
      setError('该标的暂不支持投研分析')
      setStatus('error')
      return
    }

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    const analysisSeq = ++analysisSeqRef.current
    let currentSteps = freshSteps(instrumentRef)
    setSteps(currentSteps)
    setPercent(0)
    setRaw(null)
    setError('')
    setStatus('running')

    const payload: RawDecisionPayload = {
      evalData: null,
      strategy: null,
      institution: null,
      cyq: null,
      radar: null,
    }

    const runStep = async (
      stepId: string,
      hint: string,
      task: () => Promise<{ ok: boolean; message: string }>,
    ) => {
      if (!currentSteps.some(s => s.id === stepId)) return true
      currentSteps = currentSteps.map(s =>
        s.id === stepId ? { ...s, status: 'running', message: hint } : s,
      )
      setSteps(currentSteps)
      setPercent(stepPercent(currentSteps))

      const result = await task()
      if (controller.signal.aborted || analysisSeq !== analysisSeqRef.current) return false

      if (!result.ok) {
        currentSteps = currentSteps.map(s =>
          s.id === stepId ? { ...s, status: 'error', message: result.message } : s,
        )
        setSteps(currentSteps)
        throw new Error(result.message)
      }

      currentSteps = currentSteps.map(s =>
        s.id === stepId ? { ...s, status: 'done', message: result.message } : s,
      )
      setSteps(currentSteps)
      setPercent(stepPercent(currentSteps))
      return true
    }

    try {
      await runStep('eval', STEP_HINTS.eval, async () => {
        const cfg = await getConfig().catch(() => null)
        const scorecard = cfg?.default_scorecard || 'G=B+M'
        const resp = await research.latestEval(instrumentRef, controller.signal, scorecard, force)
        if (resp.success && resp.data) payload.evalData = resp.data
        const label = resp.data?.scorecard ?? scorecard
        return {
          ok: resp.success,
          message: resp.success
            ? (resp.data?.gbm
              ? `${label} · 基本面 ${resp.data.gbm.b_score} / 动量 ${resp.data.gbm.m_score}`
              : label)
            : (resp.message ?? '未能完成'),
        }
      })

      await runStep('strategy', STEP_HINTS.strategy, async () => {
        const resp = await research.strategySignals(instrumentRef, controller.signal)
        if (resp.success && resp.data) payload.strategy = resp.data
        return { ok: resp.success, message: resp.success ? '已完成' : (resp.message ?? '未能完成') }
      })

      await runStep('institution', STEP_HINTS.institution, async () => {
        const resp = await research.institutionRating(instrumentRef, undefined, controller.signal)
        if (resp.success && resp.data) payload.institution = resp.data
        return { ok: resp.success, message: resp.success ? '已完成' : (resp.message ?? '未能完成') }
      })

      await runStep('cyq', STEP_HINTS.cyq, async () => {
        const resp = await research.stockCyq(instrumentRef, controller.signal)
        if (resp.success && resp.data?.latest) payload.cyq = resp.data.latest
        return { ok: resp.success, message: resp.success ? '已完成' : (resp.message ?? '未能完成') }
      })

      await runStep('radar', STEP_HINTS.radar, async () => {
        const ref = instrumentRef ?? (code ? parseInstrumentInput(code) : null)
        const radarInput = ref ? displayCodeFromInstrument(ref) : (code ?? '')
        const resp = await research.watchlistRadar([radarInput], controller.signal)
        const matchKey = ref ? instrumentKey(ref) : (code ? instrumentKey(parseInstrumentInput(code)) : '')
        const items = resp.success ? (resp.data?.items ?? []) : []
        payload.radar = items.find(item => item.code === matchKey)
          ?? items.find(item => {
            const parsed = parseInstrumentInput(item.code)
            return parsed ? instrumentKey(parsed) === matchKey : false
          })
          ?? items[0]
          ?? null
        return { ok: resp.success, message: resp.success ? '已完成' : (resp.message ?? '未能完成') }
      })

      if (controller.signal.aborted || analysisSeq !== analysisSeqRef.current) return

      const at = new Date().toISOString()
      if (!payload.evalData && !payload.strategy && !payload.institution && !payload.cyq) {
        setError('分析已结束，但未能获取到有效结果，请稍后重试')
        setStatus('error')
        return
      }

      lastGoodRef.current = { raw: payload, analyzedAt: at }
      setCanRestoreLast(true)
      setRaw(payload)
      setAnalyzedAt(at)
      setPercent(100)
      setStatus('done')

      void saveStockAnalysis({
        instrumentKey: instrumentKey(instrumentRef),
        analyzedAt: at,
        raw: payload,
      }).catch(() => {
        /* 保存失败不挡展示 */
      })
    } catch (e) {
      if (controller.signal.aborted || isAbort(e) || analysisSeq !== analysisSeqRef.current) return
      const msg = e instanceof Error ? e.message : '分析未能完成，请稍后重试'
      setError(msg)
      setStatus('error')
    } finally {
      if (abortRef.current === controller) abortRef.current = null
    }
  }, [code, status, raw, instrumentRef, steps.length])

  useEffect(() => () => { abortRef.current?.abort() }, [])

  return {
    status,
    steps,
    percent,
    raw,
    analyzedAt,
    error,
    canRestoreLast,
    start,
    reset,
    restoreLast,
  }
}
