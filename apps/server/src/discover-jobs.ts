import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { randomUUID } from 'node:crypto'
import { getUserDataStore } from '@opptrix/user-store'
import type { AgentEngine } from '@opptrix/agent'
import { getDiscoverStrategy, primaryDiscoverProfile } from '@opptrix/agent'
import type { DiscoverPhase, DiscoverProgress, DiscoverResult } from '@opptrix/agent'
import type { DiscoverStrategyProfile } from '@opptrix/shared'
import { defaultDiscoverProfile } from '@opptrix/shared'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const LEGACY_STORE_PATH = path.resolve(__dirname, '../data/discover-jobs.json')
const NAMESPACE = 'discover_job'

export type DiscoverJobStatus = 'running' | 'done' | 'error' | 'cancelled'

export interface DiscoverJobSnapshot {
  id: string
  status: DiscoverJobStatus
  phase: DiscoverPhase
  message: string
  percent: number
  strategy_id: string
  strategy_name: string
  profile: DiscoverStrategyProfile
  prompt: string
  model: string | null
  started_at: string
  updated_at: string
  result: DiscoverResult | null
  error: string | null
}

const jobs = new Map<string, DiscoverJobSnapshot>()
const abortControllers = new Map<string, AbortController>()

const JOB_TTL_MS = 7 * 24 * 60 * 60 * 1000
const MAX_STORED_JOBS = 80

function loadFromDisk() {
  const store = getUserDataStore()

  try {
    if (fs.existsSync(LEGACY_STORE_PATH)) {
      const raw = JSON.parse(fs.readFileSync(LEGACY_STORE_PATH, 'utf8')) as DiscoverJobSnapshot[]
      if (Array.isArray(raw)) {
        for (const job of raw) {
          store.setDocument(NAMESPACE, job.id, job.status === 'running'
            ? { ...job, status: 'error', phase: 'error', message: '服务重启，任务已中断', error: '服务重启，任务已中断' }
            : job)
        }
      }
    }
  } catch {
    // ignore corrupt legacy store
  }

  for (const job of store.listDocuments<DiscoverJobSnapshot>(NAMESPACE)) {
    if (job.status === 'running') {
      jobs.set(job.id, { ...job, status: 'error', phase: 'error', message: '服务重启，任务已中断', error: '服务重启，任务已中断' })
    } else {
      jobs.set(job.id, job)
    }
  }
}

function persistToDisk() {
  const store = getUserDataStore()
  const list = [...jobs.values()]
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
    .slice(0, MAX_STORED_JOBS)
  const keep = new Set(list.map(job => job.id))
  for (const job of list) {
    store.setDocument(NAMESPACE, job.id, job)
  }
  for (const id of store.listDocumentIds(NAMESPACE)) {
    if (!keep.has(id)) store.deleteDocument(NAMESPACE, id)
  }
}

loadFromDisk()

function pruneOldJobs() {
  const cutoff = Date.now() - JOB_TTL_MS
  for (const [id, job] of jobs) {
    if (new Date(job.updated_at).getTime() < cutoff && job.status !== 'running') {
      jobs.delete(id)
      abortControllers.delete(id)
    }
  }
  persistToDisk()
}

function patchJob(id: string, patch: Partial<DiscoverJobSnapshot>) {
  const job = jobs.get(id)
  if (!job) return
  Object.assign(job, patch, { updated_at: new Date().toISOString() })
  persistToDisk()
}

export function listDiscoverJobs(limit = 30): DiscoverJobSnapshot[] {
  pruneOldJobs()
  return [...jobs.values()]
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime())
    .slice(0, limit)
}

export function getDiscoverJob(id: string): DiscoverJobSnapshot | null {
  return jobs.get(id) ?? null
}

export function cancelDiscoverJob(id: string): boolean {
  const ac = abortControllers.get(id)
  if (ac) ac.abort()
  const job = jobs.get(id)
  if (!job || job.status !== 'running') return false
  patchJob(id, { status: 'cancelled', phase: 'error', message: '已取消', error: '已取消' })
  return true
}

