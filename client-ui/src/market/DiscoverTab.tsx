import { useEffect, useMemo, useState, type MouseEvent } from 'react'
import { ProgressBar, Spinner, Tab, TabList, Text, makeStyles, mergeClasses } from '@fluentui/react-components'
import { AddRegular, ArrowRightRegular, DeleteRegular } from '@fluentui/react-icons'
import { listDiscoverStrategies, getHealth } from '../api/client'
import type { DiscoverJobSnapshot, DiscoverStrategyOption, DiscoverStrategyPublic, MarketRegimeData } from '../types/schemas'
import type { WatchlistItem } from '../types/market'
import OpptrixButton from '../components/opptrix/OpptrixButton'
import DiscoverStrategyPicker from './DiscoverStrategyPicker'
import { factorLabel } from './factorLabels'
import { normalizeCode } from './format'
import { opptrixTokens } from '../theme/tokens'
import { ghostInteractive } from '../theme/mixins'
import { research } from '../api/client'
import type { DiscoverSessionState } from './useDiscoverSession'
import type { DiscoverRunResult } from '../types/schemas'
import { useCustomDiscoverStrategies } from './useCustomDiscoverStrategies'

const CONTENT_PAD = '15px'
const ITEM_BG_INSET = '10px'
const ITEM_INNER_PAD = '10px'

