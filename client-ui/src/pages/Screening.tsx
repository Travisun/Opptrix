import { useState } from 'react'
import {
  makeStyles, tokens, Text, Button, SearchBox, Spinner,
  Badge, ProgressBar, Dropdown, Option, Input,
} from '@fluentui/react-components'
import { FilterRegular, AddRegular, DismissRegular } from '@fluentui/react-icons'
import { research } from '../api/client'
import type { ScreeningData } from '../types/schemas'

const useStyles = makeStyles({
  condRow: {
    display: 'flex', alignItems: 'center', gap: tokens.spacingHorizontalS,
    padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalM}`,
    backgroundColor: tokens.colorNeutralBackground2,
    marginBottom: tokens.spacingVerticalXS,
  },
  tableRow: {
    display: 'grid', gridTemplateColumns: '80px 1fr 60px 80px 80px 80px 80px',
    padding: `${tokens.spacingVerticalXS} ${tokens.spacingHorizontalS}`,
    fontSize: tokens.fontSizeBase200,
    borderBottom: '1px solid transparent',
    ':hover': { backgroundColor: tokens.colorNeutralBackground3 },
  },
  tableHeader: {
    fontWeight: '600', color: tokens.colorNeutralForeground3,
    borderBottom: '1px solid transparent',
  },
})

type Cond = { factor: string; op: string; value: string }

const FACTOR_OPTIONS = ['roe', 'pe', 'pb', 'debt_ratio', 'gross_margin',
  'revenue_cagr_3y', 'profit_cagr_3y', 'dividend_yield',
  'momentum_3m', 'momentum_6m', 'volatility_1y', 'max_drawdown_1y', 'fcf_yield',
  'rsi_score', 'ma_position', 'volume_ratio']
const OP_OPTIONS = ['>', '<', '>=', '<=', '=']

interface Props { navigate: (r: string) => void; setGlobalStock: (s: any) => void }

export default function Screening({ navigate, setGlobalStock }: Props) {
  const s = useStyles()
  const [conditions, setConditions] = useState<Cond[]>([{ factor: 'roe', op: '>', value: '15' }])
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<ScreeningData | null>(null)

  const updateCond = (i: number, field: keyof Cond, val: string) => {
    const next = [...conditions]
    next[i] = { ...next[i], [field]: val }
    setConditions(next)
  }
  const addCond = () => setConditions([...conditions, { factor: 'roe', op: '>', value: '' }])
  const removeCond = (i: number) => conditions.length > 1 && setConditions(conditions.filter((_, j) => j !== i))

  const run = async () => {
    setLoading(true)
    try {
      const mapped = conditions
        .filter(c => c.value.trim())
        .map(c => ({ factor: c.factor, op: c.op, value: parseFloat(c.value) }))
      const resp = await research.screen(mapped)
      if (resp.success) setResult(resp.data)
    } catch (e) { console.error(e) }
    setLoading(false)
  }

  return (
    <>
      <Text size={400} weight="bold">智能选股</Text>

      {/* Condition builder */}
      {conditions.map((c, i) => (
        <div key={i} className={s.condRow}>
          <Dropdown size="small" value={c.factor} style={{ width: 140 }}
            onOptionSelect={(_, d) => updateCond(i, 'factor', d.optionValue || c.factor)}>
            {FACTOR_OPTIONS.map(f => <Option key={f} value={f}>{f}</Option>)}
          </Dropdown>
          <Dropdown size="small" value={c.op} style={{ width: 60 }}
            onOptionSelect={(_, d) => updateCond(i, 'op', d.optionValue || c.op)}>
            {OP_OPTIONS.map(o => <Option key={o} value={o}>{o}</Option>)}
          </Dropdown>
          <Input size="small" placeholder="值" value={c.value}
            onChange={(_, d) => updateCond(i, 'value', d.value || '')}
            style={{ width: 80 }} />
          <Button size="small" icon={<DismissRegular />} onClick={() => removeCond(i)} disabled={conditions.length <= 1} appearance="subtle" />
        </div>
      ))}

      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <Button size="small" icon={<AddRegular />} onClick={addCond} appearance="subtle">添加条件</Button>
        <Button size="small" icon={<FilterRegular />} onClick={run} disabled={loading}>执行筛选</Button>
        {loading && <Spinner size="tiny" />}
      </div>

      {/* Results */}
      {result && (
        <div>
          <Text size={200} style={{ color: '#888' }}>
            扫描 {result.total_scanned} 只, 通过 {result.passed} 只
          </Text>
          <div className={`${s.tableRow} ${s.tableHeader}`}>
            <Text>代码</Text><Text>名称</Text><Text>评分</Text>
            {conditions.filter(c => c.value.trim()).slice(0, 4).map((c, i) => (
              <Text key={i}>{c.factor}</Text>
            ))}
          </div>
          {result.items.slice(0, 30).map(item => (
            <div key={item.code} className={s.tableRow}
              style={{ cursor: 'pointer' }}
              onClick={() => { setGlobalStock({ code: item.code, name: item.name }); navigate('stock_research') }}>
              <Text>{item.code}</Text>
              <Text>{item.name}</Text>
              <Text style={{ fontWeight: 600, color: item.total_score >= 7 ? '#4caf50' : '#ff9800' }}>
                {item.total_score.toFixed(1)}
              </Text>
              {conditions.filter(c => c.value.trim()).slice(0, 4).map((c, j) => (
                <Text key={j}>{item.key_factors[c.factor]?.toFixed(2) ?? '-'}</Text>
              ))}
            </div>
          ))}
        </div>
      )}
    </>
  )
}
