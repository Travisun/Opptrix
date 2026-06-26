import { useState, useEffect } from 'react'
import {
  makeStyles, tokens, Text, Button, SearchBox, Tooltip, Spinner,
} from '@fluentui/react-components'
import type { FeatureRoute, NavItem } from './types/schemas'
import { getHealth, research } from './api/client'

import Diagnosis from './pages/Diagnosis'
import Screening from './pages/Screening'
import InstitutionRating from './pages/InstitutionRating'
import StrategySignals from './pages/StrategySignals'
import Portfolio from './pages/Portfolio'
import MarketReport from './pages/MarketReport'
import IndustryMining from './pages/IndustryMining'
import Backtest from './pages/Backtest'
import StockWriter from './pages/StockWriter'
import Settings from './pages/Settings'

const useStyles = makeStyles({
  root: {
    display: 'grid',
    gridTemplateColumns: '180px 1fr',
    gridTemplateRows: '1fr 28px',
    height: '100vh',
    backgroundColor: tokens.colorNeutralBackground1,
  },
  sidebar: {
    gridRow: '1 / 2',
    backgroundColor: tokens.colorNeutralBackground3,
    padding: `${tokens.spacingVerticalM} 0`,
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
  },
  sidebarTitle: {
    padding: `0 ${tokens.spacingHorizontalM}`,
    marginBottom: tokens.spacingVerticalM,
    color: tokens.colorNeutralForeground1,
  },
  navButton: {
    justifyContent: 'flex-start',
    padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalM}`,
    borderRadius: 0,
    width: '100%',
    textAlign: 'left',
  },
  sidebarFooter: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    justifyContent: 'flex-end',
    padding: tokens.spacingHorizontalS,
    gap: tokens.spacingVerticalXS,
  },
  content: {
    gridRow: '1 / 2',
    overflow: 'auto',
    padding: tokens.spacingVerticalM,
    backgroundColor: tokens.colorNeutralBackground1,
  },
  statusBar: {
    gridColumn: '1 / 3',
    gridRow: '2 / 3',
    backgroundColor: tokens.colorNeutralBackground3,
    display: 'flex',
    alignItems: 'center',
    padding: `0 ${tokens.spacingHorizontalM}`,
    gap: tokens.spacingHorizontalL,
    fontSize: tokens.fontSizeBase200,
    color: tokens.colorNeutralForeground3,
  },
  statusOk: { color: '#4caf50' },
  statusWarn: { color: '#ff9800' },
  statusError: { color: '#f44336' },
  statusSpacer: { flex: 1 },
})

const navItems: NavItem[] = [
  { id: 'diagnosis', label: '个股诊断', icon: 'search' },
  { id: 'screening', label: '智能选股', icon: 'filter' },
  { id: 'institution_rating', label: '机构群评', icon: 'star' },
  { id: 'strategy_signals', label: '策略信号', icon: 'money' },
  { id: 'portfolio', label: '组合分析', icon: 'portfolio' },
  { id: 'market_report', label: '市场日报', icon: 'news' },
  { id: 'industry_mining', label: '产业透视', icon: 'map' },
  { id: 'backtest', label: '回测验证', icon: 'beaker' },
  { id: 'stock_writer', label: '投研写作', icon: 'edit' },
  { id: 'settings', label: '设置', icon: 'settings' },
]

const iconMap: Record<string, React.ReactNode> = {
  search: <svg width="16" height="16" viewBox="0 0 24 24"><path fill="currentColor" d="M9.5 2A7.5 7.5 0 0 1 17 9.5c0 1.86-.68 3.56-1.8 4.87l5.72 5.71-1.42 1.42-5.71-5.72A7.47 7.47 0 0 1 9.5 17 7.5 7.5 0 0 1 2 9.5 7.5 7.5 0 0 1 9.5 2m0 2A5.5 5.5 0 0 0 4 9.5a5.5 5.5 0 0 0 5.5 5.5 5.5 5.5 0 0 0 5.5-5.5A5.5 5.5 0 0 0 9.5 4"/></svg>,
  filter: <svg width="16" height="16" viewBox="0 0 24 24"><path fill="currentColor" d="M11 18h2c.55 0 .63.44.32.84l-1.32 1.73c-.16.22-.48.22-.64 0l-1.32-1.73c-.31-.4-.23-.84.32-.84m-6-7h14c.55 0 .63.44.32.84L17 14.92c-.17.21-.52.21-.69 0l-2.28-2.74c-.31-.4-.23-.84.32-.84M4 4h16c.55 0 .63.44.32.84L12 13.92l-8.32-9.08C3.37 4.44 3.45 4 4 4"/></svg>,
  star: <svg width="16" height="16" viewBox="0 0 24 24"><path fill="currentColor" d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>,
  money: <svg width="16" height="16" viewBox="0 0 24 24"><path fill="currentColor" d="M11.5 1L8 9h7l-3.5-8M12 11c-2.76 0-5 1.79-5 4s2.24 4 5 4 5-1.79 5-4-2.24-4-5-4m-7 3c-.55 0-1 .45-1 1v4c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2v-4c0-.55-.45-1-1-1"/></svg>,
  portfolio: <svg width="16" height="16" viewBox="0 0 24 24"><path fill="currentColor" d="M10 16v-1H3.01L3 19c0 1.11.89 2 2 2h14c1.11 0 2-.89 2-2v-4h-7v1h-4zm10-9h-4.01V5l-2-2h-4l-2 2v2H4c-1.1 0-2 .9-2 2v3c0 1.11.89 2 2 2h6v-2h4v2h6c1.1 0 2-.9 2-2V9c0-1.1-.9-2-2-2m-6 0h-4V5h4z"/></svg>,
  news: <svg width="16" height="16" viewBox="0 0 24 24"><path fill="currentColor" d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2m0 14H5.17L4 17.17V4h16z"/></svg>,
  map: <svg width="16" height="16" viewBox="0 0 24 24"><path fill="currentColor" d="M20.5 3l-.16.03L15 5.1 9 3 3.36 4.9c-.21.07-.36.25-.36.48V20.5c0 .28.22.5.5.5l.16-.03L9 18.9l6 2.1 5.64-1.9c.21-.07.36-.25.36-.48V3.5c0-.28-.22-.5-.5-.5M15 19l-6-2.11V5l6 2.11z"/></svg>,
  beaker: <svg width="16" height="16" viewBox="0 0 24 24"><path fill="currentColor" d="M22 3H2l8 9.5V21h4v-8.5L22 3m-7.5 7h-5l-2.2-2.5h9.4L14.5 10Z"/></svg>,
  edit: <svg width="16" height="16" viewBox="0 0 24 24"><path fill="currentColor" d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25M20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>,
  settings: <svg width="16" height="16" viewBox="0 0 24 24"><path fill="currentColor" d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.488.488 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 0 0-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.09-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.07.62-.07.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58M12 15.6A3.6 3.6 0 1 1 12 8.4a3.6 3.6 0 0 1 0 7.2"/></svg>,
}

export default function App() {
  const s = useStyles()
  const [activeRoute, setActiveRoute] = useState<FeatureRoute>('diagnosis')
  const [quickSearch, setQuickSearch] = useState('')
  const [searching, setSearching] = useState(false)
  const [globalStock, setGlobalStock] = useState<{ code: string; name: string } | null>(null)
  const [backendStatus, setBackendStatus] = useState<'loading' | 'ok' | 'offline'>('loading')
  const [llmLabel, setLlmLabel] = useState('检查中...')

  useEffect(() => {
    let cancelled = false
    const poll = async () => {
      try {
        const health = await getHealth()
        if (cancelled) return
        setBackendStatus('ok')
        setLlmLabel(health.llm_configured ? (health.model || 'LLM 已配置') : 'LLM 未配置')
      } catch {
        if (cancelled) return
        setBackendStatus('offline')
        setLlmLabel('后端未连接')
      }
    }
    poll()
    const timer = setInterval(poll, 15000)
    return () => { cancelled = true; clearInterval(timer) }
  }, [])

  const handleQuickSearch = async () => {
    const keyword = quickSearch.trim()
    if (!keyword) return
    setSearching(true)
    try {
      const resp = await research.searchStocks(keyword)
      if (resp.success && resp.data.results.length > 0) {
        const first = resp.data.results[0]
        setGlobalStock({ code: first.code, name: first.name })
        setActiveRoute('diagnosis')
      } else {
        setGlobalStock({ code: keyword, name: '' })
        setActiveRoute('diagnosis')
      }
    } catch {
      setGlobalStock({ code: keyword, name: '' })
      setActiveRoute('diagnosis')
    }
    setSearching(false)
  }

  const navigate = (route: FeatureRoute) => setActiveRoute(route)

  const pageProps = { navigate, globalStock, setGlobalStock }

  const renderPage = () => {
    switch (activeRoute) {
      case 'diagnosis': return <Diagnosis {...pageProps} />
      case 'screening': return <Screening {...pageProps} />
      case 'institution_rating': return <InstitutionRating {...pageProps} />
      case 'strategy_signals': return <StrategySignals {...pageProps} />
      case 'portfolio': return <Portfolio {...pageProps} />
      case 'market_report': return <MarketReport {...pageProps} />
      case 'industry_mining': return <IndustryMining {...pageProps} />
      case 'backtest': return <Backtest {...pageProps} />
      case 'stock_writer': return <StockWriter {...pageProps} />
      case 'settings': return <Settings {...pageProps} />
    }
  }

  return (
    <div className={s.root}>
      <nav className={s.sidebar}>
        <Text size={400} weight="bold" className={s.sidebarTitle}>
          innoAStock
        </Text>
        {navItems.map(item => (
          <Tooltip content={item.label} relationship="label" key={item.id}>
            <Button
              appearance={activeRoute === item.id ? 'primary' : 'subtle'}
              size="small"
              icon={iconMap[item.icon]}
              onClick={() => navigate(item.id)}
              className={s.navButton}
            >
              {item.label}
            </Button>
          </Tooltip>
        ))}
        <div className={s.sidebarFooter}>
          <SearchBox
            size="small"
            placeholder="快速查股票..."
            value={quickSearch}
            onChange={(_, d) => setQuickSearch(d.value || '')}
            onKeyDown={(e) => { if (e.key === 'Enter') handleQuickSearch() }}
          />
          {searching && <Spinner size="tiny" />}
        </div>
      </nav>

      <main className={s.content}>
        {renderPage()}
      </main>

      <div className={s.statusBar}>
        <span className={
          backendStatus === 'ok' ? s.statusOk
            : backendStatus === 'offline' ? s.statusError : s.statusWarn
        }>
          ● {backendStatus === 'ok' ? llmLabel : backendStatus === 'offline' ? 'API 未连接' : '连接中...'}
        </span>
        {globalStock && <span>股票: {globalStock.name || globalStock.code}</span>}
        <span className={s.statusSpacer} />
        <span>v0.6.0</span>
      </div>
    </div>
  )
}
