import { makeStyles, Text, Tooltip } from '@fluentui/react-components'
import { opptrixTokens, opptrixCssVars } from '../theme/tokens'

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    padding: `${opptrixTokens.radiusMd} 14px`,
    backgroundColor: opptrixCssVars.surface,
    borderRadius: opptrixTokens.radiusMd,
    border: `1px solid ${opptrixCssVars.separator}`,
    minWidth: '110px',
  },
  label: {
    fontSize: '12px',
    color: opptrixCssVars.textTertiary,
  },
  value: {
    fontSize: '24px',
    fontWeight: 600,
    color: opptrixCssVars.textPrimary,
    lineHeight: 1.2,
  },
  unit: {
    fontSize: '12px',
    fontWeight: 400,
    color: opptrixCssVars.textSecondary,
    marginLeft: '4px',
  },
})

interface Props {
  label: string
  value: string | number
  unit?: string
  tooltip?: string
  color?: string
}

export default function StatCard({ label, value, unit, tooltip, color }: Props) {
  const s = useStyles()
  const body = (
    <div className={s.root}>
      <Text className={s.label}>{label}</Text>
      <div>
        <span className={s.value} style={{ color }}>{value}</span>
        {unit && <span className={s.unit}>{unit}</span>}
      </div>
    </div>
  )
  return tooltip ? <Tooltip content={tooltip} relationship="label">{body}</Tooltip> : body
}
