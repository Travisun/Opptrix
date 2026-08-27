import { useMemo, useState } from 'react'
import { Spinner, Text, makeStyles, mergeClasses } from '@fluentui/react-components'
import type { MarketIndexQuote } from '../../types/schemas'
import { opptrixCssVars } from '../../theme/tokens'
import { focusVisibleRing, ghostInteractive, interactiveTransition } from '../../theme/mixins'
import { formatPct, pctTone } from '../../market/format'
import { MARKET_DOWN, MARKET_UP } from '../../market/chartTheme'
import { indexKey } from './marketBoardUtils'
import { sectorIndexCode } from './MarketSectorStrip'
import CnDashboardPanel from './CnDashboardPanel'

const TAG_TABS = [
  { id: 'all', label: '全部' },
  { id: 'cn_concept', label: '概念' },
  { id: 'industry', label: '行业' },
  { id: 'tszs', label: '特色' },
] as const

type TagFilter = typeof TAG_TABS[number]['id']

const MAX_BARS = 10

const useStyles = makeStyles({
  filterRow: {
    flexShrink: 0,
    display: 'flex',
    gap: '4px',
    padding: '0 2px 6px',
    overflowX: 'auto',
  },
  filterBtn: {
    ...ghostInteractive,
    ...interactiveTransition,
    border: 'none',
    padding: '3px 8px',
    borderRadius: '999px',
    fontSize: 'var(--opptrix-font-xs)',
    fontWeight: 600,
    color: opptrixCssVars.textSecondary,
    backgroundColor: 'transparent',
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    ':hover': { backgroundColor: opptrixCssVars.surfaceHover },
  },
  filterBtnActive: {
    color: opptrixCssVars.textPrimary,
    backgroundColor: opptrixCssVars.accentSoft,
  },
  scroll: {
    flex: 1,
    minHeight: 0,
    overflowY: 'auto',
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  barRow: {
    ...ghostInteractive,
    ...interactiveTransition,
    ...focusVisibleRing,
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 5.5em) minmax(0, 1fr) auto',
    gap: '8px',
    alignItems: 'center',
    padding: '5px 4px',
    borderRadius: '6px',
    border: 'none',
    background: 'transparent',
    cursor: 'pointer',
    textAlign: 'left',
    fontFamily: 'inherit',
    width: '100%',
  },
  barRowActive: {
    backgroundColor: opptrixCssVars.accentSoft,
  },
  barName: {
    fontSize: 'var(--opptrix-font-xs)',
    fontWeight: 600,
    color: opptrixCssVars.textPrimary,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  barTrack: {
    height: '6px',
    borderRadius: '999px',
    backgroundColor: opptrixCssVars.surfaceMuted,
    overflow: 'hidden',
    minWidth: 0,
  },
  barFill: {
    height: '100%',
    borderRadius: '999px',
    transition: 'width 200ms ease',
  },
  barFillUp: { backgroundColor: MARKET_UP },
  barFillDown: { backgroundColor: MARKET_DOWN },
  barFillFlat: { backgroundColor: opptrixCssVars.textTertiary },
  barPct: {
    fontSize: 'var(--opptrix-font-xs)',
    fontWeight: 650,
    fontVariantNumeric: 'tabular-nums',
    whiteSpace: 'nowrap',
    minWidth: '52px',
    textAlign: 'right',
  },
  pctUp: { color: MARKET_UP },
  pctDown: { color: MARKET_DOWN },
  pctFlat: { color: opptrixCssVars.textSecondary },
  empty: {
    padding: '16px 8px',
    textAlign: 'center',
    fontSize: 'var(--opptrix-font-sm)',
    color: opptrixCssVars.textTertiary,
    lineHeight: 1.5,
  },
})

type Props = {
  sectors: MarketIndexQuote[]
  selectedCode?: string | null
  loading?: boolean
  emptyHint?: string
  onSelect?: (item: MarketIndexQuote) => void
}

function pctClass(s: ReturnType<typeof useStyles>, value: number | null | undefined) {
  const tone = pctTone(value)
  if (tone === 'up') return s.pctUp
  if (tone === 'down') return s.pctDown
  return s.pctFlat
}

function barFillClass(s: ReturnType<typeof useStyles>, value: number | null | undefined) {
  const tone = pctTone(value)
  if (tone === 'up') return s.barFillUp
  if (tone === 'down') return s.barFillDown
  return s.barFillFlat
}

export default function CnSectorRankPanel({
  sectors,
  selectedCode,
  loading = false,
  emptyHint,
  onSelect,
}: Props) {
  const s = useStyles()
  const [tag, setTag] = useState<TagFilter>('all')

  const filtered = useMemo(() => {
    const list = tag === 'all'
      ? sectors
      : sectors.filter(row => row.sector_tag === tag)
    return [...list].sort((a, b) => {
      const av = a.change_pct
      const bv = b.change_pct
      if (av == null && bv == null) return a.name.localeCompare(b.name, 'zh-CN')
      if (av == null) return 1
      if (bv == null) return -1
      return bv - av
    }).slice(0, MAX_BARS)
  }, [sectors, tag])

  const maxAbs = useMemo(() => {
    let max = 0
    for (const row of filtered) {
      const v = row.change_pct
      if (v != null && Number.isFinite(v)) max = Math.max(max, Math.abs(v))
    }
    return max || 1
  }, [filtered])

  return (
    <CnDashboardPanel
      title="板块涨跌"
      subtitle="按涨跌幅排序 · 点击查看成份"
      fill
    >
      <div className={s.filterRow}>
        {TAG_TABS.map(tab => (
          <button
            key={tab.id}
            type="button"
            className={mergeClasses(s.filterBtn, tag === tab.id && s.filterBtnActive)}
            onClick={() => setTag(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className={mergeClasses(s.scroll, 'opptrix-scroll-hidden')}>
        {loading && !sectors.length ? (
          <div className={s.empty}><Spinner size="tiny" label="加载板块…" /></div>
        ) : !filtered.length ? (
          <Text className={s.empty} block>
            {emptyHint ?? '暂无板块数据'}
          </Text>
        ) : (
          filtered.map(item => {
            const code = sectorIndexCode(item)
            const active = selectedCode === code
            const pct = item.change_pct
            const width = pct != null ? (Math.abs(pct) / maxAbs) * 100 : 0

            return (
              <button
                key={indexKey(item)}
                type="button"
                className={mergeClasses(s.barRow, active && s.barRowActive)}
                onClick={() => onSelect?.(item)}
              >
                <span className={s.barName}>{item.name}</span>
                <span className={s.barTrack}>
                  <span
                    className={mergeClasses(s.barFill, barFillClass(s, pct))}
                    style={{ width: `${Math.max(width, pct != null ? 4 : 0)}%` }}
                  />
                </span>
                <span className={mergeClasses(s.barPct, pctClass(s, pct))}>
                  {formatPct(pct, 2)}
                </span>
              </button>
            )
          })
        )}
      </div>
    </CnDashboardPanel>
  )
}
