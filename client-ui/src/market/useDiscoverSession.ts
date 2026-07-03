import { useCallback, useEffect, useRef, useState } from 'react'
import {
  cancelDiscoverJob,
  deleteDiscoverJob,
  getDiscoverJob,
  listDiscoverJobs,
  startDiscoverRun,
} from '../api/client'
import type { DiscoverJobSnapshot, DiscoverRunResult } from '../types/schemas'

const POLL_MS = 1200

export interface DiscoverSessionState {
  history: DiscoverJobSnapshot[]
  activeJobId: string | null
  job: DiscoverJobSnapshot | null
  result: DiscoverRunResult | null
  running: boolean
  error: string
  selectedStrategyId: string | null
  refreshHistory: () => Promise<void>
  selectStrategy: (id: string) => void
  runStrategy: (strategyId: string, profile?: import('../types/schemas').DiscoverStrategyProfile) => Promise<void>
  runCustomStrategy: (opts: {
    id: string
    name: string
    prompt: string
    profile?: import('../types/schemas').DiscoverStrategyProfile
  }) => Promise<void>
  cancelRun: () => Promise<void>
  loadHistoryJob: (job: DiscoverJobSnapshot) => void
  deleteHistoryJob: (jobId: string) => Promise<boolean>
  deleteError: string
  clearDeleteError: () => void
}

