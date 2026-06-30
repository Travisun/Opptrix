import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  ProgressBar,
  Spinner,
  Switch,
  Tab,
  TabList,
  Text,
  makeStyles,
  mergeClasses,
} from '@fluentui/react-components'
import { CheckmarkCircleRegular, CircleRegular } from '@fluentui/react-icons'
import OpptrixButton from '../../components/opptrix/OpptrixButton'
import {
  exportMarketDataPackageFile,
  formatExportResultMessage,
  getMarketDataSyncState,
  getTushareConfig,
  importMarketDataPackageFile,
  inspectMarketDataPackageFile,
  pickExportDestination,
  saveTushareConfig,
  startMarketDataSync,
  testTushareConfig,
  type MarketDataPackageInspectResult,
} from '../../api/client'
import type { MarketDataSyncState } from '../../types/market'
import { SettingsGroup, SettingsCredentialRow, SettingsPanelHeader, SettingsRow, SettingsStaticBlock } from './SettingsPrimitives'
import { useSettingsToast } from './SettingsToast'
import { opptrixTokens } from '../../theme/tokens'

const POLL_MS = 2000

const LOG_HEIGHT = 148

type MarketDataTab = 'source' | 'status' | 'sync' | 'package'

const SYNC_MODE_LABEL: Record<string, string> = {
  incremental: '增量',
  full: '全量',
  resume: '接续',
}

