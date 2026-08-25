import { useEffect, useRef, useState } from 'react'
import {
  makeStyles, Text, SearchBox, Button, Badge, Spinner, ProgressBar,
} from '@fluentui/react-components'
import { BotRegular, DismissRegular, ArrowSyncRegular } from '@fluentui/react-icons'
import { tryParseInstrumentInput, toStockContext, marketDisplayName, normalizeWatchlistItem } from '../market/instrument'
import { useInstrumentSearchWithUniversePrep, UNIVERSE_PREP_COPY } from '../market/useInstrumentSearchWithUniversePrep'
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
  searchWrap: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    width: '260px',
    maxWidth: '36vw',
  },
  search: { width: '100%' },
  prepRow: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  prepText: {
    fontSize: 'var(--opptrix-font-xs)',
    color: opptrixCssVars.textSecondary,
    lineHeight: 1.3,
  },
  prepFail: {
    fontSize: 'var(--opptrix-font-xs)',
    color: opptrixCssVars.error,
    lineHeight: 1.3,
  },
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

function pickSearchHit(
  q: string,
  items: Array<ReturnType<typeof normalizeWatchlistItem>>,
) {
  if (!items.length) return null
  const digits = q.replace(/\D/g, '')
  let pick = items[0]!
  if (digits && digits.length <= 5) {
    const exact = items.find(it => {
      const sym = it.instrument?.symbol ?? ''
      return sym.replace(/^0+/, '') === digits || sym === digits.padStart(5, '0')
    })
    if (exact) pick = exact
  }
  return pick
}

export default function MainHeader({ onNavigate, onRefresh }: Props) {
  const s = useStyles()
  const { globalStock, setGlobalStock, agentOpen, setAgentOpen } = useApp()
  const [keyword, setKeyword] = useState('')
  const [activeSearch, setActiveSearch] = useState('')
  const settledForRef = useRef('')

  const {
    hits,
    searching,
    universePrep,
    refreshingAfterPrep,
  } = useInstrumentSearchWithUniversePrep({
    keyword: activeSearch,
    limit: 10,
    minLength: 1,
    debounceMs: 80,
    enabled: Boolean(activeSearch),
  })

  const handleSearch = () => {
    const q = keyword.trim()
    if (!q) return
    settledForRef.current = ''
    setActiveSearch(q)
  }

  useEffect(() => {
    if (!activeSearch) return
    if (universePrep.status === 'preparing' || searching || refreshingAfterPrep) return
    if (settledForRef.current === activeSearch) return
    settledForRef.current = activeSearch

    const pick = pickSearchHit(activeSearch, hits)
    if (pick) {
      setGlobalStock(toStockContext(pick))
      onNavigate('stock_research')
      setActiveSearch('')
      return
    }

    const ref = tryParseInstrumentInput(activeSearch)
    if (ref) {
      setGlobalStock(toStockContext(normalizeWatchlistItem({
        code: activeSearch,
        name: '',
        instrument: ref,
      })))
      onNavigate('stock_research')
      setActiveSearch('')
      return
    }

    // 歧义短码且无命中：不构造假 CN；结束本轮搜索
    setActiveSearch('')
  }, [
    activeSearch,
    hits,
    searching,
    universePrep.status,
    refreshingAfterPrep,
    setGlobalStock,
    onNavigate,
  ])

  const showPrep = universePrep.status === 'preparing'
  const showFail = universePrep.status === 'failed'

  return (
    <header className={s.root}>
      <div className={s.searchWrap}>
        <SearchBox
          className={s.search}
          size="medium"
          placeholder="搜索股票代码或名称"
          value={keyword}
          onChange={(_, d) => {
            setKeyword(d.value)
            // 改关键字取消旧轮询（清空 activeSearch）
            if (activeSearch && d.value.trim() !== activeSearch) {
              settledForRef.current = ''
              setActiveSearch('')
            }
          }}
          onKeyDown={(e) => { if (e.key === 'Enter') handleSearch() }}
        />
        {showPrep && (
          <div className={s.prepRow}>
            <Text className={s.prepText}>
              {refreshingAfterPrep
                ? UNIVERSE_PREP_COPY.refreshing
                : (universePrep.message || UNIVERSE_PREP_COPY.preparing)}
            </Text>
            <ProgressBar
              value={Math.min(1, Math.max(0.03, (universePrep.percent || 0) / 100))}
              thickness="medium"
              color="brand"
              shape="rounded"
            />
          </div>
        )}
        {showFail && (
          <Text className={s.prepFail}>
            {universePrep.message || UNIVERSE_PREP_COPY.failed}
          </Text>
        )}
      </div>
      {(searching || refreshingAfterPrep) && !showPrep && <Spinner size="tiny" />}

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
