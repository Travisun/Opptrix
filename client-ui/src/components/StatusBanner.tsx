import { makeStyles, Text } from '@fluentui/react-components'
import { opptrixTokens } from '../theme/tokens'
import { motion } from '../theme/mixins'

const useStyles = makeStyles({
  root: {
    padding: '10px 12px',
    fontSize: '13px',
    lineHeight: 1.45,
    borderRadius: opptrixTokens.radiusMd,
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
    backgroundColor: opptrixTokens.errorSoft,
    color: opptrixTokens.error,
  },
  info: {
    backgroundColor: opptrixTokens.infoSoft,
    color: opptrixTokens.textSecondary,
  },
  success: {
    backgroundColor: opptrixTokens.successSoft,
    color: opptrixTokens.success,
  },
  warning: {
    backgroundColor: opptrixTokens.warningSoft,
    color: opptrixTokens.warning,
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
