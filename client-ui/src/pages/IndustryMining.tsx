import { useState } from 'react'
import { Text, Button, Spinner, Input, ProgressBar } from '@fluentui/react-components'
import { MapRegular } from '@fluentui/react-icons'
import { research } from '../api/client'
import type { IndustryMiningData } from '../types/schemas'

const INDUSTRIES = ['新能源', '半导体', '白酒', '医药生物', '人工智能', '新能源汽车',
  '光伏', '消费电子', '军工', '银行', '证券', '保险', '房地产']

export default function IndustryMining() {
  const [industry, setIndustry] = useState('')
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<IndustryMiningData | null>(null)

  const load = async (ind: string) => {
    if (!ind.trim()) return
    setLoading(true)
    try {
      const resp = await research.industryMining(ind.trim())
      if (resp.success) setData(resp.data)
    } catch (e) { console.error(e) }
    setLoading(false)
  }

  return (
    <>
      <Text size={400} weight="bold">产业透视</Text>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 8 }}>
        {INDUSTRIES.slice(0, 8).map(ind => (
          <Button key={ind} size="small" appearance="subtle" onClick={() => { setIndustry(ind); load(ind) }}>
            {ind}
          </Button>
        ))}
        <Input size="small" placeholder="输入其他行业" value={industry}
          onChange={(_, d) => setIndustry(d.value || '')}
          onKeyDown={(e) => { if (e.key === 'Enter') load(industry) }}
          style={{ width: 160 }} />
        <Button size="small" icon={<MapRegular />} onClick={() => load(industry)} disabled={loading}>生成</Button>
        {loading && <Spinner size="tiny" />}
      </div>

      {data && (
        <div style={{ backgroundColor: 'var(--colorNeutralBackground2)', padding: '12px' }}>
          <Text size={300} weight="bold">{data.industry}产业链</Text>
          <Text size={200} style={{ display: 'block', marginTop: 8, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
            {data.chain_overview.slice(0, 3000)}
          </Text>
        </div>
      )}
    </>
  )
}
