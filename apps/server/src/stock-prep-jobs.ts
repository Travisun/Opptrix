import type { ResearchHub } from '@inno-a-stock/research-hub'
import { normalizeCode } from '@inno-a-stock/a-stock-layer'

export type StockPrepStepId = 'quote' | 'klines' | 'evaluation' | 'analysis' | 'hydrate'
export type StockPrepStepStatus = 'pending' | 'running' | 'done' | 'error'
export type StockPrepJobStatus = 'idle' | 'running' | 'done' | 'error'

export interface StockPrepStep {
  id: StockPrepStepId
  label: string
  status: StockPrepStepStatus
  message: string | null
}

export interface StockPrepSnapshot {
  code: string
  status: StockPrepJobStatus
  steps: StockPrepStep[]
  percent: number
  message: string | null
  started_at: string | null
  updated_at: string
  error: string | null
}

const STEP_DEFS: Array<{ id: StockPrepStepId; label: string }> = [
  { id: 'quote', label: '行情与基本面' },
  { id: 'klines', label: 'K 线数据' },
  { id: 'evaluation', label: '因子评估' },
  { id: 'analysis', label: '策略与机构信号' },
  { id: 'hydrate', label: '股东与扩展资料' },
]

function freshSteps(): StockPrepStep[] {
  return STEP_DEFS.map(s => ({ ...s, status: 'pending', message: null }))
}

function idleSnapshot(code: string): StockPrepSnapshot {
  return {
    code,
    status: 'idle',
    steps: freshSteps(),
    percent: 0,
    message: null,
    started_at: null,
    updated_at: new Date().toISOString(),
    error: null,
  }
}

const snapshots = new Map<string, StockPrepSnapshot>()
const running = new Set<string>()

function patch(code: string, patch: Partial<StockPrepSnapshot>) {
  const prev = snapshots.get(code) ?? idleSnapshot(code)
  const next = { ...prev, ...patch, updated_at: new Date().toISOString() }
  snapshots.set(code, next)
  return next
}

function patchStep(code: string, stepId: StockPrepStepId, stepPatch: Partial<StockPrepStep>) {
  const snap = snapshots.get(code) ?? idleSnapshot(code)
  const steps = snap.steps.map(s => (s.id === stepId ? { ...s, ...stepPatch } : s))
  const doneCount = steps.filter(s => s.status === 'done').length
  const percent = Math.round((doneCount / steps.length) * 100)
  return patch(code, { steps, percent })
}

export function getStockPrep(code: string): StockPrepSnapshot {
  const normalized = normalizeCode(code)
  return snapshots.get(normalized) ?? idleSnapshot(normalized)
}

export function startStockPrep(hub: ResearchHub, code: string, opts?: { force?: boolean }): StockPrepSnapshot {
  const normalized = normalizeCode(code)
  const existing = snapshots.get(normalized)
  if (running.has(normalized)) {
    return existing ?? idleSnapshot(normalized)
  }
  if (!opts?.force && existing?.status === 'done') {
    const age = Date.now() - new Date(existing.updated_at).getTime()
    if (age < 60 * 60 * 1000) return existing
  }

  const now = new Date().toISOString()
  const snap: StockPrepSnapshot = {
    code: normalized,
    status: 'running',
    steps: freshSteps(),
    percent: 0,
    message: '后台准备个股数据…',
    started_at: now,
    updated_at: now,
    error: null,
  }
  snapshots.set(normalized, snap)
  running.add(normalized)

  void (async () => {
    try {
      for (const def of STEP_DEFS) {
        patchStep(normalized, def.id, { status: 'running', message: `正在${def.label}…` })
        patch(normalized, { message: `正在${def.label}…` })

        switch (def.id) {
          case 'quote': {
            const resp = await hub.dispatch('stock_detail', { code: normalized })
            if (!resp.success) throw new Error(resp.message || '行情加载失败')
            patchStep(normalized, def.id, { status: 'done', message: '已同步' })
            break
          }
          case 'klines': {
            const resp = await hub.dispatch('stock_kline', { code: normalized, count: 120 })
            if (!resp.success) throw new Error(resp.message || 'K 线加载失败')
            patchStep(normalized, def.id, { status: 'done', message: '已同步' })
            break
          }
          case 'evaluation': {
            const resp = await hub.dispatch('latest_evaluation', { code: normalized })
            if (!resp.success) throw new Error(resp.message || '因子评估失败')
            patchStep(normalized, def.id, { status: 'done', message: '已生成' })
            break
          }
          case 'analysis': {
            const [sig, inst] = await Promise.all([
              hub.dispatch('strategy_signal', { code: normalized }),
              hub.dispatch('institution_rating', { code: normalized }),
            ])
            if (!sig.success && !inst.success) {
              throw new Error(sig.message || inst.message || '分析信号加载失败')
            }
            patchStep(normalized, def.id, { status: 'done', message: '已生成' })
            break
          }
          case 'hydrate': {
            await hub.marketData.hydrateStocks([normalized], 'detail')
            patchStep(normalized, def.id, { status: 'done', message: '已同步' })
            break
          }
        }
      }
      patch(normalized, {
        status: 'done',
        percent: 100,
        message: '数据已就绪，可随时查看',
        error: null,
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      const snapNow = snapshots.get(normalized)
      const failedStep = snapNow?.steps.find(s => s.status === 'running')
      if (failedStep) {
        patchStep(normalized, failedStep.id, { status: 'error', message: msg })
      }
      patch(normalized, { status: 'error', message: msg, error: msg })
    } finally {
      running.delete(normalized)
    }
  })()

  return snap
}
