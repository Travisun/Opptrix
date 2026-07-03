import { useCallback, useEffect, useMemo, useState } from 'react'
import { Spinner, Text, makeStyles, mergeClasses } from '@fluentui/react-components'
import { fetchCryptoSnapshot, fetchUsSnapshot } from '../api/client'
import type { CryptoSnapshotData, UsSnapshotData, WatchlistItem } from '../types/market'
import {
  formatCompactNumber,
  formatPct,
  formatPrice,
  formatSignedNumber,
  pctTone,
} from './format'
import {
  formatInstrumentLabel,
  displayCodeFromInstrument,
  marketDisplayName,
  resolveWatchlistInstrument,
} from './instrument'
import { opptrixTokens, opptrixCssVars } from '../theme/tokens'

const CONTENT_PAD = '15px'

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
    height: '100%',
  },
  hero: {
    flexShrink: 0,
    padding: `12px ${CONTENT_PAD}`,
    borderBottom: `1px solid ${opptrixCssVars.separator}`,
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  titleRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    minWidth: 0,
  },
  name: {
    fontSize: '14px',
    fontWeight: 650,
    color: opptrixCssVars.textPrimary,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  badge: {
    fontSize: '10px',
    fontWeight: 600,
    padding: '2px 8px',
    borderRadius: opptrixTokens.radiusFull,
    backgroundColor: opptrixCssVars.accentSoft,
    color: opptrixCssVars.textSecondary,
    flexShrink: 0,
  },
  quoteRow: {
    display: 'flex',
    alignItems: 'baseline',
    gap: '8px',
    flexWrap: 'wrap',
  },
  price: {
    fontSize: '20px',
    fontWeight: 700,
    fontVariantNumeric: 'tabular-nums',
    lineHeight: 1.1,
  },
  change: {
    fontSize: '11px',
    fontWeight: 600,
    fontVariantNumeric: 'tabular-nums',
  },
  pctUp: { color: '#FF3B30' },
  pctDown: { color: '#34C759' },
  pctFlat: { color: opptrixCssVars.textTertiary },
  heroGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(3, minmax(0, 1fr))',
    gap: '4px 8px',
    marginTop: '2px',
  },
  statLabel: {
    fontSize: '10px',
    color: opptrixCssVars.textTertiary,
  },
  statValue: {
    fontSize: '11px',
    fontWeight: 600,
    color: opptrixCssVars.textPrimary,
    fontVariantNumeric: 'tabular-nums',
  },
  body: {
    flex: 1,
    padding: CONTENT_PAD,
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    overflow: 'auto',
  },
  card: {
    padding: '12px',
    borderRadius: opptrixTokens.radiusMd,
    backgroundColor: opptrixCssVars.surfaceMuted,
    border: `1px solid ${opptrixCssVars.separator}`,
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  cardTitle: {
    fontSize: '11px',
    fontWeight: 650,
    color: opptrixCssVars.textSecondary,
  },
  klineRow: {
    display: 'flex',
    alignItems: 'flex-end',
    gap: '3px',
    height: '72px',
    paddingTop: '4px',
  },
  klineBar: {
    flex: '1 1 0',
    minWidth: '4px',
    borderRadius: '2px 2px 0 0',
    backgroundColor: opptrixCssVars.accent,
    opacity: 0.85,
  },
  klineBarDown: {
    backgroundColor: '#34C759',
    opacity: 0.75,
  },
  muted: {
    fontSize: '12px',
    color: opptrixCssVars.textSecondary,
    lineHeight: 1.5,
  },
  error: {
    fontSize: '12px',
    color: '#C50F1F',
    lineHeight: 1.45,
  },
  foot: {
    fontSize: '11px',
    color: opptrixCssVars.textTertiary,
    lineHeight: 1.4,
  },
})

interface Props {
  stock: WatchlistItem
  market: 'US' | 'CRYPTO'
  localIndexed?: boolean | null
  loading?: boolean
}

function pctClass(s: ReturnType<typeof useStyles>, tone: ReturnType<typeof pctTone>) {
  if (tone === 'up') return s.pctUp
  if (tone === 'down') return s.pctDown
  return s.pctFlat
}

function MiniKline({ bars, className }: { bars: { close: number; changePct: number | null }[]; className: string }) {
  const s = useStyles()
  const values = bars.map(b => b.close).filter(v => Number.isFinite(v))
  if (values.length < 2) return <Text className={s.muted}>暂无 K 线</Text>
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  return (
    <div className={mergeClasses(s.klineRow, className)}>
      {bars.map((bar, i) => {
        const h = Math.max(8, Math.round(((bar.close - min) / span) * 64))
        const down = (bar.changePct ?? 0) < 0
        return (
          <div
            key={`${bar.close}-${i}`}
            className={mergeClasses(s.klineBar, down ? s.klineBarDown : undefined)}
            style={{ height: `${h}px` }}
            title={formatPrice(bar.close)}
          />
        )
      })}
    </div>
  )
}

