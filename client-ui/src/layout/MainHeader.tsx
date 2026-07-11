import { useState } from 'react'
import {
  makeStyles, Text, SearchBox, Button, Badge, Spinner,
} from '@fluentui/react-components'
import { BotRegular, DismissRegular, ArrowSyncRegular } from '@fluentui/react-icons'
import { research } from '../api/client'
import { hitToWatchlistItem, isAmbiguousNumericCode, parseInstrumentInput, tryParseInstrumentInput, toStockContext, marketDisplayName, normalizeWatchlistItem } from '../market/instrument'
import { useApp } from '../context/AppContext'
import type { FeatureRoute } from '../types/schemas'
import { opptrixTokens, opptrixCssVars } from '../theme/tokens'

const useStyles = makeStyles({
  root: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '12px 20px',
    backgroundColor: opptrixCssVars.surface,
    borderBottom: `1px solid ${opptrixCssVars.border}`,
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
    backgroundColor: opptrixCssVars.accentSoft,
    border: `1px solid ${opptrixCssVars.border}`,
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
      const resp = await research.searchInstruments(q, 10)
      if (resp.success && resp.data?.items?.length) {
        // 对纯数字短码，选择"symbol 精确匹配"的命中优先（避免 700 → 含 "700" 的名称匹配）；
        // 若有多个市场精确同码（A/H 同时存在），默认取第一条（搜索已按 CN→HK 排序，
        // 用户可从结果列表里再选港股，下方股票 chip 会显示市场后缀）。
        const items = resp.data.items
        const digits = q.replace(/\D/g, '')
        let pick = items[0]!
        if (digits && digits.length <= 5) {
          const exact = items.find(it => it.instrument.symbol.replace(/^0+/, '') === digits
            || it.instrument.symbol === digits.padStart(5, '0'))
          if (exact) pick = exact
        }
        setGlobalStock(toStockContext(hitToWatchlistItem(pick)))
      } else if (isAmbiguousNumericCode(q)) {
        // 短数字码有跨市场歧义，不本地猜市场
        return
      } else {
        const ref = tryParseInstrumentInput(q) ?? parseInstrumentInput(q)
        setGlobalStock(toStockContext(normalizeWatchlistItem({ code: q, name: '', instrument: ref })))
      }
      onNavigate('stock_research')
    } catch {
      if (!isAmbiguousNumericCode(q)) {
        const ref = tryParseInstrumentInput(q) ?? parseInstrumentInput(q)
        setGlobalStock(toStockContext(normalizeWatchlistItem({ code: q, name: '', instrument: ref })))
        onNavigate('stock_research')
      }
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
          <Text size={300}>
            {globalStock.name || '—'}
            {globalStock.instrument && globalStock.instrument.market !== 'CN'
              ? ` · ${marketDisplayName(globalStock.instrument.market)}`
              : ''}
          </Text>
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
        style={!agentOpen ? { backgroundColor: opptrixCssVars.accentSoft, borderColor: opptrixCssVars.accent } : undefined}
      >
        {agentOpen ? '关闭助手' : '问 AI'}
      </Button>
    </header>
  )
}
