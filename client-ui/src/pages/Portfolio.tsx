import { useState } from 'react'
import { Text, Button, Input, ProgressBar, Badge } from '@fluentui/react-components'
import { AddRegular, DismissRegular } from '@fluentui/react-icons'
import MetricTile from '../components/MetricTile'
import { research } from '../api/client'
import type { PortfolioAnalysisData } from '../types/schemas'

interface Holding { code: string; name: string; weight: number }

export default function Portfolio() {
  const [holdings, setHoldings] = useState<Holding[]>([
    { code: '600519', name: '贵州茅台', weight: 0.5 },
    { code: '000858', name: '五粮液', weight: 0.3 },
  ])
  const [data, setData] = useState<PortfolioAnalysisData | null>(null)
  const [newCode, setNewCode] = useState('')

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

  return (
    <>
      <Text size={400} weight="bold">组合分析</Text>

      {/* Holdings editor */}
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
            <Button size="small" icon={<DismissRegular />} onClick={() => removeHolding(i)}
              disabled={holdings.length <= 1} appearance="subtle" />
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
              tooltip={`${data.herfindahl < 0.1 ? '分散' : data.herfindahl < 0.3 ? '集中' : '高度集中'} (${data.concentration_label})`} />
            <MetricTile label="持仓数" value={data.num_stocks} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {/* Industry */}
            <div style={{ backgroundColor: 'var(--colorNeutralBackground2)', padding: '8px' }}>
              <Text size={200} weight="bold">行业分布</Text>
              {Object.entries(data.industry_exposure).map(([ind, w]) => (
                <div key={ind} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 0' }}>
                  <Text style={{ width: 80, fontSize: 11 }}>{ind}</Text>
                  <ProgressBar value={w} thickness="small" style={{ flex: 1 }} />
                  <Text style={{ width: 40, textAlign: 'right', fontSize: 11 }}>{(w * 100).toFixed(0)}%</Text>
                </div>
              ))}
            </div>

            {/* Factor exposures */}
            <div style={{ backgroundColor: 'var(--colorNeutralBackground2)', padding: '8px' }}>
              <Text size={200} weight="bold">因子暴露</Text>
              {data.factor_exposures.map(fe => (
                <div key={fe.factor} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 0' }}>
                  <Text style={{ width: 80, fontSize: 11 }}>{fe.factor}</Text>
                  <ProgressBar
                    value={fe.active != null ? Math.max(0, Math.min(1, (fe.active + 1) / 2)) : 0.5}
                    thickness="small" style={{ flex: 1 }}
                    color={fe.active != null && fe.active > 0 ? 'success' : 'danger'} />
                  <Text style={{ width: 40, textAlign: 'right', fontSize: 11 }}>
                    {fe.active != null ? fe.active.toFixed(2) : '-'}
                  </Text>
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </>
  )
}