const CATEGORY_LABEL: Record<DiscoverStrategyPublic['category'], string> = {
  value: '价值',
  growth: '成长',
  quality: '质量',
  momentum: '动量',
  balanced: '均衡',
  contrarian: '逆向',
}

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
    height: '100%',
  },
  head: {
    flexShrink: 0,
    padding: `8px ${CONTENT_PAD} 6px`,
    borderBottom: `1px solid ${opptrixTokens.separator}`,
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  headHint: {
    fontSize: '10px',
    color: opptrixTokens.textTertiary,
    lineHeight: 1.45,
  },
  tabBar: {
    flexShrink: 0,
    padding: `0 ${CONTENT_PAD}`,
    borderBottom: `1px solid ${opptrixTokens.separator}`,
  },
  tabList: {
    minHeight: '32px',
  },
  body: {
    flex: 1,
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
  },
  runRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flexWrap: 'wrap',
  },
  runBtn: {
    fontSize: '11px',
    minHeight: '28px',
  },
  runHint: {
    fontSize: '10px',
    color: opptrixTokens.textTertiary,
    lineHeight: 1.4,
  },
  progressBlock: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    padding: `6px ${CONTENT_PAD}`,
    borderBottom: `1px solid ${opptrixTokens.separator}`,
  },
  progressMeta: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: '8px',
    fontSize: '10px',
    color: opptrixTokens.textSecondary,
  },
  progressPct: {
    fontVariantNumeric: 'tabular-nums',
    fontWeight: 600,
    color: opptrixTokens.textPrimary,
  },
  dbBanner: {
    flexShrink: 0,
    padding: `6px ${CONTENT_PAD}`,
    borderBottom: `1px solid ${opptrixTokens.separator}`,
    fontSize: '10px',
    color: opptrixTokens.textSecondary,
    lineHeight: 1.45,
  },
  regimeBanner: {
    flexShrink: 0,
    padding: `6px ${CONTENT_PAD}`,
    borderBottom: `1px solid ${opptrixTokens.separator}`,
    fontSize: '10px',
    lineHeight: 1.45,
    color: opptrixTokens.textSecondary,
    backgroundColor: opptrixTokens.accentSoft,
  },
  regimeHeadline: {
    fontWeight: 650,
    color: opptrixTokens.textPrimary,
    marginBottom: '2px',
  },
  regimeIndicators: {
    fontSize: '9px',
    color: opptrixTokens.textTertiary,
    lineHeight: 1.4,
    marginBottom: '3px',
  },
  summary: {
    flexShrink: 0,
    padding: `8px ${CONTENT_PAD}`,
    borderBottom: `1px solid ${opptrixTokens.separator}`,
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  summaryTitle: {
    fontSize: '12px',
    fontWeight: 650,
    color: opptrixTokens.textPrimary,
  },
  summaryText: {
    fontSize: '10px',
    lineHeight: 1.45,
    color: opptrixTokens.textSecondary,
  },
  stats: {
    fontSize: '10px',
    color: opptrixTokens.textTertiary,
  },
  list: {
    flex: 1,
    minHeight: 0,
    overflowY: 'auto',
    padding: `8px ${ITEM_BG_INSET} 10px`,
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  row: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) auto',
    gap: '6px',
    alignItems: 'flex-start',
    padding: `8px ${ITEM_INNER_PAD}`,
    borderRadius: opptrixTokens.radiusMd,
    cursor: 'pointer',
    ...ghostInteractive,
    ':hover': { backgroundColor: opptrixTokens.accentSoft },
  },
  rowMain: {
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  rowTitle: {
    display: 'flex',
    alignItems: 'baseline',
    gap: '6px',
    minWidth: 0,
  },
  rowName: {
    fontSize: '12px',
    fontWeight: 650,
    color: opptrixTokens.textPrimary,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  rowCode: {
    fontSize: '10px',
    color: opptrixTokens.textTertiary,
    flexShrink: 0,
  },
  rankBadge: {
    fontSize: '10px',
    fontWeight: 650,
    color: opptrixTokens.textSecondary,
    fontVariantNumeric: 'tabular-nums',
  },
  matchScore: {
    fontSize: '10px',
    fontWeight: 600,
    color: '#248A3D',
    fontVariantNumeric: 'tabular-nums',
  },
  thesis: {
    fontSize: '10px',
    lineHeight: 1.45,
    color: opptrixTokens.textSecondary,
  },
  highlights: {
    fontSize: '9px',
    color: opptrixTokens.textTertiary,
    lineHeight: 1.4,
  },
  rowActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '2px',
    flexShrink: 0,
    paddingTop: '2px',
  },
  iconBtn: {
    border: 'none',
    background: 'transparent',
    color: opptrixTokens.textTertiary,
    padding: '4px',
    borderRadius: opptrixTokens.radiusSm,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    ...ghostInteractive,
    ':hover': {
      color: opptrixTokens.textPrimary,
      backgroundColor: opptrixTokens.accentSoft,
    },
  },
  empty: {
    padding: `24px ${CONTENT_PAD}`,
    textAlign: 'center',
    fontSize: '11px',
    color: opptrixTokens.textTertiary,
    lineHeight: 1.5,
  },
  historyList: {
    flex: 1,
    minHeight: 0,
    overflowY: 'auto',
    padding: `8px ${ITEM_BG_INSET} 10px`,
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  historyRow: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) auto',
    gap: '6px',
    alignItems: 'center',
    padding: `8px ${ITEM_INNER_PAD}`,
    borderRadius: opptrixTokens.radiusMd,
    cursor: 'pointer',
    ...ghostInteractive,
    ':hover': { backgroundColor: opptrixTokens.surfaceHover },
  },
  historyRowActive: {
    backgroundColor: opptrixTokens.accentSoft,
    ':hover': { backgroundColor: opptrixTokens.accentSoft },
  },
  historyMain: {
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '3px',
  },
  historyTitle: {
    fontSize: '12px',
    fontWeight: 650,
    color: opptrixTokens.textPrimary,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  historyMeta: {
    fontSize: '10px',
    color: opptrixTokens.textTertiary,
    lineHeight: 1.4,
  },
  historyActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '2px',
    flexShrink: 0,
  },
  deleteBtn: {
    border: 'none',
    background: 'transparent',
    color: opptrixTokens.textTertiary,
    padding: '4px',
    borderRadius: opptrixTokens.radiusSm,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    ...ghostInteractive,
    ':hover': {
      color: opptrixTokens.error,
      backgroundColor: opptrixTokens.accentSoft,
    },
  },
  error: {
    padding: `8px ${CONTENT_PAD}`,
    fontSize: '11px',
    color: opptrixTokens.error,
  },
})

const PHASE_LABEL: Record<string, string> = {
  parsing: '理解策略',
  prescreen: '快速初选',
  mining: '深度挖掘',
  done: '已完成',
  error: '出错了',
}

type DiscoverPanelTab = 'results' | 'history'

const STATUS_LABEL: Record<DiscoverJobSnapshot['status'], string> = {
  running: '进行中',
  done: '已完成',
  error: '失败',
  cancelled: '已取消',
}

interface Props {
  session: DiscoverSessionState
  watchlistCodes: Set<string>
  onSelect: (item: WatchlistItem) => void
  onAdd: (item: WatchlistItem) => void
}

