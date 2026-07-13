import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ProgressBar,
  Spinner,
  Text,
  makeStyles,
  mergeClasses,
} from '@fluentui/react-components'
import {
  CheckmarkCircleFilled,
  CheckmarkRegular,
  DismissCircleRegular,
  ArrowSyncRegular,
  ArrowSyncCircleRegular,
} from '@fluentui/react-icons'
import { research } from '../../api/client'
import type {
  MarketDataSyncState,
  MarketDbStatusData,
} from '../../types/market'
import { SettingsGroup } from './SettingsPrimitives'
import { useSettingsToast } from './SettingsToast'
import { opptrixTokens, opptrixCssVars } from '../../theme/tokens'
import OpptrixButton from '../../components/opptrix/OpptrixButton'

const POLL_IDLE_MS = 30_000
const POLL_BURST_MS = 800
const THS_KLINE_JOBS = new Set(['kline_bootstrap', 'kline_daily'])

function runningBatchProgress(
  syncState: MarketDataSyncState | null,
): { current: number; total: number } | null {
  if (!syncState) return null
  if ((syncState.job_batch_total ?? 0) > 0) {
    return {
      current: syncState.job_batch_current ?? 0,
      total: syncState.job_batch_total ?? 0,
    }
  }
  if ((syncState.job_total ?? 0) > 0) {
    return {
      current: syncState.job_current ?? 0,
      total: syncState.job_total ?? 0,
    }
  }
  return null
}

type BootstrapGateKey = 'initial_cn' | 'initial_taxonomy' | 'initial_cn_etf' | 'initial_hk' | 'initial_us'

/** 完成态由 bootstrap 门控判定（StockIndex 名录 / taxonomy 等非逐股进度任务） */
const BOOTSTRAP_GATE_JOBS: Record<string, BootstrapGateKey> = {
  initial_cn_universe: 'initial_cn',
  initial_cn_etf: 'initial_cn_etf',
  initial_hk_universe: 'initial_hk',
  initial_us_universe: 'initial_us',
  initial_taxonomy: 'initial_taxonomy',
}

const SYNC_JOB_LABELS: Record<string, string> = {
  initial_cn_universe: 'A 股名录',
  initial_cn_etf: 'A 股 ETF',
  initial_hk_universe: '港股名录',
  initial_us_universe: '美股名录',
  initial_taxonomy: 'A 股行业/板块',
  kline_bootstrap: 'A 股 K 线',
}