export function deleteDiscoverJob(id: string): boolean {
  const job = jobs.get(id)
  if (!job) return false
  if (job.status === 'running') {
    abortControllers.get(id)?.abort()
    abortControllers.delete(id)
  }
  jobs.delete(id)
  persistToDisk()
  return true
}

export function startDiscoverJob(
  agent: AgentEngine,
  strategyId: string,
  model?: string,
): DiscoverJobSnapshot {
  const strategy = getDiscoverStrategy(strategyId)
  if (!strategy) throw new Error(`未知策略: ${strategyId}`)
  const profile = primaryDiscoverProfile(strategy)
  if (profile === 'cn_equity') {
    throw new Error('A 股自动选股策略已移除（本地因子不可用），请改用 ETF 或跨市场策略')
  }

  pruneOldJobs()
  const id = randomUUID()
  const now = new Date().toISOString()
  const prompt = `${strategy.name}：${strategy.description}`

  const job: DiscoverJobSnapshot = {
    id,
    status: 'running',
    phase: 'parsing',
    message: '准备执行…',
    percent: 0,
    strategy_id: strategyId,
    strategy_name: strategy.name,
    profile,
    prompt,
    model: model?.trim() || null,
    started_at: now,
    updated_at: now,
    result: null,
    error: null,
  }
  jobs.set(id, job)
  persistToDisk()

  const ac = new AbortController()
  abortControllers.set(id, ac)

  void (async () => {
    const onProgress = (p: DiscoverProgress) => {
      if (jobs.get(id)?.status === 'cancelled') return
      patchJob(id, {
        phase: p.phase,
        message: p.message,
        percent: p.percent,
        status: p.phase === 'done' ? 'done' : 'running',
      })
    }

    try {
      const result = await agent.discover.runStrategy(strategyId, onProgress, model, ac.signal)
      patchJob(id, {
        status: 'done',
        phase: 'done',
        message: `完成，输出 ${result.items.length} 只`,
        percent: 100,
        result,
        error: null,
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      const cancelled = msg === '已取消' || ac.signal.aborted
      patchJob(id, {
        status: cancelled ? 'cancelled' : 'error',
        phase: 'error',
        message: msg,
        error: msg,
      })
    } finally {
      abortControllers.delete(id)
    }
  })()

  return job
}

export function startDiscoverCustomJob(
  agent: AgentEngine,
  prompt: string,
  strategyName: string,
  strategyId: string,
  model?: string,
  profile: DiscoverStrategyProfile = defaultDiscoverProfile(),
): DiscoverJobSnapshot {
  const text = prompt.trim()
  if (!text) throw new Error('请输入选股策略描述')
  if (profile === 'cn_equity') {
    throw new Error('A 股自动选股策略已移除（本地因子不可用），请改用 ETF 或跨市场策略')
  }

  pruneOldJobs()
  const id = randomUUID()
  const now = new Date().toISOString()

  const job: DiscoverJobSnapshot = {
    id,
    status: 'running',
    phase: 'parsing',
    message: '准备执行…',
    percent: 0,
    strategy_id: strategyId,
    strategy_name: strategyName.trim() || '自建策略',
    profile,
    prompt: text,
    model: model?.trim() || null,
    started_at: now,
    updated_at: now,
    result: null,
    error: null,
  }
  jobs.set(id, job)
  persistToDisk()

  const ac = new AbortController()
  abortControllers.set(id, ac)

  void (async () => {
    const onProgress = (p: DiscoverProgress) => {
      if (jobs.get(id)?.status === 'cancelled') return
      patchJob(id, {
        phase: p.phase,
        message: p.message,
        percent: p.percent,
        status: p.phase === 'done' ? 'done' : 'running',
      })
    }

    try {
      const result = await agent.discover.run(text, onProgress, model, ac.signal, profile)
      patchJob(id, {
        status: 'done',
        phase: 'done',
        message: `完成，输出 ${result.items.length} 只`,
        percent: 100,
        result: { ...result, strategy_id: strategyId },
        error: null,
      })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      const cancelled = msg === '已取消' || ac.signal.aborted
      patchJob(id, {
        status: cancelled ? 'cancelled' : 'error',
        phase: 'error',
        message: msg,
        error: msg,
      })
    } finally {
      abortControllers.delete(id)
    }
  })()

  return job
}