function formatHighlights(item: DiscoverRunResult['items'][0]): string {
  const parts = [...(item.highlights ?? [])]
  if (item.risks?.length) parts.push(`风险: ${item.risks.join('；')}`)
  const factors = Object.entries(item.key_factors ?? {})
    .slice(0, 3)
    .map(([k, v]) => `${factorLabel(k) ?? k} ${v.toFixed(1)}`)
  if (factors.length) parts.push(factors.join(' · '))
  return parts.join(' · ')
}

function formatHistoryTime(updatedAt: string): string {
  const d = new Date(updatedAt)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatHistoryMeta(job: DiscoverJobSnapshot): string {
  const time = formatHistoryTime(job.updated_at)
  const status = STATUS_LABEL[job.status] ?? job.status
  const count = job.result?.items.length
  const countText = count != null ? ` · ${count} 只` : ''
  return `${time} · ${status}${countText}`
}

function toBuiltinOptions(list: DiscoverStrategyPublic[]): DiscoverStrategyOption[] {
  return list.map(st => ({
    id: st.id,
    name: st.name,
    tagline: st.tagline,
    source: 'builtin' as const,
    category: st.category,
    meta: `${CATEGORY_LABEL[st.category]} · ${st.condition_count} 条因子 · 精选 ${st.final_top_n} 只`,
  }))
}

export default function DiscoverTab({ session, watchlistCodes, onSelect, onAdd }: Props) {
  const s = useStyles()
  const [builtinList, setBuiltinList] = useState<DiscoverStrategyPublic[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [panelTab, setPanelTab] = useState<DiscoverPanelTab>('results')
  const [dbReady, setDbReady] = useState<boolean | null>(null)
  const [llmReady, setLlmReady] = useState<boolean | null>(null)
  const [marketRegime, setMarketRegime] = useState<MarketRegimeData | null>(null)

  const { strategies: customStrategies } = useCustomDiscoverStrategies()

  const {
    history,
    job,
    result,
    running,
    error,
    runStrategy,
    runCustomStrategy,
    cancelRun,
    loadHistoryJob,
    deleteHistoryJob,
    deleteError,
    clearDeleteError,
  } = session

  const strategyOptions = useMemo((): DiscoverStrategyOption[] => {
    const builtins = toBuiltinOptions(builtinList)
    const customs = customStrategies.map(st => ({
      id: st.id,
      name: st.name,
      tagline: st.tagline,
      source: 'custom' as const,
      meta: '自编策略',
    }))
    return [...builtins, ...customs]
  }, [builtinList, customStrategies])

  useEffect(() => {
    let cancelled = false
    void listDiscoverStrategies().then(resp => {
      if (cancelled) return
      const list = resp.strategies ?? []
      setBuiltinList(list)
      setSelectedId(prev => prev ?? list[0]?.id ?? null)
    }).catch(() => {})
    void research.marketDbStatus().then(resp => {
      if (cancelled || !resp.success || !resp.data) return
      setDbReady(resp.data.is_ready)
    }).catch(() => {})
    void getHealth().then(h => {
      if (cancelled) return
      setLlmReady(Boolean(h.llm_configured))
    }).catch(() => setLlmReady(false))
    void research.marketRegime().then(resp => {
      if (cancelled || !resp.success || !resp.data) return
      setMarketRegime(resp.data)
    }).catch(() => {})
    return () => { cancelled = true }
  }, [])

  const handleRun = () => {
    if (!selectedId) return
    setPanelTab('results')
    const custom = customStrategies.find(st => st.id === selectedId)
    if (custom) {
      void runCustomStrategy({ id: custom.id, name: custom.name, prompt: custom.prompt })
    } else {
      void runStrategy(selectedId)
    }
  }

  const progressPct = job?.percent ?? 0
  const barValue = running && progressPct <= 0 ? 0.03 : Math.min(1, progressPct / 100)
  const historyJobs = history.filter(h => h.status !== 'running' || h.id === job?.id)

  const regimeIndicators = useMemo(() => {
    const ind = marketRegime?.indicators
    if (!ind) return null
    const parts: string[] = []
    if (ind.marks_cycle) parts.push(`周期 ${ind.marks_cycle}`)
    if (ind.valuation_anchor) parts.push(`估值 ${ind.valuation_anchor}`)
    if (ind.sentiment_score != null) parts.push(`情绪 ${ind.sentiment_score}`)
    if (ind.advance_pct != null) parts.push(`上涨 ${ind.advance_pct.toFixed(0)}%`)
    if (ind.index_pe != null) parts.push(`沪深300 PE ${ind.index_pe.toFixed(1)}`)
    if (ind.northbound_net_yi != null) {
      const sign = ind.northbound_net_yi >= 0 ? '+' : ''
      parts.push(`北向 ${sign}${ind.northbound_net_yi.toFixed(1)}亿`)
    }
    return parts.length ? parts.join(' · ') : null
  }, [marketRegime])

  const regimeHint = useMemo(() => {
    if (!marketRegime) return null
    if (!selectedId) return marketRegime.detail
    const suggested = marketRegime.suggested_strategy_ids
    if (!suggested.length) return marketRegime.detail
    if (suggested.includes(selectedId)) {
      return `当前市况与所选策略较契合。${marketRegime.detail}`
    }
    const first = builtinList.find(st => st.id === suggested[0])
    if (!first) return marketRegime.detail
    return `${marketRegime.detail} 可优先考虑「${first.name}」。`
  }, [marketRegime, selectedId, builtinList])

  const handleLoadHistory = (histJob: DiscoverJobSnapshot) => {
    loadHistoryJob(histJob)
    setPanelTab('results')
  }

  const handleDeleteHistory = (e: MouseEvent, jobId: string) => {
    e.preventDefault()
    e.stopPropagation()
    clearDeleteError()
    void deleteHistoryJob(jobId)
  }

  return (
    <div className={mergeClasses(s.root, 'opptrix-discover-tab')}>
      <div className={s.head}>
        <Text className={s.headHint} block>
          选好策略后点击「开始挖掘」；自编策略可在设置 → 选股策略中管理。
        </Text>
        <DiscoverStrategyPicker
          strategies={strategyOptions}
          selectedId={selectedId}
          onSelect={setSelectedId}
          disabled={running}
          placeholder="请选择策略"
        />
        <div className={s.runRow}>
          <OpptrixButton
            className={s.runBtn}
            variant="primary"
            disabled={running || !selectedId}
            onClick={handleRun}
          >
            {running ? '挖掘中…' : '开始挖掘'}
          </OpptrixButton>
          {running && (
            <OpptrixButton className={s.runBtn} variant="secondary" onClick={() => { void cancelRun() }}>
              取消
            </OpptrixButton>
          )}
          {running && <Spinner size="tiny" />}
          <Text className={s.runHint}>
            {dbReady ? '解析条件 → 因子初选 → 精选标的' : '初选库未就绪时将在线扫描'}
            {llmReady === false ? ' · 需配置大模型' : ''}
          </Text>
        </div>
        {marketRegime && (
          <div className={s.regimeBanner}>
            <Text className={s.regimeHeadline} block>
              {marketRegime.headline}
            </Text>
            {regimeIndicators && (
              <Text className={s.regimeIndicators} block>
                {regimeIndicators}
              </Text>
            )}
            {regimeHint && <Text block>{regimeHint}</Text>}
          </div>
        )}
      </div>

      <div className={s.tabBar}>
        <TabList
          className={s.tabList}
          size="small"
          selectedValue={panelTab}
          onTabSelect={(_, data) => setPanelTab(data.value as DiscoverPanelTab)}
        >
          <Tab value="results">详情</Tab>
          <Tab value="history">历史记录</Tab>
        </TabList>
      </div>

      <div className={s.body}>
      {panelTab === 'results' && (
        <>
      {dbReady === false && (
        <Text className={s.dbBanner} block>
          初选数据库尚未就绪。建议打开设置 → 基础数据完成构建。
        </Text>
      )}

      {(running || job) && (
        <div className={s.progressBlock}>
          <div className={s.progressMeta}>
            <Text block>
              {PHASE_LABEL[job?.phase ?? 'parsing'] ?? job?.phase}
              {' · '}
              {job?.message || '准备中…'}
            </Text>
            <Text className={s.progressPct}>
              {running && progressPct <= 0 ? '…' : `${Math.round(progressPct)}%`}
            </Text>
          </div>
          <ProgressBar value={barValue} thickness="medium" color="brand" shape="rounded" />
        </div>
      )}

      {error && <Text className={s.error}>{error}</Text>}

      {result && (
        <div className={s.summary}>
          <Text className={s.summaryTitle} block>{result.strategy_title}</Text>
          <Text className={s.summaryText} block>{result.strategy_summary}</Text>
          <Text className={s.stats} block>
            {`初选扫描 ${result.prescreen.scanned} 只 · 通过 ${result.prescreen.passed} 只 · 最终 ${result.items.length} 只`}
            {result.prescreen.source ? ` · ${result.prescreen.source === 'local' ? '本地' : '在线'}` : ''}
            {result.tools_used?.length ? ` · 工具 ${result.tools_used.length} 次` : ''}
          </Text>
        </div>
      )}

      <div className={mergeClasses(s.list, 'opptrix-scroll')}>
        {!result && !running && !error && (
          <Text className={s.empty}>
            选好策略并点击「开始挖掘」；任务在后台运行，切换页面不会中断。
          </Text>
        )}
        {result?.items.map(item => {
          const inWatchlist = watchlistCodes.has(normalizeCode(item.code))
          return (
            <div
              key={item.code}
              className={s.row}
              role="button"
              tabIndex={0}
              onClick={() => onSelect({ code: item.code, name: item.name })}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  onSelect({ code: item.code, name: item.name })
                }
              }}
            >
              <div className={s.rowMain}>
                <div className={s.rowTitle}>
                  <span className={s.rankBadge}>#{item.rank}</span>
                  <span className={s.rowName}>{item.name}</span>
                  <span className={s.rowCode}>{item.code}</span>
                  <span className={s.matchScore}>{item.match_score} 分</span>
                </div>
                {item.thesis && <Text className={s.thesis} block>{item.thesis}</Text>}
                <Text className={s.highlights} block>{formatHighlights(item)}</Text>
              </div>
              <div className={s.rowActions}>
                {!inWatchlist && (
                  <button
                    type="button"
                    className={s.iconBtn}
                    title="加入关注"
                    aria-label={`加入关注 ${item.name}`}
                    onClick={e => { e.stopPropagation(); onAdd({ code: item.code, name: item.name }) }}
                  >
                    <AddRegular fontSize={14} />
                  </button>
                )}
                <button
                  type="button"
                  className={s.iconBtn}
                  title="查看个股"
                  aria-label={`查看 ${item.name}`}
                  onClick={e => {
                    e.stopPropagation()
                    onSelect({ code: item.code, name: item.name })
                  }}
                >
                  <ArrowRightRegular fontSize={14} />
                </button>
              </div>
            </div>
          )
        })}
        {result && result.items.length === 0 && (
          <Text className={s.empty}>暂无符合该策略的标的，可换一条策略再试</Text>
        )}
      </div>
        </>
      )}

      {panelTab === 'history' && (
        <div className={mergeClasses(s.historyList, 'opptrix-scroll')}>
          {deleteError && (
            <Text className={s.error} block>{deleteError}</Text>
          )}
          {historyJobs.length === 0 && (
            <Text className={s.empty}>
              暂无历史记录。完成一次挖掘后，结果会保存在这里，可随时回看或删除。
            </Text>
          )}
          {historyJobs.map(histJob => (
            <div
              key={histJob.id}
              className={mergeClasses(s.historyRow, job?.id === histJob.id && s.historyRowActive)}
              role="button"
              tabIndex={0}
              onClick={() => handleLoadHistory(histJob)}
              onKeyDown={e => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  handleLoadHistory(histJob)
                }
              }}
            >
              <div className={s.historyMain}>
                <Text className={s.historyTitle} block>
                  {histJob.strategy_name || '未命名策略'}
                </Text>
                <Text className={s.historyMeta} block>
                  {formatHistoryMeta(histJob)}
                </Text>
              </div>
              <div className={s.historyActions}>
                <button
                  type="button"
                  className={s.deleteBtn}
                  title="删除记录"
                  aria-label={`删除 ${histJob.strategy_name} 的挖掘记录`}
                  onMouseDown={e => e.stopPropagation()}
                  onClick={e => handleDeleteHistory(e, histJob.id)}
                >
                  <DeleteRegular fontSize={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      </div>
    </div>
  )
}
