import { makeStyles, tokens, Text, Tooltip } from '@fluentui/react-components'

const useStyles = makeStyles({
  tile: {
    display: 'flex',
    flexDirection: 'column',
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
    backgroundColor: tokens.colorNeutralBackground2,
    minWidth: '120px',
  },
  label: { fontSize: tokens.fontSizeBase200, color: tokens.colorNeutralForeground3 },
  valueRow: { display: 'flex', alignItems: 'baseline', gap: tokens.spacingHorizontalXS },
  value: { fontWeight: '600' },
  change: { fontSize: tokens.fontSizeBase200 },
  up: { color: '#4caf50' },
  down: { color: '#f44336' },
})

interface Props {
  label: string
  value: string | number
  unit?: string
  change?: number
  tooltip?: string
  color?: string
  max?: number
}

export default function MetricTile({ label, value, unit, change, tooltip, color, max }: Props) {
  const s = useStyles()
  const changeStr = change != null ? `${change >= 0 ? '+' : ''}${change.toFixed(1)}` : null
  const content = (
    <div className={s.tile}>
      <Text className={s.label}>{label}</Text>
      <div className={s.valueRow}>
        <Text className={s.value} size={500} style={{ color }}>
          {value}{unit && <Text style={{ fontSize: '11px', color: '#888' }}> {unit}</Text>}
        </Text>
        {changeStr && (
          <Text className={`${s.change} ${change >= 0 ? s.up : s.down}`}>
            {changeStr}
          </Text>
        )}
      </div>
    </div>
  )
  return tooltip ? <Tooltip content={tooltip} relationship="label">{content}</Tooltip> : content
}
