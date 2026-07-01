import { useCallback, useEffect, useRef, useState } from 'react'
import { getConfig, research } from '../api/client'
import type { InstitutionRatingData, LatestEvalData, StrategySignalData } from '../types/schemas'
import type { ChipDistributionPoint } from '../types/market'
import type { WatchlistRadarItem } from '../types/schemas'
import { normalizeCode } from './format'
import type { RawDecisionPayload } from './useStockDecisionCard'

export type AnalysisStepStatus = 'pending' | 'running' | 'done' | 'error' | 'skipped'
export type AnalysisJobStatus = 'idle' | 'running' | 'done' | 'error'

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

function freshSteps(): AnalysisStep[] {
  return [
    { id: 'eval', label: 'G=B+M 评分', status: 'pending', message: null },
    { id: 'strategy', label: '多空倾向', status: 'pending', message: null },
    { id: 'institution', label: '研报观点', status: 'pending', message: null },
    { id: 'cyq', label: '筹码分布', status: 'pending', message: null },
    { id: 'radar', label: '估值与评分', status: 'pending', message: null },
  ]
}

function isAbort(e: unknown): boolean {
  return e instanceof Error && e.name === 'AbortError'
}

const STEP_HINTS: Record<string, string> = {
  eval: '正在计算基本面与动量评分…',
  strategy: '正在汇总多种策略看法，约需 10–30 秒',
  institution: '正在汇总券商研报观点，这一步通常最久',
  cyq: '正在获取筹码与成本区…',
  radar: '正在整理估值分位与评分摘要…',
}

export function useStockAnalysis(code: string | null) {
  const [status, setStatus] = useState<AnalysisJobStatus>('idle')
  const [steps, setSteps] = useState<AnalysisStep[]>(freshSteps())
  const [percent, setPercent] = useState(0)
  const [raw, setRaw] = useState<RawDecisionPayload | null>(null)
  const [error, setError] = useState('')
  const abortRef = useRef<AbortController | null>(null)

  const reset = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    setStatus('idle')
    setSteps(freshSteps())
    setPercent(0)
    setRaw(null)
    setError('')
  }, [])

  useEffect(() => {
    reset()
  }, [code, reset])

  const start = useCallback(async (force = false) => {
    if (!code || status === 'running') return
    if (!force && status === 'done' && raw) return

    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    let currentSteps = freshSteps()
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
      currentSteps = currentSteps.map(s =>
        s.id === stepId ? { ...s, status: 'running', message: hint } : s,
      )
      setSteps(currentSteps)
      setPercent(stepPercent(currentSteps))

      const result = await task()
      if (controller.signal.aborted) return false

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
        const resp = await research.latestEval(code, controller.signal, scorecard, force)
        if (resp.success && resp.data) payload.evalData = resp.data
        const label = resp.data?.scorecard ?? scorecard
        return {
          ok: resp.success,
          message: resp.success
            ? (resp.data?.gbm
              ? `${label} · B ${resp.data.gbm.b_score} / M ${resp.data.gbm.m_score}`
              : label)
            : (resp.message ?? '未能完成'),
        }
      })

      await runStep('strategy', STEP_HINTS.strategy, async () => {
        const resp = await research.strategySignals(code, controller.signal)
        if (resp.success && resp.data) payload.strategy = resp.data
        return { ok: resp.success, message: resp.success ? '已完成' : (resp.message ?? '未能完成') }
      })

      await runStep('institution', STEP_HINTS.institution, async () => {
        const resp = await research.institutionRating(code, undefined, controller.signal)
        if (resp.success && resp.data) payload.institution = resp.data
        return { ok: resp.success, message: resp.success ? '已完成' : (resp.message ?? '未能完成') }
      })

      await runStep('cyq', STEP_HINTS.cyq, async () => {
        const resp = await research.stockCyq(code, controller.signal)
        if (resp.success && resp.data?.latest) payload.cyq = resp.data.latest
        return { ok: resp.success, message: resp.success ? '已完成' : (resp.message ?? '未能完成') }
      })

      await runStep('radar', STEP_HINTS.radar, async () => {
        const resp = await research.watchlistRadar([code], controller.signal)
        const norm = normalizeCode(code)
        const items = resp.success ? (resp.data?.items ?? []) : []
        payload.radar = items.find(item => normalizeCode(item.code) === norm) ?? items[0] ?? null
        return { ok: resp.success, message: resp.success ? '已完成' : (resp.message ?? '未能完成') }
      })

      if (controller.signal.aborted) return

      setRaw(payload)
      setPercent(100)
      setStatus('done')

      if (!payload.evalData && !payload.strategy && !payload.institution && !payload.cyq) {
        setError('分析已结束，但未能获取到有效结果，请稍后重试')
        setStatus('error')
      }
    } catch (e) {
      if (controller.signal.aborted || isAbort(e)) return
      const msg = e instanceof Error ? e.message : '分析未能完成，请稍后重试'
      setError(msg)
      setStatus('error')
    } finally {
      if (abortRef.current === controller) abortRef.current = null
    }
  }, [code, status, raw])

  useEffect(() => () => { abortRef.current?.abort() }, [])

  return {
    status,
    steps,
    percent,
    raw,
    error,
    start,
    reset,
  }
}