/** 设置页展示的任务（不含 kline_daily — 全量包已含近期日 K，增量维护在后台按 TTL 执行） */
const SYNC_JOB_ITEMS = [
  'initial_cn_universe',
  'initial_cn_etf',
  'initial_hk_universe',
  'initial_us_universe',
  'initial_taxonomy',
  'kline_bootstrap',
] as const

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
  },
  sectionBlock: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  sectionLabel: {
    fontSize: '13px',
    fontWeight: 600,
    color: opptrixCssVars.textSecondary,
    letterSpacing: '-0.01em',
    paddingLeft: '2px',
  },
  statusBanner: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '12px 16px',
    borderRadius: opptrixTokens.radiusMd,
    border: `1px solid ${opptrixCssVars.border}`,
    backgroundColor: opptrixCssVars.canvas,
  },
  statusBannerReady: {
    backgroundColor: opptrixCssVars.successSoft,
  },
  statusBannerSyncing: {
    backgroundColor: opptrixCssVars.infoSoft,
  },
  statusBannerIcon: {
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '28px',
    height: '28px',
    borderRadius: opptrixTokens.radiusFull,
  },
  statusBannerText: {
    flex: 1,
    minWidth: 0,
  },
  statusBannerAction: {
    flexShrink: 0,
  },
  statusBannerActionBtn: {
    backgroundColor: opptrixCssVars.canvas,
    border: `1px solid ${opptrixCssVars.border}`,
    boxShadow: '0 1px 2px rgba(0, 0, 0, 0.04)',
    ':hover': {
      backgroundColor: opptrixCssVars.canvasAlt,
      border: `1px solid ${opptrixCssVars.separatorStrong}`,
    },
  },
  statusBannerTitle: {
    fontSize: '13px',
    fontWeight: 600,
    color: opptrixCssVars.textPrimary,
    lineHeight: 1.4,
  },
  statusBannerDesc: {
    fontSize: '12px',
    color: opptrixCssVars.textSecondary,
    lineHeight: 1.5,
    marginTop: '2px',
  },
  statsRow: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, 1fr)',
    gap: '1px',
    borderRadius: opptrixTokens.radiusMd,
    overflow: 'hidden',
    border: `1px solid ${opptrixCssVars.border}`,
  },
  statCell: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '2px',
    padding: '12px 8px',
    backgroundColor: opptrixCssVars.canvas,
  },
  statCellLabel: {
    fontSize: '11px',
    color: opptrixCssVars.textTertiary,
    lineHeight: 1.3,
  },
  statCellValue: {
    fontSize: '15px',
    fontWeight: 600,
    color: opptrixCssVars.textPrimary,
    lineHeight: 1.3,
    fontVariantNumeric: 'tabular-nums',
  },
  statCellSub: {
    fontSize: '11px',
    color: opptrixCssVars.textTertiary,
    lineHeight: 1.35,
    marginTop: '2px',
    fontVariantNumeric: 'tabular-nums',
  },
  progressBarWrap: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    padding: '12px 16px',
  },
  progressInfoRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '8px',
  },
  progressJobName: {
    fontSize: '12px',
    fontWeight: 500,
    color: opptrixCssVars.textPrimary,
    flexShrink: 0,
  },
  progressPct: {
    fontSize: '11px',
    fontWeight: 600,
    color: opptrixCssVars.textSecondary,
    flexShrink: 0,
    fontVariantNumeric: 'tabular-nums',
  },
  jobRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '6px 16px',
    borderBottom: `1px solid ${opptrixCssVars.separator}`,
    ':last-child': {
      borderBottom: 'none',
    },
  },
  jobRowActive: {
    backgroundColor: opptrixCssVars.infoSoft,
  },
  jobName: {
    fontSize: '12px',
    color: opptrixCssVars.textSecondary,
    flexShrink: 0,
    minWidth: '88px',
  },
  jobProgress: {
    flex: 1,
    minWidth: 0,
  },
  jobTrailing: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: '4px',
    flexShrink: 0,
    minWidth: '88px',
  },
  jobStats: {
    fontSize: '11px',
    color: opptrixCssVars.textTertiary,
    fontVariantNumeric: 'tabular-nums',
    textAlign: 'right',
  },
  jobStatsMuted: {
    opacity: 0.65,
  },
  jobStatsError: {
    color: opptrixCssVars.error,
  },
  logPanel: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  logTextarea: {
    width: '100%',
    minHeight: '160px',
    maxHeight: '280px',
    resize: 'vertical',
    padding: '10px 12px',
    fontSize: '11px',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    color: opptrixCssVars.textSecondary,
    lineHeight: 1.55,
    backgroundColor: opptrixCssVars.gray100,
    borderRadius: opptrixTokens.radiusMd,
    border: `1px solid ${opptrixCssVars.border}`,
    boxSizing: 'border-box',
    userSelect: 'text',
    WebkitUserSelect: 'text',
  },
  failedBanner: {
    padding: '8px 12px',
    fontSize: '12px',
    lineHeight: 1.5,
    color: opptrixCssVars.error,
    backgroundColor: opptrixCssVars.errorSoft,
    borderRadius: opptrixTokens.radiusMd,
    border: `1px solid rgba(255, 59, 48, 0.2)`,
  },
})

function truncateError(msg: string, max = 72): string {
  const oneLine = msg.replace(/\s+/g, ' ').trim()
  if (oneLine.length <= max) return oneLine
  return `${oneLine.slice(0, max - 1)}…`
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—'
  try {
    const d = new Date(dateStr)
    if (isNaN(d.getTime())) return dateStr
    return d.toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return dateStr
  }
}

