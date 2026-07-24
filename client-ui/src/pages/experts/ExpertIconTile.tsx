import { makeStyles, mergeClasses } from '@fluentui/react-components'
import { PersonSupportRegular } from '@fluentui/react-icons'

const TILE_COLORS = [
  '#6366f1',
  '#8b5cf6',
  '#ec4899',
  '#f97316',
  '#eab308',
  '#22c55e',
  '#14b8a6',
  '#0ea5e9',
  '#3b82f6',
  '#64748b',
]

export function expertTileColor(id: string): string {
  let hash = 0
  for (let i = 0; i < id.length; i += 1) {
    hash = (hash * 31 + id.charCodeAt(i)) | 0
  }
  return TILE_COLORS[Math.abs(hash) % TILE_COLORS.length]
}

const useStyles = makeStyles({
  tile: {
    flexShrink: 0,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: '10px',
    color: '#fff',
  },
  sm: {
    width: '32px',
    height: '32px',
  },
  md: {
    width: '44px',
    height: '44px',
    borderRadius: '12px',
  },
  lg: {
    width: '56px',
    height: '56px',
    borderRadius: '14px',
  },
})

interface Props {
  expertId: string
  size?: 'sm' | 'md' | 'lg'
  className?: string
}

export default function ExpertIconTile({ expertId, size = 'md', className }: Props) {
  const s = useStyles()
  const iconSize = size === 'lg' ? 28 : size === 'md' ? 22 : 16
  return (
    <span
      className={mergeClasses(s.tile, size === 'sm' && s.sm, size === 'md' && s.md, size === 'lg' && s.lg, className)}
      style={{ backgroundColor: expertTileColor(expertId) }}
      aria-hidden
    >
      <PersonSupportRegular fontSize={iconSize} />
    </span>
  )
}