export default function CrossMarketSnapshotDetail({
  stock,
  market,
  localIndexed = null,
  loading = false,
}: Props) {
  const s = useStyles()
  const ref = resolveWatchlistInstrument(stock)
  const label = marketDisplayName(ref.market)
  const symbol = displayCodeFromInstrument(ref)

  const [snapshot, setSnapshot] = useState<UsSnapshotData | CryptoSnapshotData | null>(null)
  const [fetching, setFetching] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setFetching(true)
    setError(null)
    try {
      const data = market === 'US'
        ? await fetchUsSnapshot(symbol)
        : await fetchCryptoSnapshot(symbol)
      setSnapshot(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : '获取行情失败')
    } finally {
      setFetching(false)
    }
  }, [market, symbol])

  useEffect(() => {
    void load()
    const ms = market === 'CRYPTO' ? 30_000 : 60_000
    const timer = window.setInterval(() => { void load() }, ms)
    return () => window.clearInterval(timer)
  }, [load, market])

  const quote = snapshot && ('quote' in snapshot ? snapshot.quote : null)
  const klines = (snapshot && ('recentKlines' in snapshot ? snapshot.recentKlines : [])) ?? []
  const profile = market === 'US' && snapshot && 'profile' in snapshot ? snapshot.profile : null
  const tone = pctTone(quote?.changePct)
  const priceDigits = market === 'CRYPTO' && (quote?.price ?? 0) < 1 ? 4 : 2

  const industry = useMemo(() => {
    if (!profile || typeof profile !== 'object') return null
    const p = profile as Record<string, unknown>
    return typeof p.industry === 'string' ? p.industry : null
  }, [profile])

  return (
    <div className={s.root}>
      <div className={s.hero}>
        <div className={s.titleRow}>
          <Text className={s.name}>{stock.name || quote?.name || symbol}</Text>
          <span className={s.badge}>{label}</span>
          {market === 'US' && quote?.sessionLabel ? (
            <span className={s.badge}>{quote.sessionLabel}</span>
          ) : null}
        </div>
        <Text size={200} style={{ color: opptrixCssVars.textTertiary }}>
          {formatInstrumentLabel(ref)}
        </Text>
        {loading || (fetching && !quote) ? (
          <Spinner size="tiny" label="正在获取行情…" />
        ) : quote ? (
          <>
            <div className={s.quoteRow}>
              <Text className={s.price}>{formatPrice(quote.price, priceDigits)}</Text>
              <Text className={mergeClasses(s.change, pctClass(s, tone))}>
                {formatSignedNumber(quote.change ?? null, priceDigits)}
              </Text>
              <Text className={mergeClasses(s.change, pctClass(s, tone))}>
                {formatPct(quote.changePct)}
              </Text>
            </div>
            <div className={s.heroGrid}>
              <Text className={s.statLabel}>今开</Text>
              <Text className={s.statValue}>{formatPrice(quote.open ?? null, priceDigits)}</Text>
              <Text className={s.statLabel}>最高</Text>
              <Text className={s.statValue}>{formatPrice(quote.high ?? null, priceDigits)}</Text>
              <Text className={s.statLabel}>最低</Text>
              <Text className={s.statValue}>{formatPrice(quote.low ?? null, priceDigits)}</Text>
              {quote.marketCap != null ? (
                <>
                  <Text className={s.statLabel}>市值</Text>
                  <Text className={s.statValue}>{formatCompactNumber(quote.marketCap)}</Text>
                </>
              ) : null}
              {quote.volume != null ? (
                <>
                  <Text className={s.statLabel}>成交量</Text>
                  <Text className={s.statValue}>{formatCompactNumber(quote.volume)}</Text>
                </>
              ) : null}
              {market === 'US' && quote.preMarketPrice != null && quote.quoteSession === 'pre' ? (
                <>
                  <Text className={s.statLabel}>盘前价</Text>
                  <Text className={s.statValue}>{formatPrice(quote.preMarketPrice, priceDigits)}</Text>
                </>
              ) : null}
              {market === 'US' && quote.postMarketPrice != null && quote.quoteSession === 'post' ? (
                <>
                  <Text className={s.statLabel}>盘后价</Text>
                  <Text className={s.statValue}>{formatPrice(quote.postMarketPrice, priceDigits)}</Text>
                </>
              ) : null}
            </div>
          </>
        ) : error ? (
          <Text className={s.error}>{error}</Text>
        ) : null}
      </div>
      <div className={s.body}>
        {error && quote ? (
          <Text className={s.error}>刷新失败：{error}</Text>
        ) : null}
        <div className={s.card}>
          <Text className={s.cardTitle}>近 10 日走势</Text>
          <MiniKline bars={klines} className="" />
        </div>
        {industry ? (
          <div className={s.card}>
            <Text className={s.cardTitle}>行业</Text>
            <Text className={s.muted}>{industry}</Text>
          </div>
        ) : null}
        {localIndexed === false ? (
          <Text className={s.muted}>
            本地库暂未收录该标的。可在「基础数据 → 市场数据包」中准备对应列表，便于 @ 引用与离线筛选。
          </Text>
        ) : null}
        <Text className={s.foot}>
          {market === 'US'
            ? (quote?.quoteSession === 'pre' || quote?.quoteSession === 'post'
              ? '当前为延长交易时段报价；盘中以常规时段为准。'
              : '美股行情随交易时段更新，约每分钟自动刷新。')
            : 'Crypto 行情 7×24 更新，约每 30 秒自动刷新。'}
        </Text>
      </div>
    </div>
  )
}
