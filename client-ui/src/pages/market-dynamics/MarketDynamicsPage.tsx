import { useEffect, useState } from 'react'
import { Spinner, makeStyles, mergeClasses } from '@fluentui/react-components'
import { opptrixCssVars } from '../../theme/tokens'
import { formatCnDateTime } from '../../utils/cnTime'
import MarketDynamicsHeader from './MarketDynamicsHeader'
import CnMarketDynamicsView from './CnMarketDynamicsView'
import UsMarketDynamicsView from './UsMarketDynamicsView'
import { useMarketDynamics, useMarketInsights } from './useMarketDynamics'
import {
  readMarketDynamicsTab,
  writeMarketDynamicsTab,
  type MarketDynamicsTab,
} from './marketDynamicsStorage'

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
}

function MarketDynamicsContent({ electronChrome = false, chromeToolbarReserve = 0 }: Props) {
  const s = useStyles()
  const [marketTab, setMarketTab] = useState<MarketDynamicsTab>(() => readMarketDynamicsTab())
  const { data, loading, refreshing, error, refreshedAt, refresh } = useMarketDynamics(marketTab)
  const insights = useMarketInsights(marketTab)

  useEffect(() => {
    writeMarketDynamicsTab(marketTab)
  }, [marketTab])

  const updatedLabel = refreshedAt ? formatCnDateTime(refreshedAt) : null
  const statusLabel = refreshing
    ? '刷新中…'
    : updatedLabel
      ? `更新 ${updatedLabel}`
      : '尚未刷新'

  const hasData = Boolean(data?.sections.length || data?.us_indices?.length)

  const handleRefresh = () => {
    void refresh()
    void insights.refresh()
  }

  return (
    <div className={mergeClasses(s.root, electronChrome && s.rootElectron, 'opptrix-market-dynamics')}>
      <MarketDynamicsHeader
        marketTab={marketTab}
        onMarketTabChange={setMarketTab}
        statusLabel={statusLabel}
        refreshing={refreshing}
        onRefresh={handleRefresh}
        electronChrome={electronChrome}
        chromeToolbarReserve={chromeToolbarReserve}
      />

      {loading && !hasData ? (
        <div className={s.loadingWrap}>
          <Spinner size="medium" label={marketTab === 'us' ? '正在获取美股数据…' : '正在获取 A 股市场数据…'} />
        </div>
      ) : (
        <>
          {error && <div className={s.errorBanner}>{error}</div>}
          <div className={s.content}>
            {marketTab === 'cn' ? (
              <CnMarketDynamicsView
                data={data}
                loading={loading}
                articles={insights.articles}
                insightsLoading={insights.loading}
              />
            ) : (
              <UsMarketDynamicsView
                data={data}
                loading={loading}
                articles={insights.articles}
                insightsLoading={insights.loading}
              />
            )}
          </div>
        </>
      )}
    </div>
  )
}

export default function MarketDynamicsPage(props: Props) {
  return <MarketDynamicsContent {...props} />
}
