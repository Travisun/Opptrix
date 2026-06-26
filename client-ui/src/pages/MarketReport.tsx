import { useState } from 'react'
import { Text, Button, Spinner, TabList, Tab } from '@fluentui/react-components'
import { ArrowSyncRegular } from '@fluentui/react-icons'
import PageShell from '../components/PageShell'
import SectionCard from '../components/SectionCard'
import EmptyState from '../components/EmptyState'
import StatusBanner from '../components/StatusBanner'
import { research } from '../api/client'
import type { MarketReportData } from '../types/schemas'

export default function MarketReport() {
  const [tab, setTab] = useState<'morning' | 'closing'>('closing')
  const [data, setData] = useState<MarketReportData | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const load = async (type: 'morning' | 'closing') => {
    setLoading(true)
    setError('')
    try {
      const resp = await research.marketReport(type)
      if (resp.success) setData(resp.data)
      else setError(resp.message || '报告生成失败')
    } catch (e) {
      setError(e instanceof Error ? e.message : '请求失败')
    }
    setLoading(false)
  }

  const handleTabChange = (val: string) => {
    const next = val as 'morning' | 'closing'
    setTab(next)
    load(next)
  }

  return (
    <PageShell
      title="市场日报"
      subtitle="开盘早报 · 收盘报告"
      actions={(
        <>
          <Button size="small" icon={<ArrowSyncRegular />} onClick={() => load(tab)} disabled={loading}>
            刷新
          </Button>
          {loading && <Spinner size="tiny" />}
        </>
      )}
    >
      <TabList size="small" selectedValue={tab} onTabSelect={(_, d) => handleTabChange(d.value as string)}>
        <Tab value="closing">收盘报告</Tab>
        <Tab value="morning">开盘早报</Tab>
      </TabList>

      {error && <StatusBanner message={error} tone="error" />}
      {!data && !loading && !error && <EmptyState message="选择报告类型并点击刷新生成内容" />}

      {data && (
        <>
          <SectionCard>
            <Text size={400} weight="semibold">{data.title}</Text>
            <Text size={200} style={{ display: 'block', marginTop: 8, lineHeight: 1.7, whiteSpace: 'pre-wrap' }}>
              {data.summary}
            </Text>
          </SectionCard>

          {data.sections.map((sec, i) => (
            <SectionCard key={i} title={sec.title}>
              <Text size={200} style={{ whiteSpace: 'pre-wrap', lineHeight: 1.7, color: '#ccc' }}>
                {sec.content}
              </Text>
            </SectionCard>
          ))}
        </>
      )}
    </PageShell>
  )
}
