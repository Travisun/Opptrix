import { useState, useEffect } from 'react'
import { TabList, Tab } from '@fluentui/react-components'
import PageShell from '../components/PageShell'
import Screening from './Screening'
import Portfolio from './Portfolio'
import { useApp } from '../context/AppContext'

type TabId = 'screening' | 'portfolio'

interface Props {
  navigate: (route: import('../types/schemas').FeatureRoute) => void
  globalStock: { code: string; name: string } | null
  setGlobalStock: (s: { code: string; name: string } | null) => void
}

export default function PortfolioHub(props: Props) {
  const [tab, setTab] = useState<TabId>('screening')
  const { setPageContext } = useApp()

  useEffect(() => {
    setPageContext({
      route: 'portfolio_hub',
      tab,
      title: tab === 'screening' ? '智能选股' : '组合与账本',
    })
  }, [tab, setPageContext])

  return (
    <PageShell kicker="PORTFOLIO" title="机会与组合" subtitle="筛选标的 · 分析持仓 · 记录交易">
      <TabList selectedValue={tab} onTabSelect={(_, d) => setTab(d.value as TabId)} size="small">
        <Tab value="screening">智能选股</Tab>
        <Tab value="portfolio">组合 · 账本</Tab>
      </TabList>
      {tab === 'screening' && <Screening navigate={props.navigate} setGlobalStock={props.setGlobalStock} />}
      {tab === 'portfolio' && <Portfolio />}
    </PageShell>
  )
}
