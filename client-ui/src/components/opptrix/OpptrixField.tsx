import { makeStyles, Text, mergeClasses } from '@fluentui/react-components'
import type { ReactNode } from 'react'
import { opptrixTokens, opptrixCssVars } from '../../theme/tokens'
import { inputShellInteractive } from '../../theme/mixins'

const useStyles = makeStyles({
  rootStack: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    width: '100%',
  },
  label: {
    fontSize: 'var(--opptrix-font-lg)',
    fontWeight: 600,
    letterSpacing: '-0.02em',
    color: opptrixCssVars.textPrimary,
    lineHeight: 1.3,
  },
  control: {...inputShellInteractive,
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
    fontSize: 'var(--opptrix-font-base)',
    color: opptrixCssVars.textTertiary,
    lineHeight: 1.5,
    marginTop: '-2px',
  },
})

interface OpptrixFieldProps {
  label?: string
  hint?: string
  children: ReactNode
  className?: string
  /** 多行文本域：放宽 shell 高度与内边距 */
  multiline?: boolean
}

/** Stacked label + filled control surface */
export default function OpptrixField({ label, hint, children, className, multiline = false }: OpptrixFieldProps) {
  const s = useStyles()
  return (
    <div className={mergeClasses('opptrix-field', s.rootStack, className)}>
      {label ? <Text className={s.label} block>{label}</Text> : null}
      <div className={mergeClasses(s.control, multiline && s.controlMultiline, 'opptrix-input-shell')}>{children}</div>
      {hint ? <Text className={s.hint} block>{hint}</Text> : null}
    </div>
  )
}
