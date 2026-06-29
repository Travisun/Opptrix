import { useEffect, useMemo, useState, type MouseEvent } from 'react'
import { ProgressBar, Spinner, Text, makeStyles, mergeClasses } from '@fluentui/react-components'
import { AddRegular, ArrowRightRegular, HistoryRegular } from '@fluentui/react-icons'
import { listDiscoverStrategies, listSkills } from '../api/client'
import type { DiscoverStrategyOption, DiscoverStrategyPublic } from '../types/schemas'
import type { WatchlistItem } from '../types/market'
import InnoButton from '../components/inno/InnoButton'
import DiscoverStrategyPicker from './DiscoverStrategyPicker'
import { factorLabel } from './factorLabels'
import { normalizeCode } from './format'
import { innoTokens } from '../theme/tokens'
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
    borderBottom: `1px solid ${innoTokens.separator}`,
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  headHint: {
    fontSize: '10px',
    color: innoTokens.textTertiary,
    lineHeight: 1.45,
  },
  historyRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    flexWrap: 'wrap',
  },
  historyChip: {
    border: `1px solid ${innoTokens.separator}`,
    backgroundColor: innoTokens.canvas,
    color: innoTokens.textSecondary,
    borderRadius: innoTokens.radiusFull,
    fontSize: '9px',
    fontWeight: 500,
    padding: '3px 8px',
    cursor: 'pointer',
    maxWidth: '160px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    ...ghostInteractive,
    ':hover': {
      borderColor: innoTokens.separatorStrong,
      color: innoTokens.textPrimary,
    },
  },
  historyChipActive: {
    borderColor: innoTokens.accent,
    backgroundColor: innoTokens.accentSoft,
    color: innoTokens.textPrimary,
  },
  runRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flexWrap: 'wrap',
  },
  strategyShell: {
    padding: `8px ${ITEM_BG_INSET}`,
    borderRadius: innoTokens.radiusMd,
    backgroundColor: innoTokens.canvasAlt,
    border: `1px solid ${innoTokens.separator}`,
  },
  runBtn: {
    fontSize: '11px',
    minHeight: '28px',
  },
  runHint: {
    fontSize: '10px',
    color: innoTokens.textTertiary,
    lineHeight: 1.4,
  },
  progressBlock: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    padding: `6px ${CONTENT_PAD}`,
    borderBottom: `1px solid ${innoTokens.separator}`,
  },
  progressMeta: {
    display: 'flex',
    justifyContent: 'space-between',
    gap: '8px',
    fontSize: '10px',
    color: innoTokens.textSecondary,
  },
  progressPct: {
    fontVariantNumeric: 'tabular-nums',
    fontWeight: 600,
    color: innoTokens.textPrimary,
  },
  dbBanner: {
    flexShrink: 0,
    padding: `6px ${CONTENT_PAD}`,
    borderBottom: `1px solid ${innoTokens.separator}`,
    fontSize: '10px',
    color: innoTokens.textSecondary,
    lineHeight: 1.45,
  },
  summary: {
    flexShrink: 0,
    padding: `8px ${CONTENT_PAD}`,
    borderBottom: `1px solid ${innoTokens.separator}`,
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  summaryTitle: {
    fontSize: '12px',
    fontWeight: 650,
    color: innoTokens.textPrimary,
  },
  summaryText: {
    fontSize: '10px',
    lineHeight: 1.45,
    color: innoTokens.textSecondary,
  },
  stats: {
    fontSize: '10px',
    color: innoTokens.textTertiary,
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
    borderRadius: innoTokens.radiusMd,
    cursor: 'pointer',
    ...ghostInteractive,
    ':hover': { backgroundColor: innoTokens.accentSoft },
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
    color: innoTokens.textPrimary,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  rowCode: {
    fontSize: '10px',
    color: innoTokens.textTertiary,
    flexShrink: 0,
  },
  rankBadge: {
    fontSize: '10px',
    fontWeight: 650,
    color: innoTokens.textSecondary,
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
    color: innoTokens.textSecondary,
  },
  highlights: {
    fontSize: '9px',
    color: innoTokens.textTertiary,
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
    color: innoTokens.textTertiary,
    padding: '4px',
    borderRadius: innoTokens.radiusSm,
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    ...ghostInteractive,
    ':hover': {
      color: innoTokens.textPrimary,
      backgroundColor: innoTokens.accentSoft,
    },
  },
  empty: {
    padding: `24px ${CONTENT_PAD}`,
    textAlign: 'center',
    fontSize: '11px',
    color: innoTokens.textTertiary,
    lineHeight: 1.5,
  },
  error: {
    padding: `8px ${CONTENT_PAD}`,
    fontSize: '11px',
    color: innoTokens.error,
  },
})

