import { makeStyles, Text } from '@fluentui/react-components'
import { innoTokens } from '../theme/tokens'
import { motion } from '../theme/mixins'

const useStyles = makeStyles({
  root: {
    padding: '10px 12px',
    fontSize: '13px',
    lineHeight: 1.45,
    borderRadius: innoTokens.radiusMd,
    border: 'none',
    animationName: {
      from: { opacity: 0, transform: 'translateY(-4px)' },
      to: { opacity: 1, transform: 'translateY(0)' },
    },
    animationDuration: motion.normal,
    animationTimingFunction: motion.easeOut,
    animationFillMode: 'both',
  },
  error: {
    backgroundColor: innoTokens.errorSoft,
    color: innoTokens.error,
  },
  info: {
    backgroundColor: innoTokens.infoSoft,
    color: innoTokens.textSecondary,
  },
  success: {
    backgroundColor: innoTokens.successSoft,
    color: innoTokens.success,
  },
  warning: {
    backgroundColor: innoTokens.warningSoft,
    color: innoTokens.warning,
  },
})

interface Props {
  message: string
  tone?: 'error' | 'info' | 'success' | 'warning'
}

export default function StatusBanner({ message, tone = 'info' }: Props) {
  const s = useStyles()
  const toneClass = tone === 'error' ? s.error
    : tone === 'success' ? s.success
      : tone === 'warning' ? s.warning : s.info
  return (
    <Text className={`${s.root} ${toneClass}`} role="status">
      {message}
    </Text>
  )
}
