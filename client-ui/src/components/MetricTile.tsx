import StatCard from './StatCard'

interface Props {
  label: string
  value: string | number
  unit?: string
  change?: number
  tooltip?: string
  color?: string
  max?: number
}

export default function MetricTile({ label, value, unit, change, tooltip, color }: Props) {
  const display = change != null
    ? `${value}${change >= 0 ? ' ↑' : ' ↓'}`
    : String(value)
  return (
    <StatCard
      label={label}
      value={display}
      unit={unit}
      tooltip={tooltip}
      color={color}
    />
  )
}
