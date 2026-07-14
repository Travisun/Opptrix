import { useEffect } from 'react'
import PageShell from '../components/PageShell'
import Portfolio from './Portfolio'
import { useApp } from '../context/AppContext'

export default function PortfolioHub() {
  const { setPageContext } = useApp()

  useEffect(() => {
    setPageContext({
      route: 'portfolio_hub',
      title: '组合与账本',
    })
  }, [setPageContext])

  return (
    <PageShell kicker="PORTFOLIO" title="机会与组合" subtitle="分析持仓 · 记录交易">
      <Portfolio />
    </PageShell>
  )
}
