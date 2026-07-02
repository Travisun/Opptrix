import { Text, makeStyles } from '@fluentui/react-components'
import { BookOpenRegular, NewsRegular } from '@fluentui/react-icons'
import { opptrixTokens, opptrixCssVars } from '../../theme/tokens'

const useStyles = makeStyles({
  root: {
    flex: 1,
    minHeight: 0,
    height: '100%',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '32px 24px',
    backgroundColor: opptrixCssVars.canvas,
    boxSizing: 'border-box',
  },
  content: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    textAlign: 'center',
    gap: '10px',
    maxWidth: '320px',
    margin: '0 auto',
  },
  iconWrap: {
    width: '48px',
    height: '48px',
    borderRadius: opptrixTokens.radiusLg,
    backgroundColor: opptrixCssVars.canvasAlt,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: opptrixCssVars.textSecondary,
    flexShrink: 0,
    marginBottom: '2px',
    '& svg': {
      fontSize: '24px',
    },
  },
  title: {
    fontSize: '15px',
    fontWeight: 600,
    color: opptrixCssVars.textPrimary,
    lineHeight: 1.45,
    letterSpacing: '-0.01em',
  },
  hint: {
    fontSize: '13px',
    color: opptrixCssVars.textSecondary,
    lineHeight: 1.55,
  },
})

type Props = {
  hasArticles: boolean
}

export default function NewsReaderEmpty({ hasArticles }: Props) {
  const s = useStyles()

  if (hasArticles) {
    return (
      <div className={s.root} role="status">
        <div className={s.content}>
          <div className={s.iconWrap} aria-hidden>
            <BookOpenRegular />
          </div>
          <Text className={s.title} block>看看今天发生了什么</Text>
          <Text className={s.hint} block>
            在左侧列表点选标题，正文会显示在这里
          </Text>
        </div>
      </div>
    )
  }

  return (
    <div className={s.root} role="status">
      <div className={s.content}>
        <div className={s.iconWrap} aria-hidden>
          <NewsRegular />
        </div>
        <Text className={s.title} block>还没有可读的资讯</Text>
        <Text className={s.hint} block>
          前往「订阅设置」添加 RSS 源，刷新后即可在这里浏览
        </Text>
      </div>
    </div>
  )
}
