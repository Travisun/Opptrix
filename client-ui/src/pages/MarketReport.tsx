import { useState } from 'react'
import { Text, Button, Spinner, TabList, Tab, ProgressBar } from '@fluentui/react-components'
import { ArrowSyncRegular } from '@fluentui/react-icons'
import MetricTile from '../components/MetricTile'
import { research } from '../api/client'
import type { MarketReportData } from '../types/schemas'

export default function MarketReport() {
  const [tab, setTab] = useState('closing')
  const [data, setData] = useState<MarketReportData | null>(null)
  const [loading, setLoading] = useState(false)

  const load = async (type: 'morning' | 'closing') => {
    setLoading(true)
    try {
      const resp = await research.marketReport(type)
      if (resp.success) setData(resp.data)
    } catch (e) { console.error(e) }
    setLoading(false)
  }

  const handleTabChange = (val: string) => {
    setTab(val)
    load(val as 'morning' | 'closing')
  }

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Text size={400} weight="bold">市场日报</Text>
        <Button size="small" icon={<ArrowSyncRegular />} onClick={() => load(tab as 'morning' | 'closing')}
          disabled={loading}>
          刷新
        </Button>
        {loading && <Spinner size="tiny" />}
      </div>

      <TabList size="small" selectedValue={tab} onTabSelect={(_, d) => handleTabChange(d.value as string)}>
        <Tab value="closing">收盘报告</Tab>
        <Tab value="morning">开盘早报</Tab>
      </TabList>

      {data && (
        <div style={{ backgroundColor: 'var(--colorNeutralBackground2)', padding: '12px' }}>
          <Text size={300} weight="bold">{data.title}</Text>
          <Text size={200} style={{ display: 'block', marginTop: 8, lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
            {data.summary}
          </Text>
          {data.sections.length > 0 && data.sections.slice(0, 1).map((sec, i) => (
            <div key={i} style={{ marginTop: 12 }}>
              <Text size={200} weight="bold" style={{ color: '#aaa' }}>{sec.title}</Text>
              <Text size={200} style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6, marginTop: 4, color: '#ccc' }}>
                {sec.content.slice(0, 2000)}
              </Text>
            </div>
          ))}
        </div>
      )}
    </>
  )
}