function jobDisplayName(jobName: string): string {
  return SYNC_JOB_LABELS[jobName] ?? jobName
}

function runningJobDetail(
  jobName: string,
  dbStatus: MarketDbStatusData | null,
  syncState: MarketDataSyncState | null,
): string {
  const batch = runningBatchProgress(syncState)
  if (batch) return `${batch.current.toLocaleString()}/${batch.total.toLocaleString()}`
  if (syncState?.message) return syncState.message

  const prog = dbStatus?.job_progress?.[jobName]
  const done = prog?.done ?? 0
  const pending = prog?.pending ?? 0
  const total = done + pending

  if (THS_KLINE_JOBS.has(jobName)) return '导入中…'
  if (total > 0) return `${done.toLocaleString()}/${total.toLocaleString()}`
  return '同步中…'
}

/** 顶部 banner 与下方进度区共用 — 随 current_job / message / 批次进度动态更新 */
function formatSyncRunningBanner(
  syncState: MarketDataSyncState | null,
  dbStatus: MarketDbStatusData | null,
  overallPercent: number,
): { title: string; desc: string } {
  const job = syncState?.current_job ?? null
  const jobLabel = job ? jobDisplayName(job) : null
  const batch = runningBatchProgress(syncState)
  const jobsCompleted = syncState?.jobs_completed ?? 0
  const jobsTotal = syncState?.jobs_total ?? 0

  let title = '基础数据同步中'
  if (jobLabel) {
    if (batch && batch.total > 0) {
      const jobPct = Math.round((batch.current / batch.total) * 1000) / 10
      title = `正在同步：${jobLabel}（${jobPct}%）`
    } else {
      title = `正在同步：${jobLabel}`
    }
  }

  let phase = syncState?.message?.trim() || ''
  if (!phase && job) {
    phase = runningJobDetail(job, dbStatus, syncState)
  }

  const descParts: string[] = []
  if (phase) descParts.push(phase)
  descParts.push(`总进度 ${overallPercent.toFixed(1)}%`)
  if (jobsTotal > 0) descParts.push(`任务 ${jobsCompleted}/${jobsTotal}`)
  const mode = syncState?.mode
  if (mode === 'incremental') descParts.push('增量')
  else if (mode === 'resume') descParts.push('接续')
  else if (mode === 'full') descParts.push('全量')

  return { title, desc: descParts.join(' · ') }
}

function idleJobDetail(
  jobName: string,
  dbStatus: MarketDbStatusData | null,
): string {
  const prog = dbStatus?.job_progress?.[jobName]
  const done = prog?.done ?? 0
  const latest = dbStatus?.kline_dates?.CN
  const depthRatio = dbStatus?.bootstrap?.kline_stock_ratio
  const recentRatio = dbStatus?.bootstrap?.kline_recent_ratio

  if (THS_KLINE_JOBS.has(jobName)) {
    const parts: string[] = []
    if (done > 0) parts.push(`${done.toLocaleString()} 只`)
    else if (typeof recentRatio === 'number' && recentRatio > 0) {
      parts.push(`覆盖 ${recentRatio.toFixed(1)}%`)
    }
    if (typeof depthRatio === 'number' && depthRatio > 0) {
      parts.push(`历史深度 ${depthRatio.toFixed(1)}%`)
    }
    if (latest) parts.push(`最新 ${formatDate(latest)}`)
    const lastBoot = dbStatus?.last_sync?.kline_bootstrap
    if (lastBoot && !dbStatus?.last_sync?.kline_daily) {
      parts.push('全量已含近期日 K')
    }
    return parts.length ? parts.join(' · ') : '—'
  }

  const pending = prog?.pending ?? 0
  const total = done + pending
  return total > 0 ? `${done.toLocaleString()}/${total.toLocaleString()}` : '—'
}

