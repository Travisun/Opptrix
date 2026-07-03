import { useState, useEffect, useMemo } from 'react'
import {
  makeStyles, tokens,
} from '@fluentui/react-components'
import { TabList, Tab } from '@fluentui/react-components'
import PageShell from '../components/PageShell'
import EmptyState from '../components/EmptyState'
import Diagnosis from './Diagnosis'
import InstitutionRating from './InstitutionRating'
import StrategySignals from './StrategySignals'
import Backtest from './Backtest'
import { useApp, type StockContext } from '../context/AppContext'
import { hasApplicationCapability } from '../market/capabilities'
import { resolveStockContextInstrument } from '../market/instrument'
import type { FeatureRoute } from '../types/schemas'

type TabId = 'diagnosis' | 'institution' | 'strategy' | 'backtest'

const tabs: { id: TabId; label: string; capability: 'scorecard' | 'institution_rating' | 'strategy_signal' }[] = [
  { id: 'diagnosis', label: '综合诊断', capability: 'scorecard' },
  { id: 'institution', label: '机构群评', capability: 'institution_rating' },
  { id: 'strategy', label: '策略信号', capability: 'strategy_signal' },
  { id: 'backtest', label: '回测验证', capability: 'strategy_signal' },
]

const useStyles = makeStyles({
  tabs: { marginBottom: tokens.spacingVerticalS },
})

interface Props {
  navigate: (route: FeatureRoute) => void
  globalStock: StockContext | null
  setGlobalStock: (s: StockContext | null) => void
}

export default function StockResearch({ navigate, globalStock, setGlobalStock }: Props) {
  const [tab, setTab] = useState<TabId>('diagnosis')
  const { setPageContext } = useApp()
  const s = useStyles()
  const pageProps = { navigate, globalStock, setGlobalStock }

  const ref = useMemo(() => resolveStockContextInstrument(globalStock), [globalStock])
  const visibleTabs = useMemo(
    () => (ref
      ? tabs.filter(t => hasApplicationCapability(ref, t.capability))
      : tabs),
    [ref],
  )

  useEffect(() => {
    if (visibleTabs.length && !visibleTabs.some(t => t.id === tab)) {
      setTab(visibleTabs[0].id)
    }
  }, [visibleTabs, tab])

  useEffect(() => {
    setPageContext({ route: 'stock_research', tab, title: visibleTabs.find(t => t.id === tab)?.label ?? tabs.find(t => t.id === tab)?.label })
  }, [tab, setPageContext, visibleTabs])

  return (
    <PageShell
      kicker="STOCK"
      title="个股研究"
      subtitle={globalStock ? `${globalStock.name} (${globalStock.code})` : '在顶栏搜索股票后开始分析'}
    >
      {!globalStock ? (
        <EmptyState message="在顶栏搜索框查找股票，开始个股研究" />
      ) : visibleTabs.length === 0 ? (
        <EmptyState message="该市场暂不支持「个股研究」页的深度分析，请在右侧行情面板查看详情，或通过 AI 助手提问。" />
      ) : (
        <>
          <TabList className={s.tabs} selectedValue={tab} onTabSelect={(_, d) => setTab(d.value as TabId)} size="small">
            {visibleTabs.map(t => <Tab key={t.id} value={t.id}>{t.label}</Tab>)}
          </TabList>
          {tab === 'diagnosis' && visibleTabs.some(t => t.id === 'diagnosis') && <Diagnosis {...pageProps} />}
          {tab === 'institution' && visibleTabs.some(t => t.id === 'institution') && <InstitutionRating {...pageProps} />}
          {tab === 'strategy' && visibleTabs.some(t => t.id === 'strategy') && <StrategySignals {...pageProps} />}
          {tab === 'backtest' && visibleTabs.some(t => t.id === 'backtest') && <Backtest />}
        </>
      )}
    </PageShell>
  )
}
