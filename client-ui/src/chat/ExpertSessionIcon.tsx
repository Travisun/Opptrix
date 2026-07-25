import { makeStyles, mergeClasses } from '@fluentui/react-components'
import { PersonStarRegular } from '@fluentui/react-icons'

const useStyles = makeStyles({
  root: {
    flexShrink: 0,
    width: '16px',
    height: '16px',
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--opptrix-accent, #6366f1)',
  },
  md: {
    width: '20px',
    height: '20px',
  },
})

interface Props {
  className?: string
  size?: 'sm' | 'md'
}

/** 专家会话侧栏前缀 — 固定 Fluent 图标，忽略 emoji 快照 */
export default function ExpertSessionIcon({ className, size = 'sm' }: Props) {
  const s = useStyles()
  const iconSize = size === 'md' ? 16 : 14
  return (
    <span
      className={mergeClasses(s.root, size === 'md' && s.md, className)}
      aria-hidden
    >
      <PersonStarRegular fontSize={iconSize} />
    </span>
  )
}
