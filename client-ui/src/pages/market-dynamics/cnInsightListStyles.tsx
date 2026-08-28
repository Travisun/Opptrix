import type { ReactNode } from 'react'
import { makeStyles, mergeClasses } from '@fluentui/react-components'
import { formatChangeAmt, formatPct, formatPrice, pctTone } from '../../market/format'
import { MARKET_DOWN, MARKET_UP } from '../../market/chartTheme'
import { opptrixCssVars } from '../../theme/tokens'
import { ghostInteractive } from '../../theme/mixins'
import { useCnInsightStockSelect } from './cnInsightStockContext'
import { insightStockCodeKey } from './cnInsightStockUtils'

export const CN_INSIGHT_LIST_PAD = '10px 12px 12px'

export const useCnInsightListStyles = makeStyles({
  listPad: {
    padding: CN_INSIGHT_LIST_PAD,
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    minHeight: 0,
  },
  listPadFill: {
    flex: 1,
    minHeight: 0,
    overflowY: 'auto',
  },
  groupLabel: {
    padding: '8px 8px 4px',
    fontSize: '10px',
    fontWeight: 700,
    letterSpacing: '0.06em',
    textTransform: 'uppercase',
    color: opptrixCssVars.textTertiary,
    ':first-of-type': { paddingTop: '2px' },
  },
  row: {
    ...ghostInteractive,
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) repeat(3, auto)',
    gap: '4px 8px',
    alignItems: 'center',
    padding: '8px 8px',
    borderRadius: '8px',
    minHeight: '40px',
    boxSizing: 'border-box',
    width: '100%',
    border: 'none',
    background: 'transparent',
    textAlign: 'left',
    fontFamily: 'inherit',
    appearance: 'none',
    transitionProperty: 'background-color, box-shadow',
    transitionDuration: '150ms',
    transitionTimingFunction: 'ease',
    ':hover': { backgroundColor: opptrixCssVars.surfaceMuted },
    ':focus': { outline: 'none' },
    ':focus-visible': { outline: 'none' },
    ':active': { backgroundColor: opptrixCssVars.accentSoft },
  },
  rowInteractive: {
    cursor: 'pointer',
  },
  rowActive: {
    backgroundColor: opptrixCssVars.accentSoft,
    ':hover': { backgroundColor: opptrixCssVars.accentSoft },
    ':active': { backgroundColor: opptrixCssVars.accentSoft },
  },
  rowWithBadge: {
    gridTemplateColumns: 'minmax(0, 1fr) auto repeat(3, auto)',
  },
  rowWithTrailing: {
    gridTemplateColumns: 'minmax(0, 1fr) auto',
  },
  rowBody: {
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    justifyContent: 'center',
    alignSelf: 'center',
  },
  rowTitle: {
    fontSize: 'var(--opptrix-font-sm)',
    fontWeight: 600,
    color: opptrixCssVars.textPrimary,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    lineHeight: 1.3,
  },
  rowMeta: {
    fontSize: '10px',
    fontWeight: 500,
    color: opptrixCssVars.textTertiary,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    lineHeight: 1.3,
  },
  rowBadge: {
    flexShrink: 0,
    fontSize: '10px',
    fontWeight: 650,
    color: opptrixCssVars.textSecondary,
    backgroundColor: opptrixCssVars.accentSoft,
    borderRadius: '999px',
    padding: '2px 7px',
    whiteSpace: 'nowrap',
    lineHeight: 1.25,
    alignSelf: 'center',
    justifySelf: 'end',
  },
  metricCell: {
    justifySelf: 'end',
    alignSelf: 'center',
    fontVariantNumeric: 'tabular-nums',
    textAlign: 'right',
    whiteSpace: 'nowrap',
    lineHeight: 1.25,
  },
  metricPrice: {
    minWidth: '4.25rem',
    fontSize: 'var(--opptrix-font-sm)',
    fontWeight: 650,
    color: opptrixCssVars.textPrimary,
  },
  metricAmt: {
    minWidth: '3.25rem',
    fontSize: '11px',
    fontWeight: 600,
  },
  metricPct: {
    minWidth: '3.5rem',
    fontSize: 'var(--opptrix-font-sm)',
    fontWeight: 650,
  },
  rowTrailing: {
    justifySelf: 'end',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: '10px',
    minWidth: 0,
    flexShrink: 0,
  },
  rowPct: {
    fontSize: 'var(--opptrix-font-sm)',
    fontWeight: 650,
    fontVariantNumeric: 'tabular-nums',
    textAlign: 'right',
    minWidth: '3.5rem',
    whiteSpace: 'nowrap',
  },
  pctUp: { color: MARKET_UP },
  pctDown: { color: MARKET_DOWN },
  pctFlat: { color: opptrixCssVars.textSecondary },
  empty: {
    padding: '28px 12px',
    textAlign: 'center',
    color: opptrixCssVars.textTertiary,
    fontSize: 'var(--opptrix-font-sm)',
    lineHeight: 1.55,
  },
})

