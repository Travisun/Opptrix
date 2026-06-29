import { makeStyles, Text, mergeClasses } from '@fluentui/react-components'
import type { ReactNode } from 'react'
import { innoTokens } from '../../theme/tokens'
import { inputShellInteractive } from '../../theme/mixins'

const useStyles = makeStyles({
  rootStack: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    width: '100%',
  },
  label: {
    fontSize: '14px',
    fontWeight: 600,
    letterSpacing: '-0.02em',
    color: innoTokens.textPrimary,
    lineHeight: 1.3,
  },
  control: {
    ...inputShellInteractive,
    minHeight: '44px',
    padding: '0 14px',
    display: 'flex',
    alignItems: 'center',
    width: '100%',
    boxSizing: 'border-box',
  },
  controlMultiline: {
    minHeight: 'unset',
    alignItems: 'stretch',
    padding: '8px 12px',
  },
  hint: {
    fontSize: '13px',
    color: innoTokens.textTertiary,
    lineHeight: 1.5,
    marginTop: '-2px',
  },
})

interface InnoFieldProps {
  label?: string
  hint?: string
  children: ReactNode
  className?: string
  /** 多行文本域：放宽 shell 高度与内边距 */
  multiline?: boolean
}

/** Stacked label + filled control surface */
export default function InnoField({ label, hint, children, className, multiline = false }: InnoFieldProps) {
  const s = useStyles()
  return (
    <div className={mergeClasses('inno-field', s.rootStack, className)}>
      {label ? <Text className={s.label} block>{label}</Text> : null}
      <div className={mergeClasses(s.control, multiline && s.controlMultiline, 'inno-input-shell')}>{children}</div>
      {hint ? <Text className={s.hint} block>{hint}</Text> : null}
    </div>
  )
}
