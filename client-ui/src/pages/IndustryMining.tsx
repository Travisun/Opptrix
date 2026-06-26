import { useState } from 'react'
import { Text, Button, Spinner, Input } from '@fluentui/react-components'
import { MapRegular } from '@fluentui/react-icons'
import PageShell from '../components/PageShell'
import SectionCard from '../components/SectionCard'
import EmptyState from '../components/EmptyState'
import MetricTile from '../components/MetricTile'
import StatusBanner from '../components/StatusBanner'
import { research } from '../api/client'
import type { IndustryMiningData } from '../types/schemas'

const INDUSTRIES = ['新能源', '半导体', '白酒', '医药生物', '人工智能', '新能源汽车',
  '光伏', '消费电子', '军工', '银行', '证券', '保险', '房地产']

export default function IndustryMining() {
  const [industry, setIndustry] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [data, setData] = useState<IndustryMiningData | null>(null)

  const load = async (ind: string) => {
    if (!ind.trim()) return
    setLoading(true)
    setError('')
    try {
      const resp = await research.industryMining(ind.trim())
      if (resp.success) setData(resp.data)
      else setError(resp.message || '产业分析失败')
    } catch (e) {
      setError(e instanceof Error ? e.message : '请求失败')
    }
    setLoading(false)
  }

  return (
    <PageShell
      title="产业透视"
      subtitle="产业链结构 · 关键公司梳理"
      actions={(
        <>
          <Input size="small" placeholder="输入行业名称" value={industry}
            onChange={(_, d) => setIndustry(d.value || '')}
            onKeyDown={(e) => { if (e.key === 'Enter') load(industry) }}
            style={{ width: 160 }} />
          <Button size="small" icon={<MapRegular />} onClick={() => load(industry)} disabled={loading}>
            生成
          </Button>
          {loading && <Spinner size="tiny" />}
        </>
      )}
    >
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {INDUSTRIES.map(ind => (
          <Button key={ind} size="small" appearance="subtle"
            onClick={() => { setIndustry(ind); load(ind) }}>
            {ind}
          </Button>
        ))}
      </div>

      {error && <StatusBanner message={error} tone="error" />}
      {!data && !loading && !error && <EmptyState message="选择或输入行业，生成产业链透视报告" />}

      {data && (
        <>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <MetricTile label="行业" value={data.industry} />
            {data.key_companies > 0 && (
              <MetricTile label="关键公司" value={data.key_companies} tooltip="报告中识别的重点标的数量" />
            )}
          </div>

          {data.summary && (
            <SectionCard title="核心摘要">
              <Text size={200} style={{ lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
                {data.summary}
              </Text>
            </SectionCard>
          )}

          <SectionCard title="产业链全景">
            <Text size={200} style={{ lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
              {data.chain_overview}
            </Text>
          </SectionCard>
        </>
      )}
    </PageShell>
  )
}
