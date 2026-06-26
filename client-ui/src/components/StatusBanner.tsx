import { makeStyles, tokens, Text } from '@fluentui/react-components'

const useStyles = makeStyles({
  root: {
    padding: `${tokens.spacingVerticalS} ${tokens.spacingHorizontalM}`,
    fontSize: tokens.fontSizeBase200,
  },
  error: {
    backgroundColor: 'rgba(244, 67, 54, 0.12)',
    color: '#ef9a9a',
  },
  info: {
    backgroundColor: tokens.colorNeutralBackground3,
    color: tokens.colorNeutralForeground3,
  },
  success: {
    backgroundColor: 'rgba(76, 175, 80, 0.12)',
    color: '#81c784',
  },
  warning: {
    backgroundColor: 'rgba(255, 152, 0, 0.12)',
    color: '#ffb74d',
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
    <Text className={`${s.root} ${toneClass}`}>
      {message}
    </Text>
  )
}
