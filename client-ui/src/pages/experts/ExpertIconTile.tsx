import { makeStyles, mergeClasses } from '@fluentui/react-components'
import { PersonRegular, PersonSupportRegular } from '@fluentui/react-icons'
import { opptrixCssVars } from '../../theme/tokens'

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
  wrap: {
    position: 'relative',
    flexShrink: 0,
    display: 'inline-flex',
  },
  tile: {
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
  personalBadge: {
    position: 'absolute',
    right: '-2px',
    bottom: '-2px',
    width: '16px',
    height: '16px',
    borderRadius: '9999px',
    backgroundColor: opptrixCssVars.surface,
    border: `1.5px solid ${opptrixCssVars.surface}`,
    color: opptrixCssVars.accent,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    boxShadow: '0 1px 2px rgba(26, 26, 26, 0.12)',
  },
  personalBadgeLg: {
    width: '18px',
    height: '18px',
    right: '-3px',
    bottom: '-3px',
  },
})

interface Props {
  expertId: string
  size?: 'sm' | 'md' | 'lg'
  /** 个人自建专家：右下角角标区分 */
  personal?: boolean
  className?: string
}

export default function ExpertIconTile({
  expertId,
  size = 'md',
  personal = false,
  className,
}: Props) {
  const s = useStyles()
  const iconSize = size === 'lg' ? 28 : size === 'md' ? 22 : 16
  const badgeIconSize = size === 'lg' ? 11 : 10
  return (
    <span className={mergeClasses(s.wrap, className)}>
      <span
        className={mergeClasses(
          s.tile,
          size === 'sm' && s.sm,
          size === 'md' && s.md,
          size === 'lg' && s.lg,
        )}
        style={{ backgroundColor: expertTileColor(expertId) }}
        aria-hidden
      >
        <PersonSupportRegular fontSize={iconSize} />
      </span>
      {personal && (
        <span
          className={mergeClasses(s.personalBadge, size === 'lg' && s.personalBadgeLg)}
          title="我创建的"
          aria-label="我创建的专家"
        >
          <PersonRegular fontSize={badgeIconSize} />
        </span>
      )}
    </span>
  )
}
