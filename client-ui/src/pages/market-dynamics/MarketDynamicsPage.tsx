import { useEffect, useMemo, useRef, useState } from 'react'
import { Spinner, Text, makeStyles, mergeClasses } from '@fluentui/react-components'
import { ArrowSyncRegular } from '@fluentui/react-icons'
import ChromeToolButton from '../../desktop/ChromeToolButton'
import OpptrixButton from '../../components/opptrix/OpptrixButton'
import { electronPlatform } from '../../platform/detect'
import { opptrixCssVars } from '../../theme/tokens'
import {
  DESKTOP_SIDEBAR_TOOL_ICON_PADDING,
  DESKTOP_SIDEBAR_TOOL_ICON_SIZE,
  DESKTOP_TITLEBAR_HEIGHT,
} from '../../desktop/constants'
import { useMarketDynamics } from './useMarketDynamics'
import { useMarketInsights } from './useMarketInsights'
import { useMarketDynamicsLayout } from './useMarketDynamicsLayout'
import MarketDynamicsDetail from './MarketDynamicsDetail'
import MarketDynamicsSidebar from './MarketDynamicsSidebar'
import MarketBoardStrip from './MarketBoardStrip'
import type { MarketIndexQuote } from '../../types/schemas'
import { formatCnDateTime } from '../../utils/cnTime'
import { computeMarketMood, chartCodeFromIndex, pickBoardStripIndices } from './marketBoardUtils'
import { writeCnIndexChartCode } from './cnIndexChartStorage'

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
    minWidth: 0,
    minHeight: 0,
    height: '100%',
    backgroundColor: opptrixCssVars.canvas,
    overflow: 'hidden',
  },
  electronTitleBar: {
    flexShrink: 0,
    height: `${DESKTOP_TITLEBAR_HEIGHT}px`,
    boxSizing: 'border-box',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    paddingLeft: '12px',
    borderBottom: `1px solid ${opptrixCssVars.separatorStrong}`,
    backgroundColor: opptrixCssVars.canvas,
  },
  electronTitleBarMac: { paddingRight: '12px' },
  electronTitleBarWin: { paddingRight: '132px' },
  titleBarSpacer: { flex: 1, minWidth: 0 },
  titleBarPageTitle: {
    fontSize: '13px',
    fontWeight: 500,
    color: opptrixCssVars.textPrimary,
    flexShrink: 0,
  },
  titleBarMeta: {
    fontSize: '11px',
    color: opptrixCssVars.textTertiary,
    flexShrink: 0,
  },
  titleBarActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    flexShrink: 0,
  },
  webHead: {
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '10px 16px',
    borderBottom: `1px solid ${opptrixCssVars.separatorStrong}`,
  },
  webTitle: {
    fontSize: '15px',
    fontWeight: 650,
    color: opptrixCssVars.textPrimary,
    flex: 1,
  },
  toolbarMeta: {
    fontSize: '11px',
    color: opptrixCssVars.textTertiary,
  },
  body: {
    flex: 1,
    minHeight: 0,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'row',
    overflow: 'hidden',
  },
  bodyStacked: {
    flexDirection: 'column',
  },
  sidebar: {
    flex: '0 0 32%',
    minWidth: '240px',
    maxWidth: '360px',
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  sidebarStacked: {
    flex: '0 0 auto',
    minWidth: 0,
    maxWidth: 'none',
    maxHeight: '38%',
    borderRight: 'none',
    borderBottom: `1px solid ${opptrixCssVars.separatorStrong}`,
  },
  briefInline: {
    flexShrink: 0,
    padding: '6px 12px 8px',
    borderBottom: `1px solid ${opptrixCssVars.separator}`,
    backgroundColor: opptrixCssVars.canvas,
  },
  briefInlineTitle: {
    fontSize: '11px',
    fontWeight: 600,
    color: opptrixCssVars.textPrimary,
    lineHeight: 1.4,
    marginBottom: '2px',
  },
  briefInlineText: {
    fontSize: '11px',
    color: opptrixCssVars.textSecondary,
    lineHeight: 1.45,
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
  },
  detail: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  },
  loadingWrap: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorBanner: {
    flexShrink: 0,
    margin: '6px 10px 0',
    padding: '6px 10px',
    borderRadius: '8px',
    backgroundColor: opptrixCssVars.errorSoft,
    color: opptrixCssVars.error,
    fontSize: '12px',
    lineHeight: 1.45,
  },
})

type Props = {
  electronChrome?: boolean
}

