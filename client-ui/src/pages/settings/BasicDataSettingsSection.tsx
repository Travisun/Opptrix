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

const POLL_RUNNING_MS = 2000
const POLL_IDLE_MS = 30_000
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
  kline_bootstrap: 'A 股历史 K 线',
  kline_daily: 'A 股日 K 线',
}

/** 同步任务展示顺序（与 pipeline 一致） */
const SYNC_JOB_ITEMS = [
  'initial_cn_universe',
  'initial_cn_etf',
  'initial_hk_universe',
  'initial_us_universe',
  'initial_taxonomy',
  'kline_bootstrap',
  'kline_daily',
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
    maxHeight: '140px',
    overflowY: 'auto',
    padding: '10px 16px',
    fontSize: '11px',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    color: opptrixCssVars.textTertiary,
    lineHeight: 1.6,
    backgroundColor: opptrixCssVars.gray100,
    borderRadius: opptrixTokens.radiusMd,
  },
  actionBtn: {
    width: '100%',
  },
})

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
    if (done > 0) parts.push(`${done.toLocaleString()} 只日 K`)
    else if (typeof recentRatio === 'number' && recentRatio > 0) {
      parts.push(`日 K 覆盖 ${recentRatio.toFixed(1)}%`)
    }
    if (typeof depthRatio === 'number' && depthRatio > 0) {
      parts.push(`历史深度 ${depthRatio.toFixed(1)}%`)
    } else if ((done > 0 || (recentRatio ?? 0) > 0) && jobName === 'kline_bootstrap') {
      parts.push('历史深度待补全')
    }
    if (latest) parts.push(`最新 ${formatDate(latest)}`)
    return parts.length ? parts.join(' · ') : '—'
  }

  const pending = prog?.pending ?? 0
  const total = done + pending
  return total > 0 ? `${done.toLocaleString()}/${total.toLocaleString()}` : '—'
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

  if (isKlineDump) {
    const batch = isJobRunning ? runningBatchProgress(syncState) : null
    if (batch && batch.total > 0) {
      return {
        pct: Math.round((batch.current / batch.total) * 1000) / 10,
        hasData: true,
        isComplete: false,
      }
    }
    const ratio = dbStatus?.bootstrap?.kline_stock_ratio ?? 0
    const isComplete = jobName === 'kline_bootstrap'
      ? (dbStatus?.bootstrap?.klines ?? false)
      : pending === 0 && done > 0 && error === 0
    return {
      pct: Math.min(100, Math.round(ratio * 10) / 10),
      hasData: ratio > 0 || done > 0 || isJobRunning,
      isComplete,
    }
  }

  const gateKey = BOOTSTRAP_GATE_JOBS[jobName]
  if (gateKey) {
    const gateOk = dbStatus?.bootstrap?.[gateKey] ?? false
    const batch = isJobRunning ? runningBatchProgress(syncState) : null
    if (batch && batch.total > 0) {
      return {
        pct: Math.round((batch.current / batch.total) * 1000) / 10,
        hasData: true,
        isComplete: false,
      }
    }
    if (gateOk) return { pct: 100, hasData: true, isComplete: true }
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

export default function BasicDataSettingsSection() {
  const toast = useSettingsToast()
  const s = useStyles()
  const [dbStatus, setDbStatus] = useState<MarketDbStatusData | null>(null)
  const [syncState, setSyncState] = useState<MarketDataSyncState | null>(null)
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const pollTimer = useRef<ReturnType<typeof setInterval> | null>(null)
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
    const interval = isRunning ? POLL_RUNNING_MS : POLL_IDLE_MS
    pollTimer.current = setInterval(fetchAll, interval)
    return () => {
      if (pollTimer.current) clearInterval(pollTimer.current)
    }
  }, [fetchAll, isRunning])

  useEffect(() => {
    if (isRunning) void fetchAll()
  }, [isRunning, fetchAll])

  const handleSync = useCallback(async () => {
    try {
      setSyncing(true)
      const resp = await research.marketDbSync('auto', true, false)
      const result = resp.data
      if (result?.started) {
        toast.showSuccess('已开始同步基础数据')
        void fetchAll()
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
  const klineRecentRatio = dbStatus?.bootstrap?.kline_recent_ratio ?? 0
  const klineDepthRatio = dbStatus?.bootstrap?.kline_stock_ratio ?? 0
  const stockCount = dbStatus?.stock_count ?? 0
  const etfCount = dbStatus?.etf_count ?? 0
  const usCount = dbStatus?.us_count ?? 0
  const hkCount = dbStatus?.hk_count ?? 0

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
        className={mergeClasses(s.statusBanner, bootstrapReady && s.statusBannerReady)}
        style={bootstrapReady ? { borderColor: 'rgba(52, 199, 89, 0.3)' } : undefined}
      >
        <div className={s.statusBannerIcon}>
          {bootstrapReady ? (
            <CheckmarkCircleFilled fontSize={24} style={{ color: opptrixCssVars.success }} />
          ) : (
            <DismissCircleRegular fontSize={24} style={{ color: opptrixCssVars.warning }} />
          )}
        </div>
        <div className={s.statusBannerText}>
          <Text className={s.statusBannerTitle} block>
            {bootstrapReady ? '基础数据已就绪' : '基础数据未就绪'}
          </Text>
          <Text className={s.statusBannerDesc} block>
            {bootstrapReady
              ? '本地数据完整，可开始选股与挖掘'
              : isRunning && syncState?.message
                ? syncState.message
                : klineRecentRatio >= 50 && klineDepthRatio < 95
                  ? '已有近期日 K，历史 K 线全量包首次导入约需 10–20 分钟，请保持网络畅通'
                  : '需先完成名录、行业板块与历史 K 线同步'}
          </Text>
        </div>
      </div>

      <div className={s.sectionBlock}>
        <Text className={s.sectionLabel} block>数据概览</Text>
        <div className={s.statsRow}>
          <div className={s.statCell}>
            <Text className={s.statCellLabel} block>A 股</Text>
            <Text className={s.statCellValue} block>{stockCount.toLocaleString()}</Text>
          </div>
          <div className={s.statCell}>
            <Text className={s.statCellLabel} block>ETF</Text>
            <Text className={s.statCellValue} block>{etfCount.toLocaleString()}</Text>
          </div>
          <div className={s.statCell}>
            <Text className={s.statCellLabel} block>港股</Text>
            <Text className={s.statCellValue} block>{hkCount.toLocaleString()}</Text>
          </div>
          <div className={s.statCell}>
            <Text className={s.statCellLabel} block>美股</Text>
            <Text className={s.statCellValue} block>{usCount.toLocaleString()}</Text>
          </div>
        </div>
        <div className={s.statsRow}>
          <div className={s.statCell}>
            <Text className={s.statCellLabel} block>A 股 K 线</Text>
            <Text className={s.statCellValue} block style={{ fontSize: '12px' }}>
              {dbStatus?.kline_dates?.CN ? formatDate(dbStatus.kline_dates.CN) : '—'}
            </Text>
          </div>
          <div className={s.statCell}>
            <Text className={s.statCellLabel} block>ETF K 线</Text>
            <Text className={s.statCellValue} block style={{ fontSize: '12px' }}>
              {dbStatus?.kline_dates?.CN ? formatDate(dbStatus.kline_dates.CN) : '—'}
            </Text>
          </div>
          <div className={s.statCell}>
            <Text className={s.statCellLabel} block>港股 K 线</Text>
            <Text className={s.statCellValue} block style={{ fontSize: '12px' }}>
              {dbStatus?.kline_dates?.HK ? formatDate(dbStatus.kline_dates.HK) : '—'}
            </Text>
          </div>
          <div className={s.statCell}>
            <Text className={s.statCellLabel} block>美股 K 线</Text>
            <Text className={s.statCellValue} block style={{ fontSize: '12px' }}>
              {dbStatus?.kline_dates?.US ? formatDate(dbStatus.kline_dates.US) : '—'}
            </Text>
          </div>
        </div>
      </div>

      <div className={s.sectionBlock}>
        <Text className={s.sectionLabel} block>同步状态</Text>
        <SettingsGroup>
          {isRunning && (
            <div className={s.progressBarWrap}>
              <div className={s.progressInfoRow}>
                <Text className={s.progressJobName} block>
                  <ArrowSyncRegular fontSize={12} style={{ verticalAlign: '-1px', marginRight: '4px' }} />
                  {syncState?.current_job ? jobDisplayName(syncState.current_job) : '同步中'}
                </Text>
                <Text className={s.progressPct} block>
                  {overallPercent.toFixed(1)}%
                </Text>
              </div>
              <ProgressBar max={100} value={overallPercent} style={{ height: '4px' }} />
              <Text style={{ fontSize: '11px', color: opptrixCssVars.textTertiary }} block>
                {syncState?.message
                  ?? `${syncState?.jobs_completed ?? 0}/${syncState?.jobs_total ?? 0} 个任务`}
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

            let trailingText: string
            if (isJobRunning) {
              trailingText = runningJobDetail(jobName, dbStatus, syncState)
            } else if (isComplete && lastSync) {
              trailingText = formatDate(lastSync)
            } else if (isComplete) {
              trailingText = idleJobDetail(jobName, dbStatus)
            } else if (lastSync) {
              trailingText = formatDate(lastSync)
            } else {
              const detail = idleJobDetail(jobName, dbStatus)
              trailingText = detail !== '—' ? detail : '未同步'
            }

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
                      !isJobRunning && !isComplete && !lastSync && s.jobStatsMuted,
                      error > 0 && s.jobStatsError,
                    )}
                    block
                  >
                    {trailingText}
                    {!THS_KLINE_JOBS.has(jobName) && error > 0 ? ` ×${error}` : ''}
                  </Text>
                </div>
              </div>
            )
          })}
        </SettingsGroup>
      </div>

      <div className={s.sectionBlock}>
        <OpptrixButton
          variant="secondary"
          className={s.actionBtn}
          icon={isRunning ? <Spinner size="tiny" /> : <ArrowSyncRegular fontSize={14} />}
          disabled={syncing || isRunning}
          onClick={handleSync}
        >
          {isRunning ? '同步进行中…' : syncing ? '提交中…' : '同步基础数据'}
        </OpptrixButton>
      </div>

      {syncState && syncState.logs.length > 0 && (
        <div className={s.sectionBlock}>
          <Text className={s.sectionLabel} block>同步日志</Text>
          <div className={s.logPanel}>
            {syncState.logs.slice(-30).reverse().map((log: string, i: number) => (
              <div key={i}>{log}</div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