/** A 股日 K 是否已具备（全量或近期导入完成即可用于本地 K 线/因子） */
function hasCnDailyKline(dbStatus: MarketDbStatusData | null): boolean {
  if (!dbStatus) return false
  if (dbStatus.kline_dates?.CN) return true
  if (dbStatus.last_sync?.kline_bootstrap || dbStatus.last_sync?.kline_daily) return true
  if (dbStatus.bootstrap?.klines) return true
  if ((dbStatus.bootstrap?.kline_recent_ratio ?? 0) > 0) return true
  if ((dbStatus.bootstrap?.kline_stock_ratio ?? 0) > 0) return true
  return false
}

function gateJobComplete(
  jobName: string,
  dbStatus: MarketDbStatusData | null,
  isJobRunning: boolean,
): boolean {
  const gateKey = BOOTSTRAP_GATE_JOBS[jobName]
  if (!gateKey) return false
  const lastSync = dbStatus?.last_sync?.[jobName]
  const gateOk = dbStatus?.bootstrap?.[gateKey] ?? false
  return gateOk || (!isJobRunning && !!lastSync)
}

function resolveJobProgress(
  jobName: string,
  dbStatus: MarketDbStatusData | null,
  syncState: MarketDataSyncState | null,
  isJobRunning: boolean,
): { pct: number; hasData: boolean; isComplete: boolean } {
  const prog = dbStatus?.job_progress?.[jobName]
  const done = prog?.done ?? 0
  const pending = prog?.pending ?? 0
  const error = prog?.error ?? 0
  const total = done + pending
  const isKlineDump = THS_KLINE_JOBS.has(jobName)
  const gateKey = BOOTSTRAP_GATE_JOBS[jobName]

  if (THS_KLINE_JOBS.has(jobName)) {
    const batch = isJobRunning ? runningBatchProgress(syncState) : null
    if (batch && batch.total > 0) {
      return {
        pct: Math.round((batch.current / batch.total) * 1000) / 10,
        hasData: true,
        isComplete: false,
      }
    }
    const depthRatio = dbStatus?.bootstrap?.kline_stock_ratio ?? 0
    const recentRatio = dbStatus?.bootstrap?.kline_recent_ratio ?? 0
    const lastBootstrap = dbStatus?.last_sync?.kline_bootstrap
    const lastDaily = dbStatus?.last_sync?.kline_daily
    const importDone = !!(lastBootstrap || lastDaily)
    const isComplete = (dbStatus?.bootstrap?.klines ?? false) || importDone
    const ratio = Math.max(depthRatio, recentRatio)
    return {
      pct: isComplete ? 100 : Math.min(100, Math.round(ratio * 10) / 10),
      hasData: ratio > 0 || done > 0 || isJobRunning || importDone,
      isComplete,
    }
  }

  if (gateKey) {
    const isComplete = gateJobComplete(jobName, dbStatus, isJobRunning)
    const batch = isJobRunning ? runningBatchProgress(syncState) : null
    if (batch && batch.total > 0) {
      return {
        pct: Math.round((batch.current / batch.total) * 1000) / 10,
        hasData: true,
        isComplete: false,
      }
    }
    if (isComplete) return { pct: 100, hasData: true, isComplete: true }
    if (total > 0) {
      return {
        pct: Math.round((done / total) * 1000) / 10,
        hasData: true,
        isComplete: false,
      }
    }
    return { pct: 0, hasData: isJobRunning, isComplete: false }
  }

  const isComplete = total > 0 && done >= total && error === 0
  return {
    pct: total > 0 ? Math.round((done / total) * 1000) / 10 : 0,
    hasData: total > 0 || isJobRunning,
    isComplete,
  }
}

