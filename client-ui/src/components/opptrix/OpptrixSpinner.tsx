/**
 * 协作 / 状态行统一 Spinner — 避免各处覆写 `.fui-Spinner__spinner`。
 */
import { Spinner, mergeClasses } from '@fluentui/react-components'
import { makeStyles } from '@fluentui/react-components'
import { opptrixCssVars } from '../../theme/tokens'

export type OpptrixSpinnerSize = 'inline' | 'status'

const useStyles = makeStyles({
  inline: {
    flexShrink: 0,
    display: 'inline-flex',
    alignItems: 'center',
    fontSize: '0.85em',
    width: '0.85em',
    height: '0.85em',
    color: 'currentColor',
  },
  status: {
    flexShrink: 0,
    display: 'inline-flex',
    alignItems: 'center',
    fontSize: 'var(--opptrix-font-sm)',
    width: '1em',
    height: '1em',
    color: opptrixCssVars.textTertiary,
  },
})

interface Props {
  size?: OpptrixSpinnerSize
  className?: string
  /** 占位对齐（无旋转动画） */
  placeholder?: boolean
}

export default function OpptrixSpinner({
  size = 'status',
  className,
  placeholder = false,
}: Props) {
  const s = useStyles()
  const rootClass = mergeClasses(size === 'inline' ? s.inline : s.status, className)

  if (placeholder) {
    return <span className={rootClass} aria-hidden />
  }

  return <Spinner size="extra-tiny" className={rootClass} />
}
