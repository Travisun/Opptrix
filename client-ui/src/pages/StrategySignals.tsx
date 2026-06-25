import { useState } from 'react'
import { Text, SearchBox, Button, Spinner, Badge, ProgressBar } from '@fluentui/react-components'
import { ArrowSyncRegular } from '@fluentui/react-icons'
import MetricTile from '../components/MetricTile'
import { research } from '../api/client'
import type { StrategySignalData } from '../types/schemas'

export default function StrategySignals() {
  const [code, setCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<StrategySignalData | null>(null)
  const [verifyData, setVerifyData] = useState<any>(null)

  const load = async () => {
    if (!code.trim()) return
    setLoading(true)
    try {
      const [sig, ver] = await Promise.all([
        research.strategySignals(code.trim()),
        research.strategyVerify(code.trim(), 30, 5).catch(() => null),
      ])
      if (sig.success) setData(sig.data)
      if (ver?.success) setVerifyData(ver.data)
    } catch (e) { console.error(e) }
    setLoading(false)
  }

  return (
    <>
      <Text size={400} weight="bold">策略信号</Text>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <SearchBox size="small" placeholder="股票代码" value={code}
          onChange={(_, d) => setCode(d.value || '')}
          onKeyDown={(e) => { if (e.key === 'Enter') load() }}
          style={{ width: 200 }} />
        <Button size="small" icon={<ArrowSyncRegular />} onClick={load} disabled={loading}>查询</Button>
        {loading && <Spinner size="tiny" />}
      </div>

      {data && (
        <>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <MetricTile label="综合信号" value={data.summary}
              color={data.bullish_count > data.bearish_count ? '#4caf50' : '#f44336'} />
            <MetricTile label="看多" value={data.bullish_count} color="#4caf50" />
            <MetricTile label="看空" value={data.bearish_count} color="#f44336" />
            <MetricTile label="中性" value={data.neutral_count} color="#888" />
          </div>

          {data.signals.map(sig => (
            <div key={sig.name}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                padding: '4px 12px',
                backgroundColor: 'var(--colorNeutralBackground2)',
                marginBottom: 4,
              }}>
              <Text style={{ width: 80 }}>{sig.name}</Text>
              <Badge size="small"
                color={sig.direction === '看多' ? 'success' : sig.direction === '看空' ? 'danger' : 'warning'}>
                {sig.direction}
              </Badge>
              <div style={{ flex: 1 }}>
                <ProgressBar value={sig.confidence} thickness="small"
                  color={sig.direction === '看多' ? 'success' : sig.direction === '看空' ? 'danger' : 'warning'} />
              </div>
              <Text style={{ width: 40, textAlign: 'right', fontSize: 11 }}>
                {sig.confidence.toFixed(2)}
              </Text>
              <Text style={{ color: '#666', fontSize: 11 }}>{sig.detail}</Text>
            </div>
          ))}

          {verifyData && (
            <div style={{ marginTop: 12 }}>
              <Text size={300} weight="bold">历史验证</Text>
              <Text size={200} style={{ color: '#888' }}>
                {verifyData.checkpoints}个检查点 · 平均胜率 {(verifyData.avg_win_rate * 100).toFixed(0)}%
                {verifyData.best_strategy && ` · 最佳: ${verifyData.best_strategy.name} (${(verifyData.best_strategy.win_rate * 100).toFixed(0)}%)`}
              </Text>
            </div>
          )}
        </>
      )}
    </>
  )
}