export function insightPctClass(
  s: ReturnType<typeof useCnInsightListStyles>,
  value: number | null | undefined,
): string {
  const tone = pctTone(value)
  if (tone === 'up') return s.pctUp
  if (tone === 'down') return s.pctDown
  return s.pctFlat
}

type StockRowProps = {
  code?: string
  name: string
  meta?: string
  price?: number | null
  changePct?: number | null
  changeAmt?: number | null
  badge?: ReactNode
  trailing?: ReactNode
  className?: string
  showPrice?: boolean
  onClick?: () => void
  active?: boolean
}

export function CnInsightStockRow({
  code,
  name,
  meta,
  price,
  changePct,
  changeAmt,
  badge,
  trailing,
  className,
  showPrice = true,
  onClick,
  active = false,
}: StockRowProps) {
  const s = useCnInsightListStyles()
  const selectCtx = useCnInsightStockSelect()
  const hasTrailing = trailing != null
  const showBadge = badge != null && !hasTrailing
  const showPriceCol = showPrice && !hasTrailing
  const toneValue = changePct ?? changeAmt
  const rowCode = code ?? meta?.split(' · ')[0]?.trim() ?? ''
  const interactive = Boolean(onClick ?? (selectCtx && rowCode))
  const isActive = active || (interactive && rowCode
    ? selectCtx?.selectedCode === insightStockCodeKey(rowCode)
    : false)

  const handleClick = () => {
    if (onClick) {
      onClick()
      return
    }
    if (selectCtx && rowCode) {
      selectCtx.onPick({ code: rowCode, name })
    }
  }

  const rowClass = mergeClasses(
    s.row,
    hasTrailing && s.rowWithTrailing,
    showBadge && s.rowWithBadge,
    interactive && s.rowInteractive,
    isActive && s.rowActive,
    className,
  )

  const metricTone = insightPctClass(s, toneValue)

  const inner = (
    <>
      <div className={s.rowBody}>
        <span className={s.rowTitle} title={name}>{name}</span>
        {meta ? <span className={s.rowMeta} title={meta}>{meta}</span> : null}
      </div>
      {showBadge ? <span className={s.rowBadge}>{badge}</span> : null}
      {showPriceCol ? (
        <>
          <span className={mergeClasses(s.metricCell, s.metricPrice)}>
            {price != null ? formatPrice(price, 2) : '—'}
          </span>
          <span className={mergeClasses(s.metricCell, s.metricAmt, metricTone)}>
            {changeAmt != null ? formatChangeAmt(changeAmt) : '—'}
          </span>
          <span className={mergeClasses(s.metricCell, s.metricPct, metricTone)}>
            {formatPct(changePct ?? null, 2)}
          </span>
        </>
      ) : null}
      {hasTrailing ? (
        <div className={s.rowTrailing}>{trailing}</div>
      ) : null}
    </>
  )

  if (interactive) {
    return (
      <button type="button" className={rowClass} onClick={handleClick}>
        {inner}
      </button>
    )
  }

  return (
    <div className={rowClass}>
      {inner}
    </div>
  )
}

type ListProps = {
  children: ReactNode
  className?: string
  fill?: boolean
}

export function CnInsightListPad({ children, className, fill = false }: ListProps) {
  const s = useCnInsightListStyles()
  return (
    <div className={mergeClasses(s.listPad, fill && s.listPadFill, className, fill && 'opptrix-scroll-hidden')}>
      {children}
    </div>
  )
}

export function CnInsightGroupLabel({ children }: { children: ReactNode }) {
  const s = useCnInsightListStyles()
  return <div className={s.groupLabel}>{children}</div>
}
