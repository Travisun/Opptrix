import { Text, makeStyles } from '@fluentui/react-components'
import { BookOpenRegular, NewsRegular } from '@fluentui/react-icons'
import { opptrixTokens } from '../../theme/tokens'

const useStyles = makeStyles({
  root: {
    flex: 1,
    minHeight: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '48px 24px',
    backgroundColor: opptrixTokens.canvas,
  },
  hint: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    fontSize: '12px',
    color: opptrixTokens.textTertiary,
    lineHeight: 1.5,
    textAlign: 'center',
    '& svg': {
      flexShrink: 0,
      fontSize: '14px',
    },
  },
})

type Props = {
  hasArticles: boolean
}

export default function NewsReaderEmpty({ hasArticles }: Props) {
  const s = useStyles()

  return (
    <div className={s.root}>
      <Text className={s.hint} block>
        {hasArticles ? (
          <>
            <BookOpenRegular />
            选择一篇文章开始阅读
          </>
        ) : (
          <>
            <NewsRegular />
            暂无资讯，请先在设置中添加订阅
          </>
        )}
      </Text>
    </div>
  )
}
