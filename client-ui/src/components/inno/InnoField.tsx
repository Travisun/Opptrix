import { makeStyles, Text } from '@fluentui/react-components'
import type { ReactNode } from 'react'
import { innoTokens } from '../../theme/tokens'
import { inputSurface } from '../../theme/mixins'

const useStyles = makeStyles({
  rootStack: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    width: '100%',
  },
  label: {
    fontSize: '13px',
    fontWeight: 500,
    color: innoTokens.textSecondary,
    lineHeight: 1.3,
  },
  control: {
    ...inputSurface,
    minHeight: '44px',
    padding: '0 12px',
    display: 'flex',
    alignItems: 'center',
    width: '100%',
  },
  hint: {
    fontSize: '12px',
    color: innoTokens.textTertiary,
    lineHeight: 1.4,
  },
})

interface InnoFieldProps {
  label: string
  hint?: string
  children: ReactNode
  className?: string
}

/** Native stacked label + filled control */
export default function InnoField({ label, hint, children, className }: InnoFieldProps) {
  const s = useStyles()
  return (
    <div className={`inno-field ${s.rootStack} ${className ?? ''}`}>
      <Text className={s.label}>{label}</Text>
      <div className={s.control}>{children}</div>
      {hint && <Text className={s.hint}>{hint}</Text>}
    </div>
  )
}
