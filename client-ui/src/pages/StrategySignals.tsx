import { useState, useEffect } from 'react'
import { Text, SearchBox, Button, Spinner, Badge, ProgressBar } from '@fluentui/react-components'
import { ArrowSyncRegular } from '@fluentui/react-icons'
import PageShell from '../components/PageShell'
import SectionCard from '../components/SectionCard'
import EmptyState from '../components/EmptyState'
import MetricTile from '../components/MetricTile'
import StatusBanner from '../components/StatusBanner'
import { research } from '../api/client'
import type { StrategySignalData, StrategyVerifyData } from '../types/schemas'

interface Props {
  globalStock?: { code: string; name: string } | null
}

export default function StrategySignals({ globalStock }: Props) {
  const [code, setCode] = useState(globalStock?.code || '')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [data, setData] = useState<StrategySignalData | null>(null)
  const [verifyData, setVerifyData] = useState<StrategyVerifyData | null>(null)

  useEffect(() => {
    if (globalStock?.code) setCode(globalStock.code)
  }, [globalStock])

  const load = async () => {
    if (!code.trim()) return
    setLoading(true)
    setError('')
    try {
      const [sig, ver] = await Promise.all([
        research.strategySignals(code.trim()),
        research.strategyVerify(code.trim(), 30, 5).catch(() => null),
      ])
      if (sig.success) setData(sig.data)
      else setError(sig.message || '策略信号获取失败')
      if (ver?.success) setVerifyData(ver.data)
    } catch (e) {
      setError(e instanceof Error ? e.message : '请求失败')
    }
    setLoading(false)
  }

  return (
    <PageShell
      title="策略信号"
      subtitle="9 套投行级策略 · 历史胜率验证"
      actions={(
        <>
          <SearchBox size="small" placeholder="股票代码" value={code}
            onChange={(_, d) => setCode(d.value || '')}
            onKeyDown={(e) => { if (e.key === 'Enter') load() }}
            style={{ width: 200 }} />
          <Button size="small" icon={<ArrowSyncRegular />} onClick={load} disabled={loading}>
            查询
          </Button>
          {loading && <Spinner size="tiny" />}
        </>
      )}
    >
      {error && <StatusBanner message={error} tone="error" />}
      {!data && !loading && !error && <EmptyState message="输入股票代码查看策略信号与历史验证" />}

      {data && (
        <>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <MetricTile label="综合信号" value={data.summary}
              color={data.bullish_count > data.bearish_count ? '#4caf50' : '#f44336'} />
            <MetricTile label="看多" value={data.bullish_count} color="#4caf50" />
            <MetricTile label="看空" value={data.bearish_count} color="#f44336" />
            <MetricTile label="中性" value={data.neutral_count} color="#888" />
          </div>

          <SectionCard title="策略明细">
            {data.signals.length === 0 ? (
              <Text size={200} style={{ color: '#888', whiteSpace: 'pre-wrap' }}>{data.summary}</Text>
            ) : data.signals.map(sig => (
              <div key={sig.name}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
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
                <Text style={{ flex: 1, color: '#666', fontSize: 11 }}>{sig.detail}</Text>
              </div>
            ))}
          </SectionCard>

          {verifyData && (
            <SectionCard title="历史验证">
              <Text size={200} style={{ color: '#888' }}>
                {verifyData.checkpoints} 个检查点 · 前瞻 {verifyData.forward_days} 日
                · 平均胜率 {(verifyData.avg_win_rate * 100).toFixed(0)}%
                {verifyData.best_strategy && ` · 最佳 ${verifyData.best_strategy.name} (${(verifyData.best_strategy.win_rate * 100).toFixed(0)}%)`}
              </Text>
              {verifyData.performances.map(p => (
                <div key={p.name} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0', fontSize: 11 }}>
                  <Text style={{ width: 100 }}>{p.name}</Text>
                  <Text style={{ width: 60 }}>{(p.overall_win_rate * 100).toFixed(0)}%</Text>
                  <ProgressBar value={p.overall_win_rate} thickness="small" style={{ flex: 1, maxWidth: 180 }} />
                  <Text style={{ width: 60, color: p.avg_return >= 0 ? '#4caf50' : '#f44336' }}>
                    {p.avg_return >= 0 ? '+' : ''}{(p.avg_return * 100).toFixed(1)}%
                  </Text>
                  <Text style={{ width: 50, color: '#666' }}>
                    P {((p.precision ?? 0) * 100).toFixed(0)}%
                  </Text>
                  <Text style={{ color: '#666' }}>
                    买{p.buy_signals ?? 0}/卖{p.sell_signals ?? 0}
                  </Text>
                </div>
              ))}
            </SectionCard>
          )}
        </>
      )}
    </PageShell>
  )
}
