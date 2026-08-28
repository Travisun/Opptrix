import { Skeleton, SkeletonItem, makeStyles, mergeClasses } from '@fluentui/react-components'
import { opptrixCssVars, opptrixTokens } from '../../theme/tokens'
import { CN_DASH } from './cnDashboardTokens'
import { CN_INSIGHT_LIST_PAD } from './cnInsightListStyles'

function skBar(w: string, h: string, radius: string = opptrixTokens.radiusSm) {
  return { width: w, height: h, borderRadius: radius }
}

const useIndexStripStyles = makeStyles({
  strip: {
    display: 'flex',
    gap: CN_DASH.cardGap,
    minWidth: 0,
    overflow: 'hidden',
  },
  card: {
    flex: '1 0 188px',
    minWidth: '188px',
    maxWidth: '240px',
    padding: '12px 14px',
    borderRadius: CN_DASH.cardRadius,
    border: CN_DASH.cardBorder,
    backgroundColor: opptrixCssVars.surface,
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  name: { ...skBar('58%', '12px') },
  code: { ...skBar('36%', '9px') },
  price: { ...skBar('72%', '22px', opptrixTokens.radiusMd) },
  spark: { ...skBar('100%', '28px', opptrixTokens.radiusMd) },
})

export function CnIndexStripSkeleton({ count = 8 }: { count?: number }) {
  const s = useIndexStripStyles()
  return (
    <div className={s.strip} aria-busy="true" aria-label="加载指数行情">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className={s.card} aria-hidden>
          <Skeleton><SkeletonItem className={s.name} /></Skeleton>
          <Skeleton><SkeletonItem className={s.code} /></Skeleton>
          <Skeleton><SkeletonItem className={s.price} /></Skeleton>
          <Skeleton><SkeletonItem className={s.spark} /></Skeleton>
        </div>
      ))}
    </div>
  )
}

const useKpiStyles = makeStyles({
  row: {
    display: 'flex',
    gap: '8px',
    minWidth: 0,
    overflow: 'hidden',
  },
  chip: {
    flex: '1 0 160px',
    minWidth: '160px',
    display: 'grid',
    gridTemplateColumns: 'auto minmax(0, 1fr)',
    gap: '10px',
    alignItems: 'center',
    padding: '10px 12px',
    borderRadius: '10px',
    border: CN_DASH.cardBorder,
    backgroundColor: opptrixCssVars.surface,
  },
  icon: { ...skBar('28px', '28px', '8px') },
  label: { ...skBar('48px', '9px') },
  value: { ...skBar('64px', '13px') },
  status: { ...skBar('88px', '9px') },
  body: { display: 'flex', flexDirection: 'column', gap: '6px', minWidth: 0 },
})

export function CnKpiRowSkeleton({ count = 6 }: { count?: number }) {
  const s = useKpiStyles()
  return (
    <div className={s.row} aria-busy="true" aria-label="加载市场指标">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className={s.chip} aria-hidden>
          <Skeleton><SkeletonItem className={s.icon} /></Skeleton>
          <div className={s.body}>
            <Skeleton><SkeletonItem className={s.label} /></Skeleton>
            <Skeleton><SkeletonItem className={s.value} /></Skeleton>
            <Skeleton><SkeletonItem className={s.status} /></Skeleton>
          </div>
        </div>
      ))}
    </div>
  )
}

const useListStyles = makeStyles({
  pad: {
    padding: CN_INSIGHT_LIST_PAD,
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    flex: 1,
    minHeight: 0,
  },
  row: {
    display: 'grid',
    gridTemplateColumns: 'minmax(0, 1fr) auto auto',
    gap: '6px 10px',
    alignItems: 'center',
    padding: '9px 8px',
    minHeight: '40px',
  },
  title: { ...skBar('46%', '12px') },
  meta: { ...skBar('32%', '9px') },
  price: { ...skBar('48px', '12px') },
  pct: { ...skBar('52px', '12px') },
  body: { display: 'flex', flexDirection: 'column', gap: '4px', minWidth: 0 },
})