const PHASE_LABEL: Record<string, string> = {
  parsing: '加载策略',
  prescreen: '本地初选',
  mining: 'Agent 挖掘',
  done: '完成',
  error: '出错',
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

function formatHistoryLabel(strategyName: string, updatedAt: string, status: string): string {
  const d = new Date(updatedAt)
  const time = Number.isNaN(d.getTime())
    ? ''
    : d.toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
  const suffix = status === 'running' ? '进行中' : status === 'done' ? '完成' : status === 'error' ? '失败' : '已取消'
  return `${strategyName || '策略'} · ${time} · ${suffix}`
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
  const [dbReady, setDbReady] = useState<boolean | null>(null)
  const [llmReady, setLlmReady] = useState<boolean | null>(null)

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
    void listSkills().then(data => {
      if (cancelled) return
      setLlmReady(data.categories.length > 0)
    }).catch(() => setLlmReady(false))
    return () => { cancelled = true }
  }, [])

  const handleRun = () => {
    if (!selectedId) return
    const custom = customStrategies.find(st => st.id === selectedId)
    if (custom) {
      void runCustomStrategy({ id: custom.id, name: custom.name, prompt: custom.prompt })
    } else {
      void runStrategy(selectedId)
    }
  }

  const progressPct = job?.percent ?? 0
  const barValue = running && progressPct <= 0 ? 0.03 : Math.min(1, progressPct / 100)
  const doneHistory = history.filter(h => h.status === 'done' && h.result)

  return (
    <div className={mergeClasses(s.root, 'inno-discover-tab')}>
      <div className={s.head}>
        <Text className={s.headHint} block>
          选择策略并执行；自编策略请在设置 → 选股策略中管理。
        </Text>
        <div className={s.strategyShell}>
          <DiscoverStrategyPicker
            strategies={strategyOptions}
            selectedId={selectedId}
            onSelect={setSelectedId}
            disabled={running}
            placeholder="选择策略"
          />
        </div>
        {doneHistory.length > 0 && (
          <div className={s.historyRow}>
            <HistoryRegular fontSize={12} color={innoTokens.textTertiary} />
            {doneHistory.slice(0, 6).map(h => (
              <button
                key={h.id}
                type="button"
                className={mergeClasses(s.historyChip, job?.id === h.id && s.historyChipActive)}
                title={h.strategy_name}
                onClick={() => loadHistoryJob(h)}
              >
                {formatHistoryLabel(h.strategy_name, h.updated_at, h.status)}
              </button>
            ))}
          </div>
        )}
        <div className={s.runRow}>
          <InnoButton
            className={s.runBtn}
            variant="primary"
            disabled={running || !selectedId}
            onClick={handleRun}
          >
            {running ? '挖掘中…' : '开始挖掘'}
          </InnoButton>
          {running && (
            <InnoButton className={s.runBtn} variant="secondary" onClick={() => { void cancelRun() }}>
              取消
            </InnoButton>
          )}
          {running && <Spinner size="tiny" />}
          <Text className={s.runHint}>
            {dbReady ? '本地初选 → Agent 精选' : '初选库未就绪时将在线扫描'}
            {llmReady === false ? ' · 需配置 LLM' : ''}
          </Text>
        </div>
      </div>

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

      <div className={mergeClasses(s.list, 'inno-scroll')}>
        {!result && !running && !error && (
          <Text className={s.empty}>
            选择策略并点击「执行策略」；任务在后台运行，切换标签不会中断。
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
          <Text className={s.empty}>暂无符合该策略的标的，可换一条策略重试</Text>
        )}
      </div>
    </div>
  )
}
