import { useMemo } from 'react'
import { Spinner, Text, makeStyles, mergeClasses } from '@fluentui/react-components'
import type { MarketIndexQuote } from '../../types/schemas'
import { opptrixCssVars } from '../../theme/tokens'
import { formatPriceWithCurrency, pctTone } from '../../market/format'
import { MARKET_DOWN, MARKET_UP } from '../../market/chartTheme'
import { indexKey } from './marketBoardUtils'
import { sectorIndexCode } from './MarketSectorStrip'
import CnChangePill from './CnChangePill'
import CnDashboardPanel from './CnDashboardPanel'
import CnMiniSparkline from './CnMiniSparkline'
import { CN_DASH } from './cnDashboardTokens'

const TAG_LABEL: Record<string, string> = {
  cn_concept: '概念',
  industry: '行业',
  tszs: '特色',
}

const useStyles = makeStyles({
  grid: {
    flex: 1,
    minHeight: 0,
    overflowY: 'auto',
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: '8px',
    padding: '2px 0 4px',
  },
  card: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    padding: '10px 12px',
    borderRadius: '10px',
    border: CN_DASH.cardBorder,
    backgroundColor: opptrixCssVars.canvas,
    cursor: 'pointer',
    textAlign: 'left',
    fontFamily: 'inherit',
    appearance: 'none',
    transitionProperty: 'background-color, box-shadow',
    transitionDuration: '150ms',
    ':hover': {
      backgroundColor: opptrixCssVars.accentSoft,
    },
    ':focus': { outline: 'none' },
    ':focus-visible': {
      outline: '2px solid var(--opptrix-accent)',
      outlineOffset: '1px',
    },
  },
  cardActive: {
    backgroundColor: opptrixCssVars.accentSoft,
    boxShadow: '0 0 0 1px var(--opptrix-accent)',
  },
  head: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: '6px',
    minWidth: 0,
  },
  name: {
    fontSize: 'var(--opptrix-font-xs)',
    fontWeight: 650,
    color: opptrixCssVars.textPrimary,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    minWidth: 0,
  },
  tag: {
    flexShrink: 0,
    fontSize: '9px',
    fontWeight: 650,
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
    padding: '2px 6px',
    borderRadius: '999px',
    color: opptrixCssVars.textTertiary,
    backgroundColor: opptrixCssVars.surfaceMuted,
  },
  price: {
    fontSize: 'var(--opptrix-font-md)',
    fontWeight: 700,
    fontVariantNumeric: 'tabular-nums',
    color: opptrixCssVars.textPrimary,
    lineHeight: 1.2,
  },
  foot: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '4px',
    minWidth: 0,
  },
  dot: {
    width: '6px',
    height: '6px',
    borderRadius: '999px',
    flexShrink: 0,
  },
  dotUp: { backgroundColor: MARKET_UP },
  dotDown: { backgroundColor: MARKET_DOWN },
  dotFlat: { backgroundColor: opptrixCssVars.textTertiary },
  empty: {
    gridColumn: '1 / -1',
    padding: '20px 8px',
    textAlign: 'center',
    fontSize: 'var(--opptrix-font-sm)',
    color: opptrixCssVars.textTertiary,
  },
})

type Props = {
  sectors: MarketIndexQuote[]
  selectedCode?: string | null
  loading?: boolean
  emptyHint?: string
  onSelect?: (item: MarketIndexQuote) => void
}

export default function CnSectorDiscoverGrid({
  sectors,
  selectedCode,
  loading = false,
  emptyHint,
  onSelect,
}: Props) {
  const s = useStyles()

  const items = useMemo(() => (
    [...sectors]
      .sort((a, b) => {
        const av = a.change_pct
        const bv = b.change_pct
        if (av == null && bv == null) return a.name.localeCompare(b.name, 'zh-CN')
        if (av == null) return 1
        if (bv == null) return -1
        return bv - av
      })
      .slice(0, 8)
  ), [sectors])

  return (
    <CnDashboardPanel
      title="板块发现"
      subtitle="涨幅前列 · 点击查看成份"
      fill
    >
      <div className={mergeClasses(s.grid, 'opptrix-scroll-hidden')}>
        {loading && !sectors.length ? (
          <div className={s.empty}><Spinner size="tiny" label="加载板块…" /></div>
        ) : !items.length ? (
          <Text className={s.empty} block>{emptyHint ?? '暂无板块数据'}</Text>
        ) : (
          items.map(item => {
            const code = sectorIndexCode(item)
            const active = selectedCode === code
            const tone = pctTone(item.change_pct)
            const dotClass = tone === 'up' ? s.dotUp : tone === 'down' ? s.dotDown : s.dotFlat
            const tag = item.sector_tag ? TAG_LABEL[item.sector_tag] ?? item.sector_tag : null

            return (
              <button
                key={indexKey(item)}
                type="button"
                className={mergeClasses(s.card, active && s.cardActive)}
                onClick={() => onSelect?.(item)}
              >
                <div className={s.head}>
                  <span className={s.name}>{item.name}</span>
                  {tag ? <span className={s.tag}>{tag}</span> : null}
                </div>
                <span className={s.price}>
                  {item.price != null
                    ? formatPriceWithCurrency(item.market ?? 'CN', item.price, 2)
                    : '—'}
                </span>
                <div className={s.foot}>
                  <CnChangePill
                    changePct={item.change_pct}
                    changeAmt={item.change_amt}
                    ghost
                  />
                  <span className={mergeClasses(s.dot, dotClass)} />
                  <CnMiniSparkline
                    seed={code}
                    changePct={item.change_pct}
                    width={56}
                    height={22}
                  />
                </div>
              </button>
            )
          })
        )}
      </div>
    </CnDashboardPanel>
  )
}
