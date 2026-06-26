import { useState, useEffect } from 'react'
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
import { useApp } from '../context/AppContext'
import type { FeatureRoute } from '../types/schemas'

type TabId = 'diagnosis' | 'institution' | 'strategy' | 'backtest'

const tabs: { id: TabId; label: string }[] = [
  { id: 'diagnosis', label: '综合诊断' },
  { id: 'institution', label: '机构群评' },
  { id: 'strategy', label: '策略信号' },
  { id: 'backtest', label: '回测验证' },
]

const useStyles = makeStyles({
  tabs: { marginBottom: tokens.spacingVerticalS },
})

interface Props {
  navigate: (route: FeatureRoute) => void
  globalStock: { code: string; name: string } | null
  setGlobalStock: (s: { code: string; name: string } | null) => void
}

export default function StockResearch({ navigate, globalStock, setGlobalStock }: Props) {
  const [tab, setTab] = useState<TabId>('diagnosis')
  const { setPageContext } = useApp()
  const s = useStyles()
  const pageProps = { navigate, globalStock, setGlobalStock }

  useEffect(() => {
    setPageContext({ route: 'stock_research', tab, title: tabs.find(t => t.id === tab)?.label })
  }, [tab, setPageContext])

  return (
    <PageShell
      kicker="STOCK"
      title="个股研究"
      subtitle={globalStock ? `${globalStock.name} (${globalStock.code})` : '在顶栏搜索股票后开始分析'}
    >
      {!globalStock ? (
        <EmptyState message="在顶栏搜索框查找股票，开始个股研究" />
      ) : (
        <>
          <TabList className={s.tabs} selectedValue={tab} onTabSelect={(_, d) => setTab(d.value as TabId)} size="small">
            {tabs.map(t => <Tab key={t.id} value={t.id}>{t.label}</Tab>)}
          </TabList>
          {tab === 'diagnosis' && <Diagnosis {...pageProps} />}
          {tab === 'institution' && <InstitutionRating {...pageProps} />}
          {tab === 'strategy' && <StrategySignals {...pageProps} />}
          {tab === 'backtest' && <Backtest {...pageProps} />}
        </>
      )}
    </PageShell>
  )
}
