import { useCallback, useEffect, useRef, useState } from 'react'
import { ProgressBar, Spinner, Switch, Text, makeStyles, mergeClasses } from '@fluentui/react-components'
import { CheckmarkCircleRegular, CircleRegular } from '@fluentui/react-icons'
import OpptrixButton from '../../components/opptrix/OpptrixButton'
import StatusBanner from '../../components/StatusBanner'
import {
  getMarketDataSyncState,
  getTushareConfig,
  saveTushareConfig,
  startMarketDataSync,
  testTushareConfig,
} from '../../api/client'
import type { MarketDataSyncState } from '../../types/market'
import { SettingsGroup, SettingsCredentialRow, SettingsPanelHeader, SettingsRow, SettingsStaticBlock } from './SettingsPrimitives'
import { opptrixTokens } from '../../theme/tokens'

const POLL_MS = 2000

const LOG_HEIGHT = 148

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  sectionBlock: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  sectionLabel: {
    fontSize: '12px',
    fontWeight: 600,
    color: opptrixTokens.textSecondary,
    letterSpacing: '-0.01em',
    paddingLeft: '2px',
  },
  statsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(4, minmax(0, 1fr))',
    gap: '2px 10px',
    fontSize: '12px',
    lineHeight: 1.4,
    '@media (max-width: 720px)': {
      gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    },
  },
  statLabel: {
    color: opptrixTokens.textTertiary,
    fontSize: '11px',
  },
  statValue: {
    color: opptrixTokens.textPrimary,
    fontWeight: 600,
    fontVariantNumeric: 'tabular-nums',
    fontSize: '12px',
  },
  progressBlock: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  progressBarTrack: {
    width: '100%',
    minHeight: '6px',
  },
  progressMeta: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: '8px',
    fontSize: '11px',
    color: opptrixTokens.textSecondary,
    lineHeight: 1.35,
  },
  progressJob: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  progressPct: {
    flexShrink: 0,
    fontVariantNumeric: 'tabular-nums',
    fontWeight: 600,
    color: opptrixTokens.textPrimary,
  },
  logShell: {
    border: opptrixTokens.settingsPanelBorder,
    borderRadius: opptrixTokens.radiusMd,
    backgroundColor: opptrixTokens.canvasAlt,
    height: `${LOG_HEIGHT}px`,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  },
  logHead: {
    flexShrink: 0,
    padding: '5px 10px',
    borderBottom: `1px solid ${opptrixTokens.separator}`,
    fontSize: '11px',
    fontWeight: 600,
    color: opptrixTokens.textTertiary,
    lineHeight: 1.3,
  },
  logBody: {
    flex: 1,
    minHeight: 0,
    height: '100%',
    overflowX: 'hidden',
    overflowY: 'auto',
    padding: '6px 10px',
    margin: 0,
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
    fontSize: '10px',
    lineHeight: 1.45,
    color: opptrixTokens.textSecondary,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    overscrollBehavior: 'contain',
  },
  syncBody: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    padding: '10px 18px 12px',
  },
  readyBadge: {
    fontSize: '11px',
    color: '#248A3D',
    fontWeight: 600,
    marginBottom: '4px',
    lineHeight: 1.3,
  },
  syncHint: {
    fontSize: '11px',
    color: opptrixTokens.textTertiary,
    lineHeight: 1.35,
    paddingLeft: '2px',
  },
  bootstrapList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    padding: '2px 0',
  },
  bootstrapRow: {
    display: 'grid',
    gridTemplateColumns: '18px minmax(0, 1fr) auto',
    gap: '8px',
    alignItems: 'center',
    fontSize: '11px',
    lineHeight: 1.35,
  },
  bootstrapLabel: {
    color: opptrixTokens.textPrimary,
    fontWeight: 500,
  },
  bootstrapMeta: {
    color: opptrixTokens.textTertiary,
    fontVariantNumeric: 'tabular-nums',
    fontSize: '10px',
  },
  bootstrapIconOk: {
    color: '#248A3D',
  },
  bootstrapIconPending: {
    color: opptrixTokens.textTertiary,
  },
})

