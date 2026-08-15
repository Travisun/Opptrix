import { Spinner, Text, makeStyles } from '@fluentui/react-components'
import { opptrixCssVars } from '../theme/tokens'
import {
  shouldShowBackgroundJob,
  type SessionBackgroundJob,
} from './jobWatchProgress'

const useStyles = makeStyles({
  /** 嵌入 composer 顶部：与「接下来」同带、位于其之上 */
  root: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    width: '100%',
    boxSizing: 'border-box',
    margin: '0 0 2px',
    padding: '0 2px 8px',
    borderBottom: `1px solid ${opptrixCssVars.separator}`,
    minHeight: '1.35em',
  },
  /** Fluent extra-tiny 仍高于 font-sm；用 1em 贴合文案行高 */
  spinner: {
    flexShrink: 0,
    display: 'inline-flex',
    alignItems: 'center',
    fontSize: 'var(--opptrix-font-sm)',
    width: '1em',
    height: '1em',
    '& .fui-Spinner__spinner': {
      width: '1em',
      height: '1em',
      color: opptrixCssVars.textTertiary,
    },
  },
  label: {
    fontSize: 'var(--opptrix-font-sm)',
    fontWeight: 600,
    lineHeight: 1.35,
    color: opptrixCssVars.textTertiary,
    letterSpacing: '0.02em',
  },
})

interface Props {
  jobs: SessionBackgroundJob[]
}

export default function ComposerBackgroundJobsBar({ jobs }: Props) {
  const s = useStyles()
  const count = jobs.filter(shouldShowBackgroundJob).length
  if (count === 0) return null

  const label = `${count} 个任务进行中`

  return (
    <div
      className={s.root}
      role="status"
      aria-live="polite"
      aria-label={label}
      data-composer-section="background-jobs"
    >
      <Spinner size="extra-tiny" className={s.spinner} />
      <Text className={s.label}>{label}</Text>
    </div>
  )
}
