import { Skeleton, SkeletonItem, makeStyles, mergeClasses } from '@fluentui/react-components'
import { opptrixTokens } from '../theme/tokens'

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
    minHeight: 0,
    width: '100%',
    height: '100%',
    boxSizing: 'border-box',
    padding: '12px 10px 10px',
    gap: '8px',
    backgroundColor: 'transparent',
  },
  topBar: {
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    height: '28px',
    padding: '0 4px',
  },
  topTitle: {
    width: '96px',
    height: '12px',
    borderRadius: opptrixTokens.radiusSm,
  },
  topMeta: {
    width: '52px',
    height: '10px',
    borderRadius: opptrixTokens.radiusSm,
  },
  stack: {
    flex: 1,
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  main: {
    flex: 1,
    minHeight: '120px',
    borderRadius: opptrixTokens.radiusMd,
  },
  vol: {
    flexShrink: 0,
    height: '42px',
    borderRadius: opptrixTokens.radiusMd,
  },
  macd: {
    flexShrink: 0,
    height: '38px',
    borderRadius: opptrixTokens.radiusMd,
  },
  periodRow: {
    flexShrink: 0,
    display: 'flex',
    flexWrap: 'wrap',
    gap: '4px',
    paddingTop: '2px',
  },
  periodChip: {
    width: '36px',
    height: '22px',
    borderRadius: '6px',
  },
})

type Props = {
  className?: string
  /** 指数图：无量能 / MACD 占位 */
  indexChart?: boolean
}

/** 嵌入式走势图首次加载骨架（抽屉 / embed），对齐主图 + 副图布局 */
export default function ChartEmbedSkeleton({ className, indexChart = false }: Props) {
  const s = useStyles()
  return (
    <div
      className={mergeClasses(s.root, className)}
      role="status"
      aria-busy="true"
      aria-label="正在加载走势"
    >
      <div className={s.topBar} aria-hidden>
        <Skeleton><SkeletonItem className={s.topTitle} /></Skeleton>
        <Skeleton><SkeletonItem className={s.topMeta} /></Skeleton>
      </div>
      <div className={s.stack} aria-hidden>
        <Skeleton><SkeletonItem className={s.main} /></Skeleton>
        {!indexChart ? (
          <>
            <Skeleton><SkeletonItem className={s.vol} /></Skeleton>
            <Skeleton><SkeletonItem className={s.macd} /></Skeleton>
          </>
        ) : null}
      </div>
      <div className={s.periodRow} aria-hidden>
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i}><SkeletonItem className={s.periodChip} /></Skeleton>
        ))}
      </div>
    </div>
  )
}