export function CnInsightListSkeleton({
  rowCount = 8,
  fill = false,
}: {
  rowCount?: number
  fill?: boolean
}) {
  const s = useListStyles()
  return (
    <div
      className={mergeClasses(s.pad, fill && 'opptrix-scroll-hidden')}
      style={fill ? { overflowY: 'auto' } : undefined}
      aria-busy="true"
      aria-label="加载列表"
    >
      {Array.from({ length: rowCount }, (_, i) => (
        <div key={i} className={s.row} aria-hidden>
          <div className={s.body}>
            <Skeleton><SkeletonItem className={s.title} /></Skeleton>
            <Skeleton><SkeletonItem className={s.meta} /></Skeleton>
          </div>
          <Skeleton><SkeletonItem className={s.price} /></Skeleton>
          <Skeleton><SkeletonItem className={s.pct} /></Skeleton>
        </div>
      ))}
    </div>
  )
}

const useSectorGridStyles = makeStyles({
  grid: {
    flex: 1,
    minHeight: 0,
    display: 'grid',
    gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
    gridAutoRows: 'min-content',
    alignContent: 'start',
    gap: '8px',
    padding: '10px 12px 12px',
  },
  card: {
    padding: '10px 12px',
    borderRadius: '10px',
    border: CN_DASH.cardBorder,
    backgroundColor: opptrixCssVars.surface,
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    minHeight: '72px',
  },
  name: { ...skBar('70%', '12px') },
  tag: { ...skBar('28%', '9px') },
  price: { ...skBar('50%', '14px') },
  spark: { ...skBar('100%', '24px', opptrixTokens.radiusMd) },
})

export function CnSectorGridSkeleton({ count = 10 }: { count?: number }) {
  const s = useSectorGridStyles()
  return (
    <div className={s.grid} aria-busy="true" aria-label="加载板块">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className={s.card} aria-hidden>
          <Skeleton><SkeletonItem className={s.name} /></Skeleton>
          <Skeleton><SkeletonItem className={s.tag} /></Skeleton>
          <Skeleton><SkeletonItem className={s.price} /></Skeleton>
          <Skeleton><SkeletonItem className={s.spark} /></Skeleton>
        </div>
      ))}
    </div>
  )
}

const useNewsStyles = makeStyles({
  list: {
    display: 'flex',
    flexDirection: 'column',
    padding: CN_INSIGHT_LIST_PAD,
    gap: '4px',
    flex: 1,
    minHeight: 0,
  },
  row: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    padding: '10px 8px',
  },
  title: { ...skBar('92%', '12px') },
  title2: { ...skBar('68%', '12px') },
  meta: { ...skBar('42%', '9px') },
})

export function CnNewsListSkeleton({ rowCount = 6 }: { rowCount?: number }) {
  const s = useNewsStyles()
  return (
    <div className={s.list} aria-busy="true" aria-label="加载资讯">
      {Array.from({ length: rowCount }, (_, i) => (
        <div key={i} className={s.row} aria-hidden>
          <Skeleton><SkeletonItem className={s.title} /></Skeleton>
          <Skeleton><SkeletonItem className={s.title2} /></Skeleton>
          <Skeleton><SkeletonItem className={s.meta} /></Skeleton>
        </div>
      ))}
    </div>
  )
}

const useChartStyles = makeStyles({
  panel: {
    flex: 1,
    minHeight: 0,
    display: 'flex',
    flexDirection: 'row',
    backgroundColor: opptrixCssVars.surface,
    borderRadius: CN_DASH.cardRadius,
    border: 'none',
    overflow: 'hidden',
  },
  left: {
    width: '172px',
    flexShrink: 0,
    padding: '14px',
    borderRight: `1px solid ${opptrixCssVars.separatorHairline}`,
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  crumb: { ...skBar('80%', '9px') },
  title: { ...skBar('90%', '16px') },
  metric: { ...skBar('100%', '36px', opptrixTokens.radiusMd) },
  chart: {
    flex: 1,
    minWidth: 0,
    padding: '12px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  chartBar: { flex: 1, minHeight: '120px', borderRadius: opptrixTokens.radiusMd },
})

export function CnChartPanelSkeleton() {
  const s = useChartStyles()
  return (
    <section className={s.panel} aria-busy="true" aria-label="加载走势图">
      <div className={s.left} aria-hidden>
        <Skeleton><SkeletonItem className={s.crumb} /></Skeleton>
        <Skeleton><SkeletonItem className={s.title} /></Skeleton>
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i}><SkeletonItem className={s.metric} /></Skeleton>
        ))}
      </div>
      <div className={s.chart} aria-hidden>
        <Skeleton><SkeletonItem className={s.chartBar} /></Skeleton>
      </div>
    </section>
  )
}