function MarketDynamicsContent({ electronChrome = false }: Props) {
  const s = useStyles()
  const bodyRef = useRef<HTMLDivElement>(null)
  const layout = useMarketDynamicsLayout(bodyRef)
  const { data, loading, refreshing, error, refreshedAt, refresh } = useMarketDynamics()
  const insights = useMarketInsights()

  const sections = useMemo(() => data?.sections ?? [], [data?.sections])
  const cnIndices = useMemo(
    () => sections.find(sec => sec.id === 'cn_major')?.items ?? [],
    [sections],
  )
  const hasData = sections.length > 0
  const mood = useMemo(() => computeMarketMood(sections), [sections])
  const stripIndices = useMemo(() => pickBoardStripIndices(sections), [sections])
  const [regionId, setRegionId] = useState('cn_major')
  const [chartCode, setChartCode] = useState<string | null>(null)

  const handleIndexSelect = (item: MarketIndexQuote) => {
    const code = chartCodeFromIndex(item, cnIndices)
    if (!code) return
    if (chartCode === code) {
      setChartCode(null)
      return
    }
    setChartCode(code)
    writeCnIndexChartCode(code)
  }

  const availableRegionIds = useMemo(
    () => sections.filter(sec => sec.items.length > 0).map(sec => sec.id),
    [sections],
  )

  useEffect(() => {
    if (availableRegionIds.length && !availableRegionIds.includes(regionId)) {
      setRegionId(availableRegionIds.includes('cn_major') ? 'cn_major' : availableRegionIds[0]!)
    }
  }, [availableRegionIds, regionId])

  const updatedLabel = refreshedAt ? formatCnDateTime(refreshedAt) : null

  const statusLabel = refreshing
    ? '刷新中…'
    : updatedLabel
      ? `更新 ${updatedLabel}`
      : '尚未刷新'

  const handleRefresh = () => {
    void refresh()
    void insights.refresh()
  }

  const electronWin = electronChrome && electronPlatform() !== 'darwin'

  const titleBar = electronChrome ? (
    <div
      className={mergeClasses(
        s.electronTitleBar,
        'opptrix-market-dynamics-title-bar',
        electronWin ? s.electronTitleBarWin : s.electronTitleBarMac,
      )}
    >
      <Text className={mergeClasses(s.titleBarPageTitle, 'opptrix-panel-title-no-drag')} block>
        市场动态
      </Text>
      <div className={mergeClasses(s.titleBarSpacer, 'opptrix-market-dynamics-title-drag')} aria-hidden />
      <Text className={mergeClasses(s.titleBarMeta, 'opptrix-panel-title-no-drag')}>{statusLabel}</Text>
      <div className={mergeClasses(s.titleBarActions, 'opptrix-panel-title-no-drag')}>
        <ChromeToolButton
          label="刷新"
          iconPadding={DESKTOP_SIDEBAR_TOOL_ICON_PADDING}
          disabled={refreshing}
          onClick={handleRefresh}
        >
          <ArrowSyncRegular fontSize={DESKTOP_SIDEBAR_TOOL_ICON_SIZE} />
        </ChromeToolButton>
      </div>
    </div>
  ) : null

  const webHead = !electronChrome ? (
    <div className={s.webHead}>
      <Text className={s.webTitle} block>市场动态</Text>
      {updatedLabel && <Text className={s.toolbarMeta}>{statusLabel}</Text>}
      <OpptrixButton
        variant="secondary"
        icon={<ArrowSyncRegular />}
        disabled={refreshing}
        onClick={handleRefresh}
      >
        刷新
      </OpptrixButton>
    </div>
  ) : null

  const stacked = layout === 'stacked'

  return (
    <div className={mergeClasses(s.root, 'opptrix-market-dynamics')}>
      {titleBar}
      {webHead}

      {loading && !hasData ? (
        <div className={s.loadingWrap}>
          <Spinner size="medium" label="正在获取全球市场数据…" />
        </div>
      ) : (
        <>
          {error && <div className={s.errorBanner}>{error}</div>}

          <MarketBoardStrip
            indices={stripIndices}
            cnIndices={cnIndices}
            mood={mood}
            onIndexSelect={handleIndexSelect}
            briefTitle={insights.report?.title}
            briefSummary={insights.report?.summary}
            stacked={stacked}
          />

          {stacked && insights.report?.summary && (
            <div className={s.briefInline}>
              {insights.report.title && (
                <Text className={s.briefInlineTitle} block>{insights.report.title}</Text>
              )}
              <Text className={s.briefInlineText} block>{insights.report.summary}</Text>
            </div>
          )}

          <div
            ref={bodyRef}
            className={mergeClasses(s.body, stacked && s.bodyStacked)}
          >
            <div className={mergeClasses(s.sidebar, stacked && s.sidebarStacked)}>
              <MarketDynamicsSidebar
                sections={sections}
                cnIndices={cnIndices}
                loading={loading}
                stacked={stacked}
                regionId={regionId}
                onRegionChange={setRegionId}
                selectedChartCode={chartCode}
                onIndexSelect={handleIndexSelect}
              />
            </div>

            <div className={s.detail}>
              <MarketDynamicsDetail
                cnIndices={cnIndices}
                chartCode={chartCode}
                onChartCodeChange={setChartCode}
                gainers={data?.cn_gainers ?? []}
                losers={data?.cn_losers ?? []}
                dragonTiger={data?.cn_dragon_tiger ?? []}
                dragonTigerDate={data?.cn_dragon_tiger_date}
                marketLoading={loading}
                report={insights.report}
                articles={insights.articles}
                insightsLoading={insights.loading}
                stacked={stacked}
              />
            </div>
          </div>
        </>
      )}
    </div>
  )
}

export default function MarketDynamicsPage(props: Props) {
  return <MarketDynamicsContent {...props} />
}
