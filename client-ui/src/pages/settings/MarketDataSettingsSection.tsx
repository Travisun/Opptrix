import { useCallback, useEffect, useRef, useState } from 'react'
import { ProgressBar, Spinner, Switch, Text, makeStyles, mergeClasses } from '@fluentui/react-components'
import InnoButton from '../../components/inno/InnoButton'
import StatusBanner from '../../components/StatusBanner'
import {
  getMarketDataSyncState,
  getTushareConfig,
  saveTushareConfig,
  startMarketDataSync,
  testTushareConfig,
} from '../../api/client'
import type { MarketDataSyncState } from '../../types/market'
import { SettingsGroup, SettingsCredentialRow, SettingsDivider, SettingsRow, SettingsStaticBlock } from './SettingsPrimitives'
import { innoTokens } from '../../theme/tokens'

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
    color: innoTokens.textSecondary,
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
    color: innoTokens.textTertiary,
    fontSize: '11px',
  },
  statValue: {
    color: innoTokens.textPrimary,
    fontWeight: 600,
    fontVariantNumeric: 'tabular-nums',
    fontSize: '12px',
  },
  progressBlock: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    padding: '10px 18px 12px',
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
    color: innoTokens.textSecondary,
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
    color: innoTokens.textPrimary,
  },
  logShell: {
    border: innoTokens.settingsPanelBorder,
    borderRadius: innoTokens.radiusMd,
    backgroundColor: innoTokens.canvasAlt,
    height: `${LOG_HEIGHT}px`,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  },
  logHead: {
    flexShrink: 0,
    padding: '5px 10px',
    borderBottom: `1px solid ${innoTokens.separator}`,
    fontSize: '11px',
    fontWeight: 600,
    color: innoTokens.textTertiary,
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
    color: innoTokens.textSecondary,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    overscrollBehavior: 'contain',
  },
  actions: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '6px',
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
    color: innoTokens.textTertiary,
    lineHeight: 1.35,
    paddingLeft: '2px',
  },
})

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

  const handleStart = async (
    mode: 'full' | 'resume' | 'incremental',
    opts: { jobs?: string[] } = {},
  ) => {
    setStarting(true)
    setActionMsg('')
    setError('')
    try {
      setSyncActive(true)
      const resp = await startMarketDataSync(mode, opts)
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
          覆盖：股票池、日 K、日频行情截面、财务/分红/股东/预告/回购/主营/档案等 bulk 接口。公告、前五客户/供应商仍走 CNINFO/东财。
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
          </SettingsStaticBlock>
        </SettingsGroup>
      </div>

      <div className={s.sectionBlock}>
        <Text className={s.sectionLabel} block>同步</Text>
        <SettingsGroup>
          <SettingsRow
            title={running ? '进行中' : '后台任务'}
            desc=""
            stack
            control={(
              <div className={s.actions}>
                <InnoButton
                  variant="primary"
                  disabled={starting || running}
                  onClick={() => { void handleStart('full') }}
                >
                  全量
                </InnoButton>
                <InnoButton
                  variant="secondary"
                  disabled={starting || running || !hasProgress}
                  onClick={() => { void handleStart('resume') }}
                >
                  接续
                </InnoButton>
                {db?.is_ready && (
                  <>
                    <InnoButton
                      variant="secondary"
                      disabled={starting || running}
                      onClick={() => { void handleStart('incremental') }}
                    >
                      增量
                    </InnoButton>
                    <InnoButton
                      variant="secondary"
                      disabled={starting || running}
                      onClick={() => {
                        void handleStart('incremental', {
                          jobs: ['universe', 'quotes', 'announcements', 'factors', 'industry_stats'],
                        })
                      }}
                    >
                      快速增量
                    </InnoButton>
                  </>
                )}
              </div>
            )}
          />
          {showProgress && (
            <>
              <SettingsDivider />
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
            </>
          )}
        </SettingsGroup>
        <Text className={s.syncHint} block>
          全量＝强制重拉；增量＝按 TTL 只更新到期项；快速增量＝仅行情/公告/因子（跳过 F10 慢任务）；接续＝中断续跑。启用 Tushare 后仅 Tushare 接口并行（默认 4 路），东财/CNINFO 仍串行安全间隔
        </Text>
      </div>

      <div className={s.sectionBlock}>
        <Text className={s.sectionLabel} block>日志</Text>
        <div className={s.logShell}>
          <div className={s.logHead}>滚动查看 · 后台持续写入</div>
          <pre
            ref={logRef}
            tabIndex={0}
            className={mergeClasses(s.logBody, 'inno-scroll')}
          >
            {(state?.logs?.length
              ? state.logs.join('\n')
              : '暂无日志。点击「全量」或等待自动接续。')}
          </pre>
        </div>
      </div>
    </div>
  )
}
