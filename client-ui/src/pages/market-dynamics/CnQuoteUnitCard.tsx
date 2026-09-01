import type { ReactNode } from 'react'
import { makeStyles, mergeClasses } from '@fluentui/react-components'
import { opptrixCssVars } from '../../theme/tokens'
import { pctTone } from '../../market/format'
import { MARKET_DOWN, MARKET_UP } from '../../market/chartTheme'
import {
  formatIndexChangePoints,
  formatIndexPoints,
  resolveIndexChangeAmt,
} from './cnIndexFormat'
import CnChangePill from './CnChangePill'
import CnMiniSparkline from './CnMiniSparkline'
import { CN_DASH } from './cnDashboardTokens'

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    width: '100%',
    minWidth: 0,
  },
  headRow: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) auto auto',
    gap: '6px',
    alignItems: 'center',
    minWidth: 0,
  },
  headRowCompact: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: '4px',
  },
  headRowCompactMeta: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '6px',
    minWidth: 0,
  },
  name: {
    minWidth: 0,
    fontSize: CN_DASH.labelSize,
    fontWeight: 700,
    color: opptrixCssVars.textSecondary,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    lineHeight: 1.3,
  },
  midSlot: {
    flexShrink: 0,
    fontSize: '9px',
    fontWeight: 650,
    fontVariantNumeric: 'tabular-nums',
    letterSpacing: '0.02em',
    color: opptrixCssVars.textTertiary,
    whiteSpace: 'nowrap',
  },
  midTag: {
    padding: '1px 5px',
    borderRadius: '999px',
    backgroundColor: opptrixCssVars.surfaceMuted,
  },
  changeSlot: {
    flexShrink: 0,
    display: 'flex',
    justifyContent: 'flex-end',
  },
  valueRow: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) auto',
    gap: '8px',
    alignItems: 'baseline',
    minWidth: 0,
  },
  valueBlock: {
    display: 'flex',
    alignItems: 'baseline',
    gap: '3px',
    minWidth: 0,
  },
  point: {
    fontSize: '20px',
    fontWeight: 700,
    fontVariantNumeric: 'tabular-nums',
    color: opptrixCssVars.textPrimary,
    lineHeight: 1.05,
    letterSpacing: '-0.02em',
  },
  pointCompact: {
    fontSize: 'var(--opptrix-font-md)',
  },
  pointUnit: {
    fontSize: '10px',
    fontWeight: 600,
    color: opptrixCssVars.textTertiary,
    flexShrink: 0,
  },
  delta: {
    fontSize: '11px',
    fontWeight: 650,
    fontVariantNumeric: 'tabular-nums',
    whiteSpace: 'nowrap',
    textAlign: 'right',
  },
  deltaUp: { color: MARKET_UP },
  deltaDown: { color: MARKET_DOWN },
  deltaFlat: { color: opptrixCssVars.textSecondary },
  sparkRow: {
    width: '100%',
    minWidth: 0,
    minHeight: '28px',
  },
})

function deltaClass(
  s: ReturnType<typeof useStyles>,
  changePct: number | null | undefined,
): string {
  const tone = pctTone(changePct)
  if (tone === 'up') return s.deltaUp
  if (tone === 'down') return s.deltaDown
  return s.deltaFlat
}

export type CnQuoteUnitCardProps = {
  name: string
  midLabel?: string | null
  midAsTag?: boolean
  price?: number | null
  changePct?: number | null
  changeAmt?: number | null
  sparkSeed: string
  compact?: boolean
  /** 桌面窄卡：标题与标签分行，避免重叠 */
  compactHeadStack?: boolean
  className?: string
  changeSlot?: ReactNode
}

export default function CnQuoteUnitCard({
  name,
  midLabel,
  midAsTag = false,
  price,
  changePct,
  changeAmt,
  sparkSeed,
  compact = false,
  compactHeadStack = false,
  className,
  changeSlot,
}: CnQuoteUnitCardProps) {
  const s = useStyles()
  const delta = resolveIndexChangeAmt(price, changePct, changeAmt)
  const deltaText = formatIndexChangePoints(delta, 2) || '—'

  const stackCompactHead = compact && compactHeadStack

  return (
    <div className={mergeClasses(s.root, className)}>
      <div className={mergeClasses(s.headRow, stackCompactHead && s.headRowCompact)}>
        <span className={s.name}>{name}</span>
        {stackCompactHead ? (
          <div className={s.headRowCompactMeta}>
            {midLabel ? (
              <span className={mergeClasses(s.midSlot, midAsTag && s.midTag)}>{midLabel}</span>
            ) : (
              <span aria-hidden />
            )}
            <span className={s.changeSlot}>
              {changeSlot ?? (
                <CnChangePill changePct={changePct} ghost compact />
              )}
            </span>
          </div>
        ) : (
          <>
            {midLabel ? (
              <span className={mergeClasses(s.midSlot, midAsTag && s.midTag)}>{midLabel}</span>
            ) : null}
            <span className={s.changeSlot}>
              {changeSlot ?? (
                <CnChangePill changePct={changePct} ghost compact />
              )}
            </span>
          </>
        )}
      </div>

      <div className={s.valueRow}>
        <div className={s.valueBlock}>
          <span className={mergeClasses(s.point, compact && s.pointCompact)}>
            {formatIndexPoints(price, 2)}
          </span>
          <span className={s.pointUnit}>点</span>
        </div>
        <span className={mergeClasses(s.delta, deltaClass(s, changePct))}>
          {deltaText}
        </span>
      </div>

      <div className={s.sparkRow}>
        <CnMiniSparkline
          seed={sparkSeed}
          changePct={changePct}
          height={compact ? 24 : 28}
          fluid
        />
      </div>
    </div>
  )
}
