import { makeStyles, mergeClasses } from '@fluentui/react-components'
import { ArrowDownRegular, ArrowUpRegular, SubtractRegular } from '@fluentui/react-icons'
import { formatPct, pctTone } from '../../market/format'
import { MARKET_DOWN, MARKET_UP } from '../../market/chartTheme'
import { opptrixCssVars } from '../../theme/tokens'

const useStyles = makeStyles({
  pill: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '3px',
    padding: '2px 8px',
    borderRadius: '999px',
    fontSize: '11px',
    fontWeight: 650,
    fontVariantNumeric: 'tabular-nums',
    lineHeight: 1.2,
    whiteSpace: 'nowrap',
  },
  pillUp: {
    color: MARKET_UP,
    backgroundColor: `color-mix(in srgb, ${MARKET_UP} 10%, transparent)`,
  },
  pillDown: {
    color: MARKET_DOWN,
    backgroundColor: `color-mix(in srgb, ${MARKET_DOWN} 10%, transparent)`,
  },
  pillFlat: {
    color: opptrixCssVars.textSecondary,
    backgroundColor: opptrixCssVars.surfaceMuted,
  },
  pillGhost: {
    padding: 0,
    borderRadius: 0,
    backgroundColor: 'transparent',
  },
  icon: {
    display: 'inline-flex',
    lineHeight: 0,
  },
})

type Props = {
  changePct?: number | null
  changeAmt?: number | null
  /** 仅百分比，无 pill 背景 */
  ghost?: boolean
  className?: string
}

function formatChangeAmt(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return ''
  const sign = value > 0 ? '+' : ''
  return `${sign}${value.toFixed(2)}`
}

export default function CnChangePill({
  changePct,
  changeAmt,
  ghost = false,
  className,
}: Props) {
  const s = useStyles()
  const tone = pctTone(changePct)
  const toneClass = tone === 'up' ? s.pillUp : tone === 'down' ? s.pillDown : s.pillFlat
  const Icon = tone === 'up' ? ArrowUpRegular : tone === 'down' ? ArrowDownRegular : SubtractRegular
  const amt = formatChangeAmt(changeAmt)

  return (
    <span className={mergeClasses(s.pill, toneClass, ghost && s.pillGhost, className)}>
      <span className={s.icon}><Icon fontSize={10} /></span>
      <span>{formatPct(changePct, 2)}</span>
      {amt ? <span>{amt}</span> : null}
    </span>
  )
}
