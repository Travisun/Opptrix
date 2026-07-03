import { useEffect, useMemo, useState, type MouseEvent } from 'react'
import { ProgressBar, Spinner, Tab, TabList, Text, makeStyles, mergeClasses } from '@fluentui/react-components'
import { AddRegular, ArrowRightRegular, DeleteRegular } from '@fluentui/react-icons'
import { listDiscoverStrategies, getHealth, getDiscoverReadiness } from '../api/client'
import type { DiscoverJobSnapshot, DiscoverProfileReadiness, DiscoverStrategyOption, DiscoverStrategyProfile, DiscoverStrategyPublic, MarketRegimeData } from '../types/schemas'
import type { WatchlistItem } from '../types/market'
import OpptrixButton from '../components/opptrix/OpptrixButton'
import DiscoverStrategyPicker from './DiscoverStrategyPicker'
import DiscoverProfileTabList, { isDiscoverProfileMiningReady } from './DiscoverProfileTabList'
import {
  defaultDiscoverProfile,
  DISCOVER_PROFILE_LABELS,
  regimeDetailForProfile,
  regimeSuggestedIds,
} from './discoverProfiles'
import { factorLabel } from './factorLabels'
import { normalizeCode } from './format'
import { opptrixTokens, opptrixCssVars } from '../theme/tokens'
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
    borderBottom: `1px solid ${opptrixCssVars.separator}`,
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  headHint: {
    fontSize: '10px',
    color: opptrixCssVars.textTertiary,
    lineHeight: 1.45,
  },
  tabBar: {
    flexShrink: 0,
    padding: `0 ${CONTENT_PAD}`,
    borderBottom: `1px solid ${opptrixCssVars.separator}`,
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
    color: opptrixCssVars.textTertiary,
    lineHeight: 1.4,
  },
  progressBlock: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    padding: `6px ${CONTENT_PAD}`,
    borderBottom: `1px solid ${opptrixCssVars.separator}`,
  },
  progressMeta: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: '8px',
    fontSize: '10px',
    color: opptrixCssVars.textSecondary,
  },
  progressPct: {
    fontVariantNumeric: 'tabular-nums',
    fontWeight: 600,
    color: opptrixCssVars.textPrimary,
  },
  dbBanner: {
    flexShrink: 0,
    padding: `6px ${CONTENT_PAD}`,
    borderBottom: `1px solid ${opptrixCssVars.separator}`,
    fontSize: '10px',
    color: opptrixCssVars.textSecondary,
    lineHeight: 1.45,
  },
  regimeBanner: {
    flexShrink: 0,
    padding: `6px ${CONTENT_PAD}`,
    borderBottom: `1px solid ${opptrixCssVars.separator}`,
    fontSize: '10px',
    lineHeight: 1.45,
    color: opptrixCssVars.textSecondary,
    backgroundColor: opptrixCssVars.accentSoft,
  },
  regimeHeadline: {
    fontWeight: 650,
    color: opptrixCssVars.textPrimary,
    marginBottom: '2px',
  },
  regimeIndicators: {
    fontSize: '9px',
    color: opptrixCssVars.textTertiary,
    lineHeight: 1.4,
    marginBottom: '3px',
  },
  summary: {
    flexShrink: 0,
    padding: `8px ${CONTENT_PAD}`,
    borderBottom: `1px solid ${opptrixCssVars.separator}`,
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  summaryTitle: {
    fontSize: '12px',
    fontWeight: 650,
    color: opptrixCssVars.textPrimary,
  },
  summaryText: {
    fontSize: '10px',
    lineHeight: 1.45,
    color: opptrixCssVars.textSecondary,
  },
  stats: {
    fontSize: '10px',
    color: opptrixCssVars.textTertiary,
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
    ':hover': { backgroundColor: opptrixCssVars.accentSoft },
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
    color: opptrixCssVars.textPrimary,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  rowCode: {
    fontSize: '10px',
    color: opptrixCssVars.textTertiary,
    flexShrink: 0,
  },
  rankBadge: {
    fontSize: '10px',
    fontWeight: 650,
    color: opptrixCssVars.textSecondary,
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
    color: opptrixCssVars.textSecondary,
  },
  highlights: {
    fontSize: '9px',
    color: opptrixCssVars.textTertiary,
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
    color: opptrixCssVars.textTertiary,
    padding: '4px',
    borderRadius: opptrixTokens.radiusSm,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    ...ghostInteractive,
    ':hover': {
      color: opptrixCssVars.textPrimary,
      backgroundColor: opptrixCssVars.accentSoft,
    },
  },
  empty: {
    padding: `24px ${CONTENT_PAD}`,
    textAlign: 'center',
    fontSize: '11px',
    color: opptrixCssVars.textTertiary,
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
    ':hover': { backgroundColor: opptrixCssVars.surfaceHover },
  },
  historyRowActive: {
    backgroundColor: opptrixCssVars.accentSoft,
    ':hover': { backgroundColor: opptrixCssVars.accentSoft },
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
    color: opptrixCssVars.textPrimary,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  historyMeta: {
    fontSize: '10px',
    color: opptrixCssVars.textTertiary,
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
    color: opptrixCssVars.textTertiary,
    padding: '4px',
    borderRadius: opptrixTokens.radiusSm,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    ...ghostInteractive,
    ':hover': {
      color: opptrixCssVars.error,
      backgroundColor: opptrixCssVars.accentSoft,
    },
  },
  error: {
    padding: `8px ${CONTENT_PAD}`,
    fontSize: '11px',
    color: opptrixCssVars.error,
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
  const profileLabel = job.profile ? DISCOVER_PROFILE_LABELS[job.profile] : null
  const profileText = profileLabel ? ` · ${profileLabel}` : ''
  return `${time}${profileText} · ${status}${countText}`
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
  const [profile, setProfile] = useState<DiscoverStrategyProfile>(defaultDiscoverProfile())
  const [builtinList, setBuiltinList] = useState<DiscoverStrategyPublic[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [panelTab, setPanelTab] = useState<DiscoverPanelTab>('results')
  const [llmReady, setLlmReady] = useState<boolean | null>(null)
  const [marketRegime, setMarketRegime] = useState<MarketRegimeData | null>(null)
  const [readiness, setReadiness] = useState<DiscoverProfileReadiness | null>(null)
  const [readinessByProfile, setReadinessByProfile] = useState<
    Partial<Record<DiscoverStrategyProfile, DiscoverProfileReadiness>>
  >({})

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
    const customs = customStrategies
      .filter(st => (st.profile ?? defaultDiscoverProfile()) === profile)
      .map(st => ({
        id: st.id,
        name: st.name,
        tagline: st.tagline,
        source: 'custom' as const,
        profile: st.profile ?? defaultDiscoverProfile(),
        meta: '自编策略',
      }))
    return [...builtins, ...customs]
  }, [builtinList, customStrategies, profile])

  const profileMiningReady = isDiscoverProfileMiningReady(profile)

  useEffect(() => {
    let cancelled = false
    void getDiscoverReadiness().then(resp => {
      if (cancelled || !resp.data || !('items' in resp.data)) return
      const map: Partial<Record<DiscoverStrategyProfile, DiscoverProfileReadiness>> = {}
      for (const item of resp.data.items) map[item.profile] = item
      setReadinessByProfile(map)
    }).catch(() => {})
    return () => { cancelled = true }
  }, [])

  useEffect(() => {
    let cancelled = false
    void getDiscoverReadiness(profile).then(resp => {
      if (cancelled || !resp.data || !('profile' in resp.data)) return
      setReadiness(resp.data)
      setReadinessByProfile(prev => ({ ...prev, [profile]: resp.data as DiscoverProfileReadiness }))
    }).catch(() => {
      if (!cancelled) setReadiness(null)
    })
    return () => { cancelled = true }
  }, [profile])

  useEffect(() => {
    let cancelled = false
    void listDiscoverStrategies(profile).then(resp => {
      if (cancelled) return
      const list = resp.strategies ?? []
      setBuiltinList(list)
      setSelectedId(prev => {
        if (prev && list.some(item => item.id === prev)) return prev
        return list[0]?.id ?? null
      })
    }).catch(() => {})
    return () => { cancelled = true }
  }, [profile])

  useEffect(() => {
    if (strategyOptions.some(o => o.id === selectedId)) return
    setSelectedId(strategyOptions[0]?.id ?? null)
  }, [strategyOptions, selectedId])

  useEffect(() => {
    let cancelled = false
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
      void runCustomStrategy({
        id: custom.id,
        name: custom.name,
        prompt: custom.prompt,
        profile: custom.profile ?? profile,
      })
    } else {
      void runStrategy(selectedId, profile)
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
    if (profile === 'cn_etf') {
      const suggested = regimeSuggestedIds(marketRegime, 'cn_etf')
      const base = regimeDetailForProfile(marketRegime, 'cn_etf')
      if (!selectedId) return base
      if (suggested.includes(selectedId)) return `当前市况与所选 ETF 策略较契合。${base}`
      const first = builtinList.find(st => st.id === suggested[0])
      if (!first) return base
      return `${base} 可优先考虑「${first.name}」。`
    }
    if (profile !== 'cn_equity') return null
    if (!selectedId) return regimeDetailForProfile(marketRegime, 'cn_equity')
    const suggested = regimeSuggestedIds(marketRegime, 'cn_equity')
    const detail = regimeDetailForProfile(marketRegime, 'cn_equity')
    if (!suggested.length) return detail
    if (suggested.includes(selectedId)) {
      return `当前市况与所选策略较契合。${detail}`
    }
    const first = builtinList.find(st => st.id === suggested[0])
    if (!first) return detail
    return `${detail} 可优先考虑「${first.name}」。`
  }, [marketRegime, selectedId, builtinList, profile])

  const handleLoadHistory = (histJob: DiscoverJobSnapshot) => {
    const histProfile = histJob.profile ?? histJob.result?.plan?.profile
    if (histProfile) setProfile(histProfile)
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
        <DiscoverProfileTabList
          selected={profile}
          onSelect={setProfile}
          disabled={running}
          readinessByProfile={readinessByProfile}
        />
        <Text className={s.headHint} block>
          {profileMiningReady
            ? '选好策略后点击「开始挖掘」；自编策略可在设置 → 选股策略中管理。'
            : '该资产类型的挖掘策略筹备中，可先开启对应数据包或关注后续更新。'}
        </Text>
        {readiness && (
          <div className={readiness.ready ? s.dbBanner : s.regimeBanner}>
            <Text block>{readiness.message}</Text>
            {readiness.action && !readiness.ready && (
              <Text block style={{ marginTop: 2 }}>{readiness.action}</Text>
            )}
          </div>
        )}
        {profileMiningReady ? (
          <>
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
            disabled={running || !selectedId || readiness?.ready === false}
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
            {profile === 'cn_etf'
              ? '加载条件 → ETF 初选 → 决策雷达排序 → 精选标的'
              : readiness?.mode === 'online'
                ? '解析条件 → 在线初选 → 精选标的'
                : '解析条件 → 因子初选 → 精选标的'}
            {llmReady === false ? ' · 需配置大模型' : ''}
          </Text>
        </div>
          </>
        ) : readiness?.action ? (
          <Text className={s.headHint} block>{readiness.action}</Text>
        ) : null}
        {marketRegime && (profile === 'cn_equity' || profile === 'cn_etf') && (
          <div className={s.regimeBanner}>
            <Text className={s.regimeHeadline} block>
              {profile === 'cn_etf' ? '宽基 ETF 配置参考' : marketRegime.headline}
            </Text>
            {profile === 'cn_equity' && regimeIndicators && (
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