function syncModeLabel(mode: string | null | undefined): string | null {
  if (!mode) return null
  return SYNC_MODE_LABEL[mode] ?? null
}

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  tabBar: {
    flexShrink: 0,
    marginBottom: '2px',
  },
  tabList: {
    minHeight: 'unset',
    gap: '2px',
  },
  tabPanel: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  tabPanelHidden: {
    display: 'none',
  },
  packageBody: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    padding: '10px 18px 12px',
  },
  packageHint: {
    fontSize: '12px',
    color: opptrixTokens.textSecondary,
    lineHeight: 1.45,
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
  packageCallout: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    padding: '10px 12px',
    borderRadius: opptrixTokens.radiusMd,
    border: `1px solid ${opptrixTokens.separator}`,
    backgroundColor: opptrixTokens.canvasAlt,
    fontSize: '11px',
    lineHeight: 1.45,
    color: opptrixTokens.textSecondary,
  },
  packageActions: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
    alignItems: 'center',
  },
  hiddenFileInput: {
    display: 'none',
  },
  dialogSurface: {
    maxWidth: '420px',
    width: 'calc(100vw - 32px)',
  },
  dialogTitle: {
    fontSize: '14px',
    fontWeight: 650,
  },
  dialogMeta: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    fontSize: '11px',
    lineHeight: 1.45,
    color: opptrixTokens.textSecondary,
  },
  dialogMetaRow: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: '8px',
  },
  dialogMetaValue: {
    color: opptrixTokens.textPrimary,
    fontWeight: 600,
    fontVariantNumeric: 'tabular-nums',
  },
  dialogActions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '8px',
    paddingTop: '4px',
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
  const toast = useSettingsToast()
  const [tab, setTab] = useState<MarketDataTab>('status')
  const [state, setState] = useState<MarketDataSyncState | null>(null)
  const [loading, setLoading] = useState(true)
  const [starting, setStarting] = useState(false)
  const [tsEnabled, setTsEnabled] = useState(false)
  const [tsToken, setTsToken] = useState('')
  const [tsSaving, setTsSaving] = useState(false)
  const [tsTesting, setTsTesting] = useState(false)
  const [syncActive, setSyncActive] = useState(false)
  const [exporting, setExporting] = useState(false)
  const [importing, setImporting] = useState(false)
  const [importInspecting, setImportInspecting] = useState(false)
  const [importDialogOpen, setImportDialogOpen] = useState(false)
  const [importPreview, setImportPreview] = useState<MarketDataPackageInspectResult | null>(null)
  const [pendingImportFile, setPendingImportFile] = useState<File | null>(null)
  const importInputRef = useRef<HTMLInputElement>(null)
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
    const errors: string[] = []
    await refreshTushare().catch(e => {
      errors.push(e instanceof Error ? e.message : '无法读取数据源配置')
    })
    await refreshSync().catch(e => {
      errors.push(e instanceof Error ? e.message : '无法读取库状态')
    })
    if (errors.length) toast.showError(errors[0])
    setLoading(false)
  }, [refreshSync, refreshTushare, toast])

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
    try {
      setSyncActive(true)
      const resp = await startMarketDataSync()
      toast.showSuccess(resp.message || '同步已启动')
      await refreshSync()
    } catch (e) {
      toast.showError(e instanceof Error ? e.message : '启动失败')
    } finally {
      setStarting(false)
    }
  }

  const handleSaveTushare = async () => {
    setTsSaving(true)
    try {
      const resp = await saveTushareConfig({
        enabled: tsEnabled,
        token: tsToken.trim(),
      })
      setTsToken(resp.data.token ?? tsToken.trim())
      toast.showSuccess(resp.message || '已保存')
    } catch (e) {
      toast.showError(e instanceof Error ? e.message : '保存失败')
    } finally {
      setTsSaving(false)
    }
  }

  const handleTestTushare = async () => {
    setTsTesting(true)
    try {
      const resp = await testTushareConfig(tsToken.trim() || undefined)
      const result = resp.data
      if (result.ok) {
        toast.showSuccess(result.message)
      } else {
        toast.showError(`测试失败：${result.message}`)
      }
    } catch (e) {
      toast.showError(e instanceof Error ? e.message : '测试连接失败')
    } finally {
      setTsTesting(false)
    }
  }

  const handleExportPackage = async () => {
    let destination
    try {
      destination = await pickExportDestination()
    } catch (e) {
      toast.showError(e instanceof Error ? e.message : '无法选择文件夹')
      return
    }
    if (!destination) return

    setExporting(true)
    try {
      const result = await exportMarketDataPackageFile(destination)
      toast.showSuccess(formatExportResultMessage(result))
    } catch (e) {
      toast.showError(e instanceof Error ? e.message : '导出失败')
    } finally {
      setExporting(false)
    }
  }

  const resetImportDialog = () => {
    setImportDialogOpen(false)
    setImportPreview(null)
    setPendingImportFile(null)
  }

  const handleImportFilePicked = async (file: File | null) => {
    if (!file) return
    setImportInspecting(true)
    try {
      const preview = await inspectMarketDataPackageFile(file)
      if (!preview.valid || !preview.metadata) {
        throw new Error(preview.error || '请选择本应用导出的文件')
      }
      setPendingImportFile(file)
      setImportPreview(preview)
      setImportDialogOpen(true)
    } catch (e) {
      toast.showError(e instanceof Error ? e.message : '无法读取数据包')
    } finally {
      setImportInspecting(false)
      if (importInputRef.current) importInputRef.current.value = ''
    }
  }

  const handleConfirmImport = async () => {
    if (!pendingImportFile) return
    setImporting(true)
    try {
      const resp = await importMarketDataPackageFile(pendingImportFile)
      toast.showSuccess(resp.message || '导入完成')
      resetImportDialog()
      await refreshSync()
    } catch (e) {
      toast.showError(e instanceof Error ? e.message : '导入失败')
    } finally {
      setImporting(false)
    }
  }

  if (loading && !state) {
    return <Spinner size="tiny" label="加载中…" />
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
    ? '已就绪，后台会自动保持更新'
    : (hasProgress
      ? '将从上次进度继续'
      : '首次同步耗时较长，请保持应用运行')

  const bootstrap = db?.bootstrap
  const bootstrapItems = bootstrap
    ? [
      { ok: bootstrap.universe, label: '股票池', meta: db?.stock_count ? `${db.stock_count} 只` : '—' },
      {
        ok: bootstrap.quotes,
        label: '最新估值',
        meta: formatCoveragePercent(bootstrap.quote_stock_ratio, 'quotes', db?.stock_count ?? 0, db?.job_progress),
      },
      {
        ok: bootstrap.klines,
        label: '日 K 线',
        meta: formatCoveragePercent(bootstrap.kline_stock_ratio, 'kline_bootstrap', db?.stock_count ?? 0, db?.job_progress),
      },
      {
        ok: bootstrap.fundamentals,
        label: '财务指标',
        meta: formatCoveragePercent(bootstrap.fin_stock_ratio, 'financials', db?.stock_count ?? 0, db?.job_progress),
      },
      {
        ok: bootstrap.screen_factors,
        label: '筛股评分',
        meta: formatCoveragePercent(bootstrap.factor_stock_ratio, 'screen_factors', db?.stock_count ?? 0, db?.job_progress),
      },
    ]
    : []

  const syncMode = syncModeLabel(state?.mode)

  return (
    <div className={s.root}>
      <div className={s.tabBar}>
        <TabList
          className={s.tabList}
          size="small"
          selectedValue={tab}
          onTabSelect={(_, data) => setTab(data.value as MarketDataTab)}
        >
          <Tab value="source">数据源</Tab>
          <Tab value="status">库状态</Tab>
          <Tab value="sync">同步</Tab>
          <Tab value="package">导入导出</Tab>
        </TabList>
      </div>

      <div className={tab === 'source' ? s.tabPanel : s.tabPanelHidden}>
        <SettingsGroup>
          <SettingsPanelHeader
            title="Tushare Pro"
            action={(
              <Switch
                checked={tsEnabled}
                onChange={(_, d) => setTsEnabled(!!d.checked)}
                aria-label="启用 Tushare"
              />
            )}
          />
          <SettingsRow
            title="API Token"
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
      </div>

      <div className={tab === 'status' ? s.tabPanel : s.tabPanelHidden}>
        <SettingsGroup>
          <SettingsPanelHeader title="库状态" />
          <SettingsStaticBlock>
            {db?.is_ready && <Text className={s.readyBadge} block>已就绪 · 可本地挖掘</Text>}
            <div className={s.statsGrid}>
              <span className={s.statLabel}>股票</span>
              <span className={s.statValue}>{db?.stock_count ?? 0}</span>
              <span className={s.statLabel}>公告</span>
              <span className={s.statValue}>{db?.announcement_count ?? 0}</span>
              <span className={s.statLabel}>指标日</span>
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

      <div className={tab === 'sync' ? s.tabPanel : s.tabPanelHidden}>
        <SettingsGroup>
          <SettingsPanelHeader
            title="数据同步"
            action={(
              <OpptrixButton
                variant="primary"
                disabled={starting || running}
                onClick={() => { void handleStart() }}
              >
                {running ? '同步中…' : '开始同步'}
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
                        : (state?.message || '准备中…'))
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
                  {`步骤 ${state?.jobs_completed ?? 0}/${state?.jobs_total ?? 0}`}
                  {syncMode && running ? ` · ${syncMode}` : ''}
                  {running ? ' · 进行中' : ''}
                </Text>
              </div>
            )}
          </div>
        </SettingsGroup>
        <div className={s.logShell}>
          <div className={s.logHead}>日志</div>
          <pre
            ref={logRef}
            tabIndex={0}
            className={mergeClasses(s.logBody, 'opptrix-scroll')}
          >
            {(state?.logs?.length
              ? state.logs.join('\n')
              : '暂无日志')}
          </pre>
        </div>
      </div>

      <div className={tab === 'package' ? s.tabPanel : s.tabPanelHidden}>
        <SettingsGroup>
          <SettingsPanelHeader title="导入导出" />
          <div className={s.packageBody}>
            <div className={s.packageCallout}>
              <Text block>
                仅含行情与筛股用的基础数据，不含关注列表、自编策略、密钥、对话与持仓。
                导入会覆盖本机数据并自动备份；换机导入可省去长时间首次同步。
              </Text>
            </div>
            <div className={s.packageActions}>
              <OpptrixButton
                variant="secondary"
                disabled={exporting || running || importing}
                onClick={() => { void handleExportPackage() }}
              >
                {exporting ? '正在导出…' : '导出…'}
              </OpptrixButton>
              <OpptrixButton
                variant="secondary"
                disabled={running || importing || importInspecting}
                onClick={() => importInputRef.current?.click()}
              >
                {importInspecting ? '读取中…' : '导入…'}
              </OpptrixButton>
              <input
                ref={importInputRef}
                className={s.hiddenFileInput}
                type="file"
                accept=".opmd,application/vnd.opptrix.market-data+opmd"
                onChange={e => { void handleImportFilePicked(e.target.files?.[0] ?? null) }}
              />
            </div>
            {exporting ? (
              <Text className={s.packageHint}>正在打包并写入，请稍候…</Text>
            ) : null}
          </div>
        </SettingsGroup>
      </div>

      <Dialog open={importDialogOpen} onOpenChange={(_, data) => { if (!data.open) resetImportDialog() }}>
        <DialogSurface className={mergeClasses(s.dialogSurface, 'opptrix-dialog-surface')}>
          <DialogBody>
            <DialogTitle className={s.dialogTitle}>确认导入</DialogTitle>
            <DialogContent>
              <div className={s.dialogMeta}>
                <Text block>将替换本机基础数据；关注列表、自编策略与模型设置不变。</Text>
                {importPreview?.metadata && (
                  <>
                    <div className={s.dialogMetaRow}>
                      <span>导出时间</span>
                      <span className={s.dialogMetaValue}>
                        {new Date(importPreview.metadata.exported_at).toLocaleString('zh-CN')}
                      </span>
                    </div>
                    <div className={s.dialogMetaRow}>
                      <span>股票数量</span>
                      <span className={s.dialogMetaValue}>{importPreview.metadata.snapshot.stock_count}</span>
                    </div>
                    <div className={s.dialogMetaRow}>
                      <span>指标更新到</span>
                      <span className={s.dialogMetaValue}>
                        {importPreview.metadata.snapshot.latest_factor_date ?? '—'}
                      </span>
                    </div>
                    <div className={s.dialogMetaRow}>
                      <span>挖掘可用</span>
                      <span className={s.dialogMetaValue}>
                        {importPreview.metadata.snapshot.is_ready ? '可直接使用' : '可能还需同步'}
                      </span>
                    </div>
                    {importPreview.sqlite_bytes != null && (
                      <div className={s.dialogMetaRow}>
                        <span>文件大小</span>
                        <span className={s.dialogMetaValue}>
                          {`约 ${(importPreview.sqlite_bytes / (1024 * 1024)).toFixed(1)} MB`}
                        </span>
                      </div>
                    )}
                  </>
                )}
                {running && (
                  <Text block>同步进行中，请结束后再导入。</Text>
                )}
              </div>
              <div className={s.dialogActions}>
                <OpptrixButton variant="secondary" onClick={resetImportDialog} disabled={importing}>
                  取消
                </OpptrixButton>
                <OpptrixButton
                  variant="primary"
                  onClick={() => { void handleConfirmImport() }}
                  disabled={importing || running || !pendingImportFile}
                >
                  {importing ? '导入中…' : '确认导入'}
                </OpptrixButton>
              </div>
            </DialogContent>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </div>
  )
}