function jobTrailingText(
  jobName: string,
  dbStatus: MarketDbStatusData | null,
  syncState: MarketDataSyncState | null,
  isJobRunning: boolean,
  isComplete: boolean,
  lastSync: string | null,
): string {
  if (isJobRunning) {
    return runningJobDetail(jobName, dbStatus, syncState)
  }
  if (lastSync) {
    return formatDate(lastSync)
  }
  if (isComplete) {
    return idleJobDetail(jobName, dbStatus)
  }
  const detail = idleJobDetail(jobName, dbStatus)
  return detail !== '—' ? detail : '未同步'
}

export default function BasicDataSettingsSection() {
  const toast = useSettingsToast()
  const s = useStyles()
  const [dbStatus, setDbStatus] = useState<MarketDbStatusData | null>(null)
  const [syncState, setSyncState] = useState<MarketDataSyncState | null>(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const logTextareaRef = useRef<HTMLTextAreaElement>(null)
  const mountedRef = useRef(true)

  const fetchAll = useCallback(async () => {
    try {
      const snapResp = await research.marketDbSyncState()
      if (!mountedRef.current) return
      setSyncState(snapResp.data ?? null)
      setDbStatus(snapResp.data?.db_status ?? null)
      setLoading(false)
    } catch (e) {
      if (!mountedRef.current) return
      console.error('[settings/basic-data] load failed:', e)
      setLoading(false)
    }
  }, [])

  const isRunning = syncState?.running ?? false

  useEffect(() => {
    mountedRef.current = true
    fetchAll()
    return () => {
      mountedRef.current = false
    }
  }, [fetchAll])

  useEffect(() => {
    if (pollTimer.current) clearInterval(pollTimer.current)
    const interval = isRunning ? POLL_BURST_MS : POLL_IDLE_MS
    pollTimer.current = setInterval(fetchAll, interval)
    return () => {
      if (pollTimer.current) clearInterval(pollTimer.current)
    }
  }, [fetchAll, isRunning])

  useEffect(() => {
    if (isRunning) {
      void fetchAll()
      const burst = setInterval(fetchAll, POLL_BURST_MS)
      return () => clearInterval(burst)
    }
    return undefined
  }, [isRunning, fetchAll])

  const handleSync = useCallback(async () => {
    try {
      setSyncing(true)
      const resp = await research.marketDbSync('auto', true, false)
      const result = resp.data
      if (result?.started) {
        toast.showSuccess('已开始同步基础数据')
        void fetchAll()
        window.setTimeout(() => { void fetchAll() }, 400)
      } else if (result?.running) {
        toast.showSuccess('同步已在运行中')
        void fetchAll()
      } else {
        toast.showSuccess('无需同步，数据已是最新')
      }
    } catch (e) {
      toast.showError(e instanceof Error ? e.message : '同步失败')
    } finally {
      setSyncing(false)
    }
  }, [toast, fetchAll])

  const overallPercent = syncState?.overall_percent ?? 0
  const bootstrapReady = dbStatus?.bootstrap?.ready ?? false
  const dailyKlineReady = !bootstrapReady && hasCnDailyKline(dbStatus)
  const bannerPositive = (bootstrapReady || dailyKlineReady) && !isRunning
  const syncBanner = isRunning ? formatSyncRunningBanner(syncState, dbStatus, overallPercent) : null
  const klineRecentRatio = dbStatus?.bootstrap?.kline_recent_ratio ?? 0
  const klineDepthRatio = dbStatus?.bootstrap?.kline_stock_ratio ?? 0
  const stockCount = dbStatus?.stock_count ?? 0
  const etfCount = dbStatus?.etf_count ?? 0
  const usCount = dbStatus?.us_count ?? 0
  const hkCount = dbStatus?.hk_count ?? 0
  const failedJobs = syncState?.failed_jobs ?? []
  const failedJobMap = new Map(failedJobs.map(f => [f.job, f.error]))
  const logLines = syncState?.logs ?? []
  const logText = [
    ...(failedJobs.length > 0
      ? [
        '--- 失败任务 ---',
        ...failedJobs.map(f => `${jobDisplayName(f.job)} (${f.job}):\n${f.error}`),
        '',
      ]
      : []),
    ...logLines.slice(-120),
  ].join('\n')
  const displayOverall = (() => {
    if (!dbStatus) return overallPercent
    let sum = 0
    for (const jobName of SYNC_JOB_ITEMS) {
      const isJobRunning = isRunning && syncState?.current_job === jobName
      sum += resolveJobProgress(jobName, dbStatus, syncState, isJobRunning).pct
    }
    return Math.round((sum / SYNC_JOB_ITEMS.length) * 10) / 10
  })()
  const progressPercent = isRunning ? overallPercent : displayOverall
  const showLogPanel = isRunning || logText.trim().length > 0

  useEffect(() => {
    const el = logTextareaRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [logText, isRunning])
  const cnKlineDate = dbStatus?.kline_dates?.CN ?? null
  const overviewItems = [
    { key: 'cn', label: 'A 股', count: stockCount, klineDate: cnKlineDate },
    { key: 'etf', label: 'ETF', count: etfCount, klineDate: cnKlineDate },
    { key: 'hk', label: '港股', count: hkCount, klineDate: dbStatus?.kline_dates?.HK ?? null },
    { key: 'us', label: '美股', count: usCount, klineDate: dbStatus?.kline_dates?.US ?? null },
  ] as const

  if (loading && !dbStatus && !syncState) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '40px 0', gap: '12px' }}>
        <Spinner size="tiny" label="加载基础数据状态…" />
      </div>
    )
  }

  return (
    <div className={s.root}>
      <div
        className={mergeClasses(
          s.statusBanner,
          isRunning && s.statusBannerSyncing,
          bannerPositive && s.statusBannerReady,
        )}
        style={
          isRunning
            ? { borderColor: 'rgba(0, 122, 255, 0.25)' }
            : bannerPositive
              ? { borderColor: 'rgba(52, 199, 89, 0.3)' }
              : undefined
        }
      >
        <div className={s.statusBannerIcon}>
          {isRunning ? (
            <ArrowSyncCircleRegular fontSize={24} style={{ color: opptrixCssVars.accent }} />
          ) : bootstrapReady || dailyKlineReady ? (
            <CheckmarkCircleFilled fontSize={24} style={{ color: opptrixCssVars.success }} />
          ) : (
            <DismissCircleRegular fontSize={24} style={{ color: opptrixCssVars.warning }} />
          )}
        </div>
        <div className={s.statusBannerText}>
          <Text className={s.statusBannerTitle} block>
            {syncBanner?.title
              ?? (bootstrapReady
                ? '基础数据已就绪'
                : dailyKlineReady
                  ? '基础数据已具备'
                  : '基础数据未就绪')}
          </Text>
          <Text className={s.statusBannerDesc} block>
            {syncBanner?.desc
              ?? (bootstrapReady
                ? '本地数据完整，可开始选股与挖掘'
                : dailyKlineReady
                  ? '可查看 K 线、使用本地选股与行业数据；其余项目将自动更新'
                  : klineRecentRatio >= 50 && klineDepthRatio < 95
                    ? '已有近期日 K，历史 K 线全量包首次导入约需 10–20 分钟，请保持网络畅通'
                    : '需先完成名录、行业板块与历史 K 线同步')}
          </Text>
        </div>
        <div className={s.statusBannerAction}>
          <OpptrixButton
            variant={bannerPositive ? 'pill' : 'secondary'}
            className={bannerPositive ? s.statusBannerActionBtn : undefined}
            icon={isRunning || syncing ? <Spinner size="tiny" /> : <ArrowSyncRegular fontSize={14} />}
            disabled={syncing || isRunning}
            onClick={handleSync}
          >
            {isRunning ? '同步中…' : syncing ? '提交中…' : '同步'}
          </OpptrixButton>
        </div>
      </div>

      <div className={s.sectionBlock}>
        <Text className={s.sectionLabel} block>数据概览</Text>
        <div className={s.statsRow}>
          {overviewItems.map(item => (
            <div key={item.key} className={s.statCell}>
              <Text className={s.statCellLabel} block>{item.label}</Text>
              <Text className={s.statCellValue} block>{item.count.toLocaleString()}</Text>
              <Text className={s.statCellSub} block>
                日 K {item.klineDate ? formatDate(item.klineDate) : '—'}
              </Text>
            </div>
          ))}
        </div>
      </div>

      <div className={s.sectionBlock}>
        <Text className={s.sectionLabel} block>同步状态</Text>
        <SettingsGroup>
          {isRunning && syncBanner && (
            <div className={s.progressBarWrap}>
              <div className={s.progressInfoRow}>
                <Text className={s.progressJobName} block>
                  <ArrowSyncRegular fontSize={12} style={{ verticalAlign: '-1px', marginRight: '4px' }} />
                  {syncState?.current_job ? jobDisplayName(syncState.current_job) : '同步中'}
                </Text>
                <Text className={s.progressPct} block>
                  {progressPercent.toFixed(1)}%
                </Text>
              </div>
              <ProgressBar max={100} value={progressPercent} style={{ height: '4px' }} />
              <Text style={{ fontSize: '11px', color: opptrixCssVars.textTertiary }} block>
                {syncBanner.desc}
              </Text>
            </div>
          )}

          {SYNC_JOB_ITEMS.map(jobName => {
            const label = SYNC_JOB_LABELS[jobName] ?? jobName
            const isCurrent = syncState?.current_job === jobName
            const isJobRunning = isRunning && isCurrent
            const lastSync = dbStatus?.last_sync?.[jobName] ?? null
            const { pct, hasData, isComplete } = resolveJobProgress(
              jobName,
              dbStatus,
              syncState,
              isJobRunning,
            )
            const prog = dbStatus?.job_progress?.[jobName]
            const error = prog?.error ?? 0
            const jobError = failedJobMap.get(jobName)
            const showJobError = !isComplete && (error > 0 || !!jobError)
            const trailingText = showJobError && jobError
              ? truncateError(jobError)
              : jobTrailingText(
                jobName,
                dbStatus,
                syncState,
                isJobRunning,
                isComplete,
                lastSync,
              )

            return (
              <div key={jobName} className={mergeClasses(s.jobRow, isCurrent && s.jobRowActive)}>
                <Text className={s.jobName} block>{label}</Text>
                <div className={s.jobProgress}>
                  {hasData && (
                    <ProgressBar max={100} value={pct} style={{ height: '3px' }} />
                  )}
                </div>
                <div className={s.jobTrailing}>
                  {isComplete && !isJobRunning && (
                    <CheckmarkRegular fontSize={14} style={{ color: opptrixCssVars.success }} />
                  )}
                  <Text
                    className={mergeClasses(
                      s.jobStats,
                      !isJobRunning && !isComplete && !lastSync && !showJobError && s.jobStatsMuted,
                      showJobError && s.jobStatsError,
                    )}
                    block
                    title={showJobError && jobError ? jobError : undefined}
                  >
                    {trailingText}
                    {!THS_KLINE_JOBS.has(jobName) && showJobError && error > 0 ? ` ×${error}` : ''}
                  </Text>
                </div>
              </div>
            )
          })}
        </SettingsGroup>
      </div>

      {showLogPanel && (
        <div className={s.sectionBlock}>
          <Text className={s.sectionLabel} block>同步日志</Text>
          {failedJobs.length > 0 && (
            <Text className={s.failedBanner} block>
              {failedJobs.length} 个任务失败：
              {failedJobs.map(f => jobDisplayName(f.job)).join('、')}
              。完整错误见下方日志（可选中复制）。
            </Text>
          )}
          <div className={s.logPanel}>
            <textarea
              ref={logTextareaRef}
              className={s.logTextarea}
              readOnly
              value={logText || (isRunning ? '等待同步日志…' : '')}
              aria-label="同步日志"
              spellCheck={false}
            />
          </div>
        </div>
      )}
    </div>
  )
}
