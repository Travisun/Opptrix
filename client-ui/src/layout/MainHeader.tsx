import { useState } from 'react'
import {
  makeStyles, Text, SearchBox, Button, Badge, Spinner,
} from '@fluentui/react-components'
import { BotRegular, DismissRegular, ArrowSyncRegular } from '@fluentui/react-icons'
import { research } from '../api/client'
import { useApp } from '../context/AppContext'
import type { FeatureRoute } from '../types/schemas'
import { opptrixTokens } from '../theme/tokens'

const useStyles = makeStyles({
  root: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '12px 20px',
    backgroundColor: opptrixTokens.surface,
    borderBottom: `1px solid ${opptrixTokens.border}`,
    minHeight: '56px',
    flexShrink: 0,
  },
  search: { width: '260px', maxWidth: '36vw' },
  stockChip: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '4px 10px',
    borderRadius: opptrixTokens.radiusMd,
    backgroundColor: opptrixTokens.accentSoft,
    border: `1px solid ${opptrixTokens.border}`,
  },
  spacer: { flex: 1 },
})

interface Props {
  onNavigate: (route: FeatureRoute) => void
  onRefresh?: () => void
}

export default function MainHeader({ onNavigate, onRefresh }: Props) {
  const s = useStyles()
  const { globalStock, setGlobalStock, agentOpen, setAgentOpen } = useApp()
  const [keyword, setKeyword] = useState('')
  const [searching, setSearching] = useState(false)

  const handleSearch = async () => {
    const q = keyword.trim()
    if (!q) return
    setSearching(true)
    try {
      const resp = await research.searchStocks(q)
      if (resp.success && resp.data.results.length > 0) {
        const first = resp.data.results[0]
        setGlobalStock({ code: first.code, name: first.name })
      } else {
        setGlobalStock({ code: q, name: '' })
      }
      onNavigate('stock_research')
    } catch {
      setGlobalStock({ code: q, name: '' })
      onNavigate('stock_research')
    }
    setSearching(false)
  }

  return (
    <header className={s.root}>
      <SearchBox
        className={s.search}
        size="medium"
        placeholder="搜索股票代码或名称"
        value={keyword}
        onChange={(_, d) => setKeyword(d.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') handleSearch() }}
      />
      {searching && <Spinner size="tiny" />}

      {globalStock && (
        <div className={s.stockChip}>
          <Badge appearance="filled" color="brand" size="small">{globalStock.code}</Badge>
          <Text size={300}>{globalStock.name || '—'}</Text>
          <Button appearance="subtle" size="small" icon={<DismissRegular />}
            onClick={() => setGlobalStock(null)} aria-label="清除标的" />
        </div>
      )}

      <div className={s.spacer} />

      {onRefresh && (
        <Button appearance="subtle" size="small" icon={<ArrowSyncRegular />} onClick={onRefresh}>
          刷新
        </Button>
      )}

      <Button
        appearance={agentOpen ? 'primary' : 'outline'}
        size="small"
        icon={<BotRegular />}
        onClick={() => setAgentOpen(!agentOpen)}
        style={!agentOpen ? { backgroundColor: opptrixTokens.accentSoft, borderColor: opptrixTokens.accent } : undefined}
      >
        {agentOpen ? '关闭助手' : '问 AI'}
      </Button>
    </header>
  )
}
