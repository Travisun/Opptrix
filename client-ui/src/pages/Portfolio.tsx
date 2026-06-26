import { useState, useEffect } from 'react'
import {
  Text, Button, Input, TabList, Tab, Spinner, Badge,
} from '@fluentui/react-components'
import { AddRegular, ArrowSyncRegular } from '@fluentui/react-icons'
import MetricTile from '../components/MetricTile'
import SectionCard from '../components/SectionCard'
import { research, portfolioTrade } from '../api/client'
import type {
  PortfolioAnalysisData, PortfolioLedgerData, PortfolioSummaryData,
} from '../types/schemas'

interface Holding { code: string; name: string; weight: number }

export default function Portfolio() {
  const [tab, setTab] = useState('analysis')
  const [holdings, setHoldings] = useState<Holding[]>([
    { code: '600519', name: '贵州茅台', weight: 0.5 },
    { code: '000858', name: '五粮液', weight: 0.3 },
  ])
  const [data, setData] = useState<PortfolioAnalysisData | null>(null)
  const [newCode, setNewCode] = useState('')

  const [ledger, setLedger] = useState<PortfolioLedgerData | null>(null)
  const [summary, setSummary] = useState<PortfolioSummaryData | null>(null)
  const [ledgerLoading, setLedgerLoading] = useState(false)
  const [tradeForm, setTradeForm] = useState({
    code: '', shares: '', price: '', side: 'buy' as 'buy' | 'sell', date: '',
  })

  const addHolding = () => {
    if (!newCode.trim()) return
    setHoldings([...holdings, { code: newCode.trim(), name: '', weight: 0 }])
    setNewCode('')
  }

  const updateWeight = (i: number, w: number) => {
    const next = [...holdings]
    next[i] = { ...next[i], weight: w }
    setHoldings(next)
  }

  const removeHolding = (i: number) => setHoldings(holdings.filter((_, j) => j !== i))

  const analyze = async () => {
    const mapped = holdings.map(h => [h.code, h.weight] as [string, number])
    try {
      const resp = await research.portfolioAnalysis(mapped)
      if (resp.success) setData(resp.data)
    } catch (e) { console.error(e) }
  }

  const loadLedger = async () => {
    setLedgerLoading(true)
    try {
      const [tr, sm] = await Promise.all([
        research.portfolioTrades(),
        research.portfolioSummary(),
      ])
      if (tr.success) setLedger(tr.data)
      if (sm.success) setSummary(sm.data)
    } catch (e) { console.error(e) }
    setLedgerLoading(false)
  }

  useEffect(() => {
    if (tab === 'ledger') loadLedger()
  }, [tab])

  const submitTrade = async () => {
    const { code, shares, price, side, date } = tradeForm
    if (!code || !shares || !price) return
    try {
      await portfolioTrade({
        code, shares: Number(shares), price: Number(price), side, date: date || undefined,
      })
      setTradeForm({ code: '', shares: '', price: '', side: 'buy', date: '' })
      await loadLedger()
    } catch (e) { console.error(e) }
  }

  return (
    <>
      <Text size={400} weight="bold">组合管理</Text>
      <TabList selectedValue={tab} onTabSelect={(_, d) => setTab(d.value as string)}>
        <Tab value="analysis">因子分析</Tab>
        <Tab value="ledger">交易账本</Tab>
      </TabList>

      {tab === 'analysis' && (
        <>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {holdings.map((h, i) => (
              <div key={i} style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '4px 8px',
                backgroundColor: 'var(--colorNeutralBackground2)',
              }}>
                <Text style={{ width: 80 }}>{h.code}</Text>
                <Input size="small" value={h.name} placeholder="名称" style={{ width: 120 }}
                  onChange={(_, d) => {
                    const n = [...holdings]; n[i] = { ...n[i], name: d.value || '' }; setHoldings(n)
                  }} />
                <span style={{ fontSize: 11, color: '#888' }}>权重:</span>
                <Input size="small" type="number" value={String(h.weight * 100)}
                  style={{ width: 60 }}
                  onChange={(_, d) => updateWeight(i, parseFloat(d.value || '0') / 100)} />
                <span style={{ fontSize: 11, color: '#888' }}>%</span>
                <Button size="small" onClick={() => removeHolding(i)}
                  disabled={holdings.length <= 1} appearance="subtle">×</Button>
              </div>
            ))}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <Input size="small" placeholder="添加股票代码" value={newCode}
                onChange={(_, d) => setNewCode(d.value || '')}
                onKeyDown={(e) => { if (e.key === 'Enter') addHolding() }}
                style={{ width: 140 }} />
              <Button size="small" icon={<AddRegular />} onClick={addHolding} appearance="subtle">添加</Button>
              <Button size="small" appearance="primary" onClick={analyze}>分析组合</Button>
            </div>
          </div>

          {data && (
            <>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                <MetricTile label="加权评分" value={data.weighted_score.toFixed(1)} max={10}
                  color={data.weighted_score >= 7 ? '#4caf50' : '#ff9800'} />
                <MetricTile label="集中度" value={data.herfindahl.toFixed(3)}
                  tooltip={data.concentration_label} />
                <MetricTile label="持仓数" value={data.num_stocks} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                <div style={{ backgroundColor: 'var(--colorNeutralBackground2)', padding: 8 }}>
                  <Text size={200} weight="bold">行业分布</Text>
                  {Object.entries(data.industry_exposure).map(([ind, w]) => (
                    <div key={ind} style={{ fontSize: 11, padding: '2px 0' }}>
                      {ind}: {(w * 100).toFixed(0)}%
                    </div>
                  ))}
                </div>
                <div style={{ backgroundColor: 'var(--colorNeutralBackground2)', padding: 8 }}>
                  <Text size={200} weight="bold">因子暴露</Text>
                  {data.factor_exposures.map(fe => (
                    <div key={fe.factor} style={{ fontSize: 11, padding: '2px 0' }}>
                      {fe.factor}: {fe.active?.toFixed(2) ?? '-'}
                    </div>
                  ))}
                </div>
              </div>
            </>
          )}
        </>
      )}

      {tab === 'ledger' && (
        <>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <Button size="small" icon={<ArrowSyncRegular />} onClick={loadLedger} disabled={ledgerLoading}>
              刷新
            </Button>
            {ledgerLoading && <Spinner size="tiny" />}
          </div>

          {summary && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <MetricTile label="总市值" value={summary.totalMarketValue.toFixed(0)} />
              <MetricTile label="总盈亏" value={summary.totalPnl.toFixed(0)}
                color={summary.totalPnl >= 0 ? '#4caf50' : '#f44336'} />
              <MetricTile label="收益率" value={`${summary.totalPnlPct.toFixed(1)}%`}
                color={summary.totalPnlPct >= 0 ? '#4caf50' : '#f44336'} />
              <MetricTile label="持仓" value={summary.holdingsCount} />
              <MetricTile label="交易笔数" value={summary.tradesCount} />
            </div>
          )}

          {summary?.holdings.length ? (
            <SectionCard title="当前持仓">
              {summary.holdings.map(h => (
                <div key={h.code} style={{ display: 'flex', gap: 12, fontSize: 11, padding: '3px 0' }}>
                  <Text style={{ width: 80 }}>{h.code}</Text>
                  <Text style={{ width: 80 }}>{h.name}</Text>
                  <Text>{h.shares} 股</Text>
                  <Text>成本 {h.costBasis.toFixed(2)}</Text>
                  <Text>现价 {h.currentPrice.toFixed(2)}</Text>
                  <Badge color={h.unrealizedPnl >= 0 ? 'success' : 'danger'}>
                    {h.unrealizedPnl >= 0 ? '+' : ''}{h.unrealizedPnl.toFixed(0)}
                    ({h.unrealizedPnlPct.toFixed(1)}%)
                  </Badge>
                </div>
              ))}
            </SectionCard>
          ) : null}

          <SectionCard title="录入交易">
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <Input size="small" placeholder="代码" value={tradeForm.code} style={{ width: 90 }}
                onChange={(_, d) => setTradeForm({ ...tradeForm, code: d.value })} />
              <Input size="small" placeholder="股数" value={tradeForm.shares} style={{ width: 80 }}
                onChange={(_, d) => setTradeForm({ ...tradeForm, shares: d.value })} />
              <Input size="small" placeholder="价格" value={tradeForm.price} style={{ width: 80 }}
                onChange={(_, d) => setTradeForm({ ...tradeForm, price: d.value })} />
              <Button size="small"
                appearance={tradeForm.side === 'buy' ? 'primary' : 'secondary'}
                onClick={() => setTradeForm({ ...tradeForm, side: 'buy' })}>买入</Button>
              <Button size="small"
                appearance={tradeForm.side === 'sell' ? 'primary' : 'secondary'}
                onClick={() => setTradeForm({ ...tradeForm, side: 'sell' })}>卖出</Button>
              <Input size="small" placeholder="日期(可选)" value={tradeForm.date} style={{ width: 110 }}
                onChange={(_, d) => setTradeForm({ ...tradeForm, date: d.value })} />
              <Button size="small" appearance="primary" onClick={submitTrade}>提交</Button>
            </div>
          </SectionCard>

          {ledger && (
            <SectionCard title={`交易记录 (${ledger.count})`}>
              {ledger.trades.length === 0 ? (
                <Text size={200} style={{ color: '#888' }}>暂无交易记录</Text>
              ) : ledger.trades.slice(0, 50).map(t => (
                <div key={t.id} style={{ display: 'flex', gap: 10, fontSize: 11, padding: '2px 0' }}>
                  <Text style={{ width: 80 }}>{t.tradeDate}</Text>
                  <Badge color={t.tradeSide === 'buy' ? 'success' : 'danger'} size="small">
                    {t.tradeSide === 'buy' ? '买' : '卖'}
                  </Badge>
                  <Text style={{ width: 70 }}>{t.code}</Text>
                  <Text>{t.shares}股 @{t.price}</Text>
                  <Text style={{ color: '#888' }}>费 {t.totalFee.toFixed(2)}</Text>
                </div>
              ))}
            </SectionCard>
          )}
        </>
      )}
    </>
  )
}
