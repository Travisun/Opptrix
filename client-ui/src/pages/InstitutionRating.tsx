import { useState, useEffect } from 'react'
import {
  makeStyles, tokens, Text, SearchBox, Button, Spinner, Badge, ProgressBar, TabList, Tab,
} from '@fluentui/react-components'
import { ArrowSyncRegular } from '@fluentui/react-icons'
import MetricTile from '../components/MetricTile'
import { research } from '../api/client'
import type { InstitutionRatingData } from '../types/schemas'

const useStyles = makeStyles({
  row: {
    display: 'grid', gridTemplateColumns: '120px 60px 60px 1fr 100px 80px',
    padding: `${tokens.spacingVerticalXXS} ${tokens.spacingHorizontalS}`,
    fontSize: tokens.fontSizeBase200,
    ':hover': { backgroundColor: tokens.colorNeutralBackground3 },
    alignItems: 'center', gap: tokens.spacingHorizontalXS,
  },
  header: { fontWeight: '600', color: tokens.colorNeutralForeground3 },
  dimRow: {
    padding: `2px ${tokens.spacingHorizontalXL}`,
    fontSize: tokens.fontSizeBase100, display: 'flex', gap: tokens.spacingHorizontalM,
  },
  groupBar: {
    display: 'flex', alignItems: 'center', gap: tokens.spacingHorizontalS,
    padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalM}`,
    backgroundColor: tokens.colorNeutralBackground2, marginBottom: tokens.spacingVerticalXS,
  },
})

const groupColors: Record<string, string> = {
  '国际投行': '#2196f3', '国内券商': '#4caf50',
  '国家队': '#f44336', '补充机构': '#ff9800', '其他': '#9c27b0',
}

interface Props {
  globalStock: { code: string } | null
  setGlobalStock?: (s: { code: string; name: string }) => void
}

export default function InstitutionRating({ globalStock }: Props) {
  const s = useStyles()
  const [code, setCode] = useState(globalStock?.code || '')
  const [loading, setLoading] = useState(false)
  const [data, setData] = useState<InstitutionRatingData | null>(null)
  const [groupTab, setGroupTab] = useState('all')
  const [expanded, setExpanded] = useState<string | null>(null)

  useEffect(() => {
    if (globalStock?.code) setCode(globalStock.code)
  }, [globalStock])

  const load = async () => {
    if (!code.trim()) return
    setLoading(true)
    try {
      const resp = await research.institutionRating(code.trim())
      if (resp.success) setData(resp.data)
    } catch (e) { console.error(e) }
    setLoading(false)
  }

  const filtered = data?.ratings.filter(r => groupTab === 'all' || r.group === groupTab) || []

  return (
    <>
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
            <MetricTile label="共识" value={data.consensus_rating_cn}
              color={data.consensus_rating === 'buy' || data.consensus_rating === 'strong_buy' ? '#4caf50' : data.consensus_rating === 'sell' ? '#f44336' : '#ff9800'} />
            <MetricTile label="平均信心" value={data.avg_confidence.toFixed(1)} max={10} />
            <MetricTile label="一致率" value={`${(data.agreement_rate * 100).toFixed(0)}%`} />
            <MetricTile label="分歧度" value={`σ${data.confidence_std.toFixed(1)}`} />
            <MetricTile label="看多" value={data.bullish_count} tooltip="买入+强烈买入" color="#4caf50" />
            <MetricTile label="看空" value={data.bearish_count} tooltip="卖出+持有" color="#f44336" />
          </div>

          {/* Group comparison */}
          {Object.entries(data.group_stats).map(([g, st]) => (
            <div key={g} className={s.groupBar}>
              <Text style={{ width: 80, color: groupColors[g] }}>{g}</Text>
              <ProgressBar value={st.avg / 10} thickness="small"
                color={st.avg >= 6 ? 'success' : st.avg >= 4 ? 'warning' : 'danger'}
                style={{ flex: 1 }} />
              <Text style={{ width: 40, textAlign: 'right' }}>{st.avg.toFixed(1)}</Text>
              <Text style={{ width: 80, color: '#888', fontSize: 10 }}>买入{st.buy} 卖出{st.sell}</Text>
            </div>
          ))}

          {/* Group tabs */}
          <TabList size="small" selectedValue={groupTab}
            onTabSelect={(_, d) => setGroupTab(d.value as string)}>
            <Tab value="all">全部({data.ratings.length})</Tab>
            {Object.keys(data.group_stats).map(g => (
              <Tab key={g} value={g}>{g}({data.group_stats[g].count})</Tab>
            ))}
          </TabList>

          {/* Header */}
          <div className={`${s.row} ${s.header}`}>
            <Text>机构</Text><Text>评级</Text><Text>信心</Text><Text />
            <Text>来源</Text><Text>模型</Text>
          </div>

          {/* Ratings */}
          {filtered.map(r => (
            <div key={r.institution_short}>
              <div className={s.row} style={{ cursor: 'pointer' }}
                onClick={() => setExpanded(expanded === r.institution_short ? null : r.institution_short)}>
                <Text>{r.institution_short}</Text>
                <Badge size="small"
                  color={r.rating === 'buy' || r.rating === 'strong_buy' ? 'success' :
                         r.rating === 'sell' || r.rating === 'strong_sell' ? 'danger' : 'warning'}>
                  {r.rating_cn}
                </Badge>
                <Text style={{ textAlign: 'right' }}>{r.confidence.toFixed(1)}</Text>
                <ProgressBar value={r.confidence / 10} thickness="small" style={{ flex: 1 }} />
                <Badge size="small" appearance="tint">
                  {r.method_source === 'documented' ? '官方' : r.method_source === 'partial' ? '部分' : '推断'}
                </Badge>
                <Text style={{ fontSize: 10, color: '#888' }}>{r.model_name.slice(0, 12)}</Text>
              </div>
              {expanded === r.institution_short && r.dimensions && (
                <div style={{ backgroundColor: 'rgba(255,255,255,0.03)' }}>
                  {r.dimensions.map(d => (
                    <div key={d.name} className={s.dimRow}>
                      <Text style={{ width: 120 }}>{d.name}</Text>
                      <ProgressBar value={d.score / 10} thickness="small"
                        style={{ flex: 1, maxWidth: 200 }} />
                      <Text style={{ width: 30, textAlign: 'right' }}>{d.score.toFixed(1)}</Text>
                      <Text style={{ color: '#666' }}>{d.detail}</Text>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </>
      )}
    </>
  )
}
