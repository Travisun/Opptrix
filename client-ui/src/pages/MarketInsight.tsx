import { useState, useEffect } from 'react'
import { TabList, Tab } from '@fluentui/react-components'
import PageShell from '../components/PageShell'
import MarketReport from './MarketReport'
import IndustryMining from './IndustryMining'
import { useApp } from '../context/AppContext'

type TabId = 'market' | 'industry'

interface Props {
  navigate: (route: import('../types/schemas').FeatureRoute) => void
  globalStock: { code: string; name: string } | null
  setGlobalStock: (s: { code: string; name: string } | null) => void
}

export default function MarketInsight(props: Props) {
  const [tab, setTab] = useState<TabId>('market')
  const { setPageContext } = useApp()

  useEffect(() => {
    setPageContext({
      route: 'market_insight',
      tab,
      title: tab === 'market' ? '市场日报' : '产业透视',
    })
  }, [tab, setPageContext])

  return (
    <PageShell kicker="MARKET" title="市场与产业" subtitle="宏观日报 · 产业链研究">
      <TabList selectedValue={tab} onTabSelect={(_, d) => setTab(d.value as TabId)} size="small">
        <Tab value="market">市场日报</Tab>
        <Tab value="industry">产业透视</Tab>
      </TabList>
      {tab === 'market' && <MarketReport {...props} />}
      {tab === 'industry' && <IndustryMining {...props} />}
    </PageShell>
  )
}
