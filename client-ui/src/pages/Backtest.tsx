import { useState } from 'react'
import { Text, Button, Spinner, Input, Badge, ProgressBar } from '@fluentui/react-components'
import { BeakerRegular } from '@fluentui/react-icons'
import MetricTile from '../components/MetricTile'
import { research } from '../api/client'
import type { BacktestResultData } from '../types/schemas'

export default function Backtest() {
  const [codes, setCodes] = useState('600519,000858')
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<BacktestResultData | null>(null)

  const run = async () => {
    const list = codes.split(',').map(c => c.trim()).filter(Boolean)
    if (list.length < 2) return
    setLoading(true)
    try {
      const resp = await research.backtest(list)
      if (resp.success) setData(resp.data)
    } catch (e) { console.error(e) }
    setLoading(false)
  }

  return (
    <>
      <Text size={400} weight="bold">回测验证</Text>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <Input size="small" placeholder="股票代码，逗号分隔" value={codes}
          onChange={(_, d) => setCodes(d.value || '')} style={{ width: 250 }} />
        <Button size="small" icon={<BeakerRegular />} onClick={run} disabled={loading}>运行回测</Button>
        {loading && <Spinner size="tiny" />}
      </div>

      {data && (
        <>
          <div style={{ display: 'flex', gap: 8 }}>
            <MetricTile label="回测期数" value={data.n_periods} />
            <MetricTile label="股票池" value={data.universe_size} />
            <MetricTile label="因子总数" value={data.factor_ics.length} />
          </div>
          <div style={{ backgroundColor: 'var(--colorNeutralBackground2)', padding: '8px' }}>
            <Text size={200} weight="bold">因子IC表现</Text>
            {data.factor_ics.slice(0, 10).map(f => (
              <div key={f.factor_name} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '2px 0', fontSize: 11 }}>
                <Text style={{ width: 120 }}>{f.factor_name}</Text>
                <Text style={{ width: 60, color: (f.mean_ic || 0) > 0 ? '#4caf50' : '#f44336' }}>
                  IC={f.mean_ic?.toFixed(3) ?? '-'}
                </Text>
                <ProgressBar
                  value={Math.max(0, Math.min(1, ((f.mean_ic || 0) + 0.1) / 0.2))}
                  thickness="small" style={{ flex: 1, maxWidth: 150 }}
                  color={(f.mean_ic || 0) > 0 ? 'success' : 'danger'} />
                <Badge size="small">{(f.hit_rate || 0) > 0 ? `${(f.hit_rate! * 100).toFixed(0)}%` : '-'}</Badge>
              </div>
            ))}
          </div>
        </>
      )}
    </>
  )
}