function formatCoveragePercent(
  ratio: number | null | undefined,
  job: string | undefined,
  stockCount: number,
  jobProgress: MarketDataSyncState['db_status']['job_progress'] | undefined,
): string {
  if (typeof ratio === 'number' && Number.isFinite(ratio)) {
    return `${ratio}%`
  }
  if (job && stockCount > 0) {
    const done = jobProgress?.[job]?.done
    if (typeof done === 'number' && Number.isFinite(done)) {
      const pct = Math.round((Math.min(done, stockCount) / stockCount) * 1000) / 10
      return `${pct}%`
    }
  }
  return '—'
}

export default function MarketDataSettingsSection() {
  const s = useStyles()
  const [state, setState] = useState<MarketDataSyncState | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [actionMsg, setActionMsg] = useState('')
  const [starting, setStarting] = useState(false)
  const [tsEnabled, setTsEnabled] = useState(false)
  const [tsToken, setTsToken] = useState('')
  const [tsSaving, setTsSaving] = useState(false)
  const [tsTesting, setTsTesting] = useState(false)
  const [tsMsg, setTsMsg] = useState('')
  const [syncActive, setSyncActive] = useState(false)
  const logRef = useRef<HTMLPreElement>(null)
  const pollRef = useRef<number | null>(null)

  const refreshTushare = useCallback(async () => {
    const ts = await getTushareConfig()
    setTsEnabled(ts.enabled)
    setTsToken(ts.token ?? '')
    return ts
  }, [])

  const refreshSync = useCallback(async () => {
    const data = await getMarketDataSyncState()
    setState(data)
    setSyncActive(!!data.running)
    return data
  }, [])

  const refresh = useCallback(async () => {
    setError('')
    const errors: string[] = []
    await refreshTushare().catch(e => {
      errors.push(e instanceof Error ? e.message : '无法读取 Tushare 配置')
    })
    await refreshSync().catch(e => {
      errors.push(e instanceof Error ? e.message : '无法读取同步状态')
    })
    if (errors.length) setError(errors[0])
    setLoading(false)
  }, [refreshSync, refreshTushare])

  useEffect(() => {
    void refresh()
    return () => {
      if (pollRef.current != null) window.clearInterval(pollRef.current)
    }
  }, [refresh])

  useEffect(() => {
    if (pollRef.current != null) {
      window.clearInterval(pollRef.current)
      pollRef.current = null
    }
    if (state?.running || syncActive) {
      pollRef.current = window.setInterval(() => { void refreshSync() }, POLL_MS)
    }
    return () => {
      if (pollRef.current != null) window.clearInterval(pollRef.current)
    }
  }, [state?.running, syncActive, refreshSync])

  useEffect(() => {
    const el = logRef.current
    if (!el) return
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 48
    if (nearBottom) el.scrollTop = el.scrollHeight
  }, [state?.logs])

  const handleStart = async () => {
    setStarting(true)
    setActionMsg('')
    setError('')
    try {
      setSyncActive(true)
      const resp = await startMarketDataSync()
      setActionMsg(resp.message || '同步已启动')
      await refreshSync()
    } catch (e) {
      setError(e instanceof Error ? e.message : '启动失败')
    } finally {
      setStarting(false)
    }
  }

  const handleSaveTushare = async () => {
    setTsSaving(true)
    setTsMsg('')
    setError('')
    try {
      const resp = await saveTushareConfig({
        enabled: tsEnabled,
        token: tsToken.trim(),
      })
      setTsToken(resp.data.token ?? tsToken.trim())
      setTsMsg(resp.message || '已保存')
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存 Tushare 配置失败')
    } finally {
      setTsSaving(false)
    }
  }

  const handleTestTushare = async () => {
    setTsTesting(true)
    setTsMsg('')
    setError('')
    try {
      const resp = await testTushareConfig(tsToken.trim() || undefined)
      const result = resp.data
      setTsMsg(result.ok ? result.message : `测试失败: ${result.message}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : '测试连接失败')
    } finally {
      setTsTesting(false)
    }
  }

  if (loading && !state) {
    return <Spinner size="tiny" label="加载基础数据状态…" />
  }

  const db = state?.db_status
  const hasProgress = db && Object.values(db.job_progress ?? {}).some(p => p.done > 0)
  const running = state?.running ?? syncActive
  const overallPct = state?.overall_percent ?? 0
  const showProgress = running || overallPct > 0 || !!state?.current_job
  const barValue = running && overallPct <= 0
    ? 0.03
    : Math.min(1, Math.max(0, overallPct / 100))

  const syncDesc = db?.is_ready
    ? '库已就绪，可本地初选挖掘；每 15 分钟自动检查并日更'
    : (hasProgress
      ? '将自动接续上次未完成的初选数据构建'
      : '将构建初选包：全A列表、估值截面、6月K线、财务与本地因子')

  const bootstrap = db?.bootstrap
  const bootstrapItems = bootstrap
    ? [
      { ok: bootstrap.universe, label: '股票池', meta: db?.stock_count ? `${db.stock_count} 只` : '—' },
      {
        ok: bootstrap.quotes,
        label: '估值截面',
        meta: formatCoveragePercent(bootstrap.quote_stock_ratio, 'quotes', db?.stock_count ?? 0, db?.job_progress),
      },
      {
        ok: bootstrap.klines,
        label: '6 月日 K',
        meta: formatCoveragePercent(bootstrap.kline_stock_ratio, 'kline_bootstrap', db?.stock_count ?? 0, db?.job_progress),
      },
      {
        ok: bootstrap.fundamentals,
        label: '财务指标',
        meta: formatCoveragePercent(bootstrap.fin_stock_ratio, 'financials', db?.stock_count ?? 0, db?.job_progress),
      },
      {
        ok: bootstrap.screen_factors,
        label: '初选因子',
        meta: formatCoveragePercent(bootstrap.factor_stock_ratio, 'screen_factors', db?.stock_count ?? 0, db?.job_progress),
      },
    ]
    : []

  return (
    <div className={s.root}>
      {error && <StatusBanner message={error} tone="error" />}
      {actionMsg && <StatusBanner message={actionMsg} tone="success" />}
      {tsMsg && <StatusBanner message={tsMsg} tone="success" />}

      <div className={s.sectionBlock}>
        <Text className={s.sectionLabel} block>Tushare Pro</Text>
        <SettingsGroup>
          <SettingsRow
            title="启用 Tushare"
            desc="开启后数据层优先使用 Tushare（2000 积分档接口）；未覆盖项仍回退东财/TDX"
            control={(
              <Switch
                checked={tsEnabled}
                onChange={(_, d) => setTsEnabled(!!d.checked)}
              />
            )}
          />
          <SettingsRow
            title="API Token"
            desc="已保存的 Token 会默认显示在输入框内，点击眼睛可切换掩码"
            stack
            control={(
              <SettingsCredentialRow
                value={tsToken}
                onChange={setTsToken}
                placeholder="粘贴 Token"
                testing={tsTesting}
                saving={tsSaving}
                testDisabled={!tsToken.trim()}
                saveDisabled={!tsToken.trim()}
                onTest={() => { void handleTestTushare() }}
                onSave={() => { void handleSaveTushare() }}
              />
            )}
            last
          />
        </SettingsGroup>
        <Text className={s.syncHint} block>
          覆盖：全A列表与行业、日频估值截面、6月日K、财务指标与本地初选因子。深度 F10（客户/公告等）在挖掘入选后按需加载。
        </Text>
      </div>

      <div className={s.sectionBlock}>
        <Text className={s.sectionLabel} block>库状态</Text>
        <SettingsGroup>
          <SettingsStaticBlock>
            {db?.is_ready && <Text className={s.readyBadge} block>已就绪 · 可本地筛选</Text>}
            <div className={s.statsGrid}>
              <span className={s.statLabel}>股票</span>
              <span className={s.statValue}>{db?.stock_count ?? 0}</span>
              <span className={s.statLabel}>公告</span>
              <span className={s.statValue}>{db?.announcement_count ?? 0}</span>
              <span className={s.statLabel}>因子日</span>
              <span className={s.statValue}>{db?.latest_factor_date ?? '—'}</span>
              <span className={s.statLabel}>档案/股东</span>
              <span className={s.statValue}>
                {`${db?.profile_count ?? 0}/${db?.shareholder_count ?? 0}`}
              </span>
            </div>
            {bootstrapItems.length > 0 && (
              <div className={s.bootstrapList}>
                {bootstrapItems.map(item => (
                  <div key={item.label} className={s.bootstrapRow}>
                    {item.ok
                      ? <CheckmarkCircleRegular className={s.bootstrapIconOk} fontSize={16} />
                      : <CircleRegular className={s.bootstrapIconPending} fontSize={16} />}
                    <Text className={s.bootstrapLabel}>{item.label}</Text>
                    <Text className={s.bootstrapMeta}>{item.meta}</Text>
                  </div>
                ))}
              </div>
            )}
          </SettingsStaticBlock>
        </SettingsGroup>
      </div>

      <div className={s.sectionBlock}>
        <SettingsGroup>
          <SettingsPanelHeader
            title="同步"
            action={(
              <OpptrixButton
                variant="primary"
                disabled={starting || running}
                onClick={() => { void handleStart() }}
              >
                {running ? '同步中…' : '同步数据'}
              </OpptrixButton>
            )}
          />
          <div className={s.syncBody}>
            <Text className={s.syncHint} block>{syncDesc}</Text>
            {showProgress && (
              <div className={s.progressBlock}>
                <div className={s.progressMeta}>
                  <Text className={s.progressJob} block>
                    {running
                      ? (state?.current_job
                        ? (() => {
                            const batch = state.job_batch_total != null && state.job_batch_total > 0
                              ? `本批 ${state.job_batch_current ?? 0}/${state.job_batch_total}`
                              : null
                            const cumulative = `累计 ${state.job_current}/${state.job_total || '—'}`
                            return `${state.current_job} · ${batch ? `${batch} · ${cumulative}` : cumulative}`
                          })()
                        : (state?.message || '同步准备中…'))
                      : (state?.message || '上次同步')}
                  </Text>
                  <Text className={s.progressPct}>
                    {running && overallPct <= 0 ? '…' : `${overallPct}%`}
                  </Text>
                </div>
                <ProgressBar
                  className={s.progressBarTrack}
                  value={barValue}
                  thickness="medium"
                  color="brand"
                  shape="rounded"
                />
                <Text className={s.progressMeta} block>
                  {`任务 ${state?.jobs_completed ?? 0}/${state?.jobs_total ?? 0}`}
                  {state?.mode ? ` · ${state.mode}` : ''}
                  {running ? ' · 进行中' : ''}
                </Text>
              </div>
            )}
          </div>
        </SettingsGroup>
        <Text className={s.syncHint} block>
          初选包就绪即可本地挖掘；应用常驻时每 15 分钟检查过期并后台更新，K 线/行情变更后会自动重算动量与量比等因子。
        </Text>
      </div>

      <div className={s.sectionBlock}>
        <Text className={s.sectionLabel} block>日志</Text>
        <div className={s.logShell}>
          <div className={s.logHead}>滚动查看 · 后台持续写入</div>
          <pre
            ref={logRef}
            tabIndex={0}
            className={mergeClasses(s.logBody, 'opptrix-scroll')}
          >
            {(state?.logs?.length
              ? state.logs.join('\n')
              : '暂无日志。点击「同步数据」或等待自动接续。')}
          </pre>
        </div>
      </div>
    </div>
  )
}
