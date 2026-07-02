import { makeStyles, Text } from '@fluentui/react-components'
import { opptrixTokens, opptrixCssVars } from '../theme/tokens'
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
    backgroundColor: opptrixCssVars.errorSoft,
    color: opptrixCssVars.error,
  },
  info: {
    backgroundColor: opptrixCssVars.infoSoft,
    color: opptrixCssVars.textSecondary,
  },
  success: {
    backgroundColor: opptrixCssVars.successSoft,
    color: opptrixCssVars.success,
  },
  warning: {
    backgroundColor: opptrixCssVars.warningSoft,
    color: opptrixCssVars.warning,
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