export function useDiscoverSession(): DiscoverSessionState {
  const [history, setHistory] = useState<DiscoverJobSnapshot[]>([])
  const [activeJobId, setActiveJobId] = useState<string | null>(null)
  const [job, setJob] = useState<DiscoverJobSnapshot | null>(null)
  const [result, setResult] = useState<DiscoverRunResult | null>(null)
  const [running, setRunning] = useState(false)
  const [error, setError] = useState('')
  const [selectedStrategyId, setSelectedStrategyId] = useState<string | null>(null)
  const [deleteError, setDeleteError] = useState('')
  const pollRef = useRef<number | null>(null)
  const viewingJobIdRef = useRef<string | null>(null)
  const historyRef = useRef<DiscoverJobSnapshot[]>([])

  useEffect(() => {
    historyRef.current = history
  }, [history])

  useEffect(() => {
    viewingJobIdRef.current = job?.id ?? null
  }, [job?.id])

  const stopPoll = useCallback(() => {
    if (pollRef.current != null) {
      window.clearInterval(pollRef.current)
      pollRef.current = null
    }
  }, [])

  const refreshHistory = useCallback(async () => {
    try {
      const resp = await listDiscoverJobs()
      const jobs = resp.jobs ?? []
      setHistory(jobs)
      return jobs
    } catch {
      return []
    }
  }, [])

  useEffect(() => {
    void (async () => {
      const jobs = await refreshHistory()
      const runningJob = jobs.find(j => j.status === 'running')
      if (runningJob) {
        setActiveJobId(runningJob.id)
        setJob(runningJob)
        setRunning(true)
        if (runningJob.result) setResult(runningJob.result)
      }
    })()
    return () => stopPoll()
  }, [refreshHistory, stopPoll])

  const pollJob = useCallback(async (id: string) => {
    const resp = await getDiscoverJob(id)
    const snap = resp.job
    setJob(snap)
    if (snap.status === 'done' && snap.result) {
      setResult(snap.result)
      setRunning(false)
      setActiveJobId(null)
      stopPoll()
      void refreshHistory()
    } else if (snap.status === 'error' || snap.status === 'cancelled') {
      setError(snap.error || snap.message || '执行失败')
      setRunning(false)
      setActiveJobId(null)
      stopPoll()
      void refreshHistory()
    }
  }, [refreshHistory, stopPoll])

  useEffect(() => {
    if (!activeJobId || !running) return undefined
    stopPoll()
    pollRef.current = window.setInterval(() => {
      void pollJob(activeJobId)
    }, POLL_MS)
    void pollJob(activeJobId)
    return () => stopPoll()
  }, [activeJobId, running, pollJob, stopPoll])

  const runStrategy = useCallback(async (
    strategyId: string,
    profile?: import('../types/schemas').DiscoverStrategyProfile,
  ) => {
    stopPoll()
    setRunning(true)
    setError('')
    setResult(null)
    setJob(null)
    setSelectedStrategyId(strategyId)
    try {
      const start = await startDiscoverRun({ strategy_id: strategyId })
      setActiveJobId(start.job_id)
      setJob({
        id: start.job_id,
        status: 'running',
        phase: start.phase as DiscoverJobSnapshot['phase'],
        message: start.message,
        percent: 2,
        strategy_id: strategyId,
        strategy_name: '',
        profile,
        prompt: '',
        model: null,
        started_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        result: null,
        error: null,
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : '启动失败')
      setRunning(false)
      setActiveJobId(null)
    }
  }, [stopPoll])

  const runCustomStrategy = useCallback(async (opts: {
    id: string
    name: string
    prompt: string
    profile?: import('../types/schemas').DiscoverStrategyProfile
  }) => {
    stopPoll()
    setRunning(true)
    setError('')
    setResult(null)
    setJob(null)
    setSelectedStrategyId(opts.id)
    try {
      const start = await startDiscoverRun({
        custom_prompt: opts.prompt,
        custom_name: opts.name,
        custom_id: opts.id,
        profile: opts.profile,
      })
      setActiveJobId(start.job_id)
      setJob({
        id: start.job_id,
        status: 'running',
        phase: start.phase as DiscoverJobSnapshot['phase'],
        message: start.message,
        percent: 2,
        strategy_id: opts.id,
        strategy_name: opts.name,
        profile: opts.profile,
        prompt: opts.prompt,
        model: null,
        started_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
        result: null,
        error: null,
      })
    } catch (e) {
      setError(e instanceof Error ? e.message : '启动失败')
      setRunning(false)
      setActiveJobId(null)
    }
  }, [stopPoll])

  const cancelRun = useCallback(async () => {
    const id = activeJobId
    if (!id) return
    try {
      await cancelDiscoverJob(id)
    } catch { /* ignore */ }
    stopPoll()
    setRunning(false)
    setActiveJobId(null)
    setJob(prev => prev ? { ...prev, status: 'cancelled', message: '已取消' } : prev)
    void refreshHistory()
  }, [activeJobId, refreshHistory, stopPoll])

  const loadHistoryJob = useCallback((histJob: DiscoverJobSnapshot) => {
    setJob(histJob)
    setResult(histJob.result)
    setError(histJob.status === 'error' ? (histJob.error || histJob.message) : '')
    setRunning(histJob.status === 'running')
    setActiveJobId(histJob.status === 'running' ? histJob.id : null)
    setSelectedStrategyId(histJob.strategy_id)
  }, [])

  const clearViewingJob = useCallback(() => {
    viewingJobIdRef.current = null
    setJob(null)
    setResult(null)
    setError('')
  }, [])

  const deleteHistoryJob = useCallback(async (jobId: string) => {
    setDeleteError('')
    const viewingDeleted = viewingJobIdRef.current === jobId || activeJobId === jobId
    const prevHistory = historyRef.current

    setHistory(prev => prev.filter(j => j.id !== jobId))

    if (viewingDeleted) {
      stopPoll()
      setRunning(false)
      setActiveJobId(null)
      clearViewingJob()
    }

    try {
      await deleteDiscoverJob(jobId)
    } catch (e) {
      const msg = e instanceof Error ? e.message : ''
      setDeleteError(
        msg.includes('not running')
          ? '删除失败：请重启应用或 API 服务后再试'
          : '删除失败，请稍后重试',
      )
      setHistory(prevHistory)
      if (viewingDeleted) {
        const jobs = await refreshHistory()
        const restored = jobs.find(j => j.id === jobId)
        if (restored) {
          setJob(restored)
          setResult(restored.result)
          setError(restored.status === 'error' ? (restored.error || restored.message) : '')
          setRunning(restored.status === 'running')
          setActiveJobId(restored.status === 'running' ? restored.id : null)
        }
      }
      return false
    }

    await refreshHistory()
    return true
  }, [activeJobId, clearViewingJob, refreshHistory, stopPoll])

  const clearDeleteError = useCallback(() => setDeleteError(''), [])

  return {
    history,
    activeJobId,
    job,
    result,
    running,
    error,
    selectedStrategyId,
    refreshHistory,
    selectStrategy: setSelectedStrategyId,
    runStrategy,
    runCustomStrategy,
    cancelRun,
    loadHistoryJob,
    deleteHistoryJob,
    deleteError,
    clearDeleteError,
  }
}
