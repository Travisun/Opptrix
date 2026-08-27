import { Text, makeStyles, mergeClasses } from '@fluentui/react-components'
import type { MarketIndexQuote } from '../../types/schemas'
import { opptrixCssVars } from '../../theme/tokens'
import { focusVisibleRing, interactiveTransition } from '../../theme/mixins'
import { formatPct, formatPrice, pctTone } from '../../market/format'
import { MARKET_DOWN, MARKET_UP } from '../../market/chartTheme'
import { indexKey } from './marketBoardUtils'

const SECTOR_TAG_LABEL: Record<string, string> = {
  cn_concept: '概念',
  industry: '行业',
  tszs: '特色',
}

const useStyles = makeStyles({
  root: {
    flexShrink: 0,
    display: 'flex',
    alignItems: 'stretch',
    minWidth: 0,
    borderBottom: `1px solid ${opptrixCssVars.separatorHairline}`,
    backgroundColor: opptrixCssVars.canvasAlt,
    overflowX: 'auto',
  },
  labelCell: {
    flex: '0 0 auto',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    gap: '1px',
    padding: '8px 10px',
    minWidth: '52px',
    borderRight: `1px solid ${opptrixCssVars.separator}`,
  },
  labelTitle: {
    fontSize: 'var(--opptrix-font-xs)',
    fontWeight: 650,
    color: opptrixCssVars.textSecondary,
    lineHeight: 1.2,
    whiteSpace: 'nowrap',
  },
  sectorCell: {
    flex: '1 0 108px',
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'center',
    gap: '1px',
    padding: '6px 10px',
    minWidth: '108px',
    margin: 0,
    border: 'none',
    borderRight: `1px solid ${opptrixCssVars.separator}`,
    borderRadius: 0,
    background: 'transparent',
    textAlign: 'left',
    cursor: 'pointer',
    fontFamily: 'inherit',
    fontSize: 'unset',
    fontWeight: 'normal',
    lineHeight: 'normal',
    letterSpacing: 'normal',
    appearance: 'none',
    WebkitAppearance: 'none',
    boxSizing: 'border-box',
    color: 'inherit',
    ...interactiveTransition,
    ...focusVisibleRing,
    ':hover': { backgroundColor: opptrixCssVars.accentSoft },
  },
  sectorCellActive: {
    backgroundColor: opptrixCssVars.accentSoft,
    boxShadow: `inset 0 -2px 0 ${opptrixCssVars.accent}`,
  },
  sectorName: {
    display: 'block',
    fontSize: 'var(--opptrix-font-xs)',
    fontWeight: 600,
    color: opptrixCssVars.textPrimary,
    lineHeight: 1.35,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  sectorMeta: {
    display: 'block',
    fontSize: '10px',
    fontWeight: 500,
    color: opptrixCssVars.textTertiary,
    lineHeight: 1.3,
  },
  sectorPrice: {
    display: 'block',
    fontSize: 'var(--opptrix-font-sm)',
    fontWeight: 650,
    fontVariantNumeric: 'tabular-nums',
    color: opptrixCssVars.textPrimary,
    lineHeight: 1.25,
  },
  sectorPct: {
    display: 'block',
    fontSize: 'var(--opptrix-font-xs)',
    fontWeight: 600,
    fontVariantNumeric: 'tabular-nums',
    lineHeight: 1.25,
  },
  pctUp: { color: MARKET_UP },
  pctDown: { color: MARKET_DOWN },
  pctFlat: { color: opptrixCssVars.textSecondary },
  empty: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    padding: '8px 12px',
    fontSize: 'var(--opptrix-font-xs)',
    color: opptrixCssVars.textTertiary,
  },
})

function pctClass(s: ReturnType<typeof useStyles>, value: number | null | undefined) {
  const tone = pctTone(value)
  if (tone === 'up') return s.pctUp
  if (tone === 'down') return s.pctDown
  return s.pctFlat
}

function sectorIndexCode(item: MarketIndexQuote): string {
  return item.index_thscode ?? item.code
}

type Props = {
  sectors: MarketIndexQuote[]
  selectedCode?: string | null
  loading?: boolean
  emptyHint?: string
  onSelect?: (item: MarketIndexQuote) => void
}

export default function MarketSectorStrip({
  sectors,
  selectedCode,
  loading = false,
  emptyHint,
  onSelect,
}: Props) {
  const s = useStyles()

  if (loading && !sectors.length) {
    return (
      <div className={mergeClasses(s.root, 'opptrix-market-sector-strip')}>
        <div className={s.labelCell}>
          <Text className={s.labelTitle} block>板块</Text>
        </div>
        <Text className={s.empty} block>正在加载板块指数…</Text>
      </div>
    )
  }

  if (!sectors.length) {
    return (
      <div className={mergeClasses(s.root, 'opptrix-market-sector-strip')}>
        <div className={s.labelCell}>
          <Text className={s.labelTitle} block>板块</Text>
        </div>
        <Text className={s.empty} block>
          {emptyHint ?? '板块指数暂不可用，请稍后刷新'}
        </Text>
      </div>
    )
  }

  return (
    <div className={mergeClasses(s.root, 'opptrix-market-sector-strip', 'opptrix-scroll-x')}>
      <div className={s.labelCell}>
        <Text className={s.labelTitle} block>板块</Text>
      </div>

      {sectors.map(item => {
        const key = indexKey(item)
        const code = sectorIndexCode(item)
        const active = selectedCode === code
        const tagLabel = item.sector_tag ? SECTOR_TAG_LABEL[item.sector_tag] ?? item.sector_tag : ''

        return (
          <button
            key={key}
            type="button"
            className={mergeClasses(s.sectorCell, active && s.sectorCellActive)}
            title="查看成份股"
            onClick={() => onSelect?.(item)}
          >
            <span className={s.sectorName}>{item.name}</span>
            {tagLabel ? <span className={s.sectorMeta}>{tagLabel}</span> : null}
            <span className={s.sectorPrice}>
              {item.price != null ? formatPrice(item.price, 2) : '—'}
            </span>
            <span className={mergeClasses(s.sectorPct, pctClass(s, item.change_pct))}>
              {formatPct(item.change_pct, 2)}
            </span>
          </button>
        )
      })}
    </div>
  )
}

export { sectorIndexCode }
