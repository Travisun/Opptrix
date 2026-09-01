import { makeStyles, mergeClasses } from '@fluentui/react-components'
import { opptrixCssVars } from '../../theme/tokens'
import { formatCnDateTime } from '../../utils/cnTime'
import MarketDynamicsHeader from './MarketDynamicsHeader'
import CnMarketDynamicsView from './CnMarketDynamicsView'
import { useMarketDynamics, useMarketInsights } from './useMarketDynamics'

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
  rootElectron: {
    backgroundColor: 'transparent',
  },
  errorBanner: {
    flexShrink: 0,
    margin: '6px 10px 0',
    padding: '6px 10px',
    borderRadius: '8px',
    backgroundColor: opptrixCssVars.errorSoft,
    color: opptrixCssVars.error,
    fontSize: 'var(--opptrix-font-md)',
    lineHeight: 1.45,
  },
  content: {
    flex: 1,
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
})

type Props = {
  electronChrome?: boolean
  chromeToolbarReserve?: number
  isMobile?: boolean
  sidebarDrawerOpen?: boolean
  onOpenSidebar?: () => void
}

function MarketDynamicsContent({
  electronChrome = false,
  chromeToolbarReserve = 0,
  isMobile = false,
  sidebarDrawerOpen = false,
  onOpenSidebar,
}: Props) {
  const s = useStyles()
  const { data, loading, refreshing, error, refresh } = useMarketDynamics()
  const insights = useMarketInsights()

  const panelData = data?.market === 'cn' ? data : null
  const panelLoading = loading || (data != null && data.market !== 'cn')

  const updatedLabel = panelData?.refreshed_at ? formatCnDateTime(panelData.refreshed_at) : null
  const statusLabel = refreshing
    ? '刷新中…'
    : updatedLabel
      ? `更新 ${updatedLabel}`
      : '尚未刷新'

  const hasData = Boolean(panelData?.sections.length)

  const handleRefresh = () => {
    void refresh()
    void insights.refresh()
  }

  return (
    <div className={mergeClasses(s.root, electronChrome && s.rootElectron, 'opptrix-market-dynamics')}>
      <MarketDynamicsHeader
        statusLabel={statusLabel}
        refreshing={refreshing}
        onRefresh={handleRefresh}
        electronChrome={electronChrome}
        chromeToolbarReserve={chromeToolbarReserve}
        isMobile={isMobile}
        sidebarDrawerOpen={sidebarDrawerOpen}
        onOpenSidebar={onOpenSidebar}
      />

      {error && <div className={s.errorBanner}>{error}</div>}
      <div className={s.content}>
        <CnMarketDynamicsView
          data={panelData}
          loading={panelLoading && !hasData}
          articles={insights.articles}
          insightsLoading={insights.loading}
        />
      </div>
    </div>
  )
}

export default function MarketDynamicsPage(props: Props) {
  return <MarketDynamicsContent {...props} />
}
