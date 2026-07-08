import { useCallback, useEffect, useMemo, useState } from 'react'
import { Spinner, Text, makeStyles, mergeClasses } from '@fluentui/react-components'
import { EditRegular } from '@fluentui/react-icons'
import { fetchCryptoSnapshot, fetchUsSnapshot, research } from '../api/client'
import type { CryptoSnapshotData, UsSnapshotData, WatchlistItem } from '../types/market'
import type { InstrumentRef } from '../types/instrument'
import {
  formatCompactNumber,
  formatCompactNumberForMarket,
  formatPct,
  formatPrice,
  formatPriceForMarket,
  formatSignedNumber,
  pctTone,
} from './format'
import {
  displayCodeFromInstrument,
  formatInstrumentLabel,
  marketDisplayName,
  resolveWatchlistInstrument,
} from './instrument'
import { hasApplicationCapability } from './capabilities'
import { opptrixTokens, opptrixCssVars } from '../theme/tokens'
import { ghostInteractive } from '../theme/mixins'

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
    justifyContent: 'space-between',
    gap: '8px',
    minWidth: 0,
  },
  titleMain: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    minWidth: 0,
    flex: 1,
  },
  manageBtn: {
    border: `1px solid ${opptrixCssVars.separator}`,
    backgroundColor: opptrixCssVars.canvasAlt,
    color: opptrixCssVars.textSecondary,
    borderRadius: opptrixTokens.radiusSm,
    fontSize: '10px',
    fontWeight: 600,
    padding: '3px 7px',
    cursor: 'pointer',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '3px',
    lineHeight: 1.2,
    flexShrink: 0,
    ...ghostInteractive,
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
  instrumentRef?: InstrumentRef
  localIndexed?: boolean | null
  loading?: boolean
  onManage?: () => void
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
            title={fmtPrice(bar.close)}
          />
        )
      })}
    </div>
  )
}

async function loadSnapshot(ref: InstrumentRef): Promise<UsSnapshotData | CryptoSnapshotData> {
  if (hasApplicationCapability(ref, 'snapshot')) {
    const resp = await research.instrumentSnapshot(ref)
    if (resp.success && resp.data && typeof resp.data === 'object') {
      return resp.data as UsSnapshotData | CryptoSnapshotData
    }
  }
  const symbol = displayCodeFromInstrument(ref)
  if (ref.market === 'CRYPTO') return fetchCryptoSnapshot(symbol)
  return fetchUsSnapshot(symbol)
}

export default function CrossMarketSnapshotDetail({
  stock,
  instrumentRef,
  localIndexed = null,
  loading = false,
  onManage,
}: Props) {
  const s = useStyles()
  const ref = instrumentRef ?? resolveWatchlistInstrument(stock)
  const label = marketDisplayName(ref.market)
  const isCrypto = ref.market === 'CRYPTO'

  const [snapshot, setSnapshot] = useState<UsSnapshotData | CryptoSnapshotData | null>(null)
  const [fetching, setFetching] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setFetching(true)
    setError(null)
    try {
      const data = await loadSnapshot(ref)
      setSnapshot(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : '获取行情失败')
    } finally {
      setFetching(false)
    }
  }, [ref])

  useEffect(() => {
    void load()
    const ms = isCrypto ? 30_000 : 60_000
    const timer = window.setInterval(() => { void load() }, ms)
    return () => window.clearInterval(timer)
  }, [load, isCrypto])

  const quote = snapshot && ('quote' in snapshot ? snapshot.quote : null)
  const klines = (snapshot && ('recentKlines' in snapshot ? snapshot.recentKlines : [])) ?? []
  const profile = !isCrypto && snapshot && 'profile' in snapshot ? snapshot.profile : null
  const tone = pctTone(quote?.changePct)
  const priceDigits = isCrypto && (quote?.price ?? 0) < 1 ? 4 : 2
  const fmtPrice = (v: number | null | undefined) => formatPriceForMarket(ref.market, v, priceDigits)

  const industry = useMemo(() => {
    if (!profile || typeof profile !== 'object') return null
    const p = profile as Record<string, unknown>
    return typeof p.industry === 'string' ? p.industry : null
  }, [profile])

  const footnote = isCrypto
    ? 'Crypto 行情 7×24 更新，约每 30 秒自动刷新。'
    : ref.market === 'US'
      ? (quote && 'quoteSession' in quote && (quote.quoteSession === 'pre' || quote.quoteSession === 'post')
        ? '当前为延长交易时段报价；盘中以常规时段为准。'
        : '行情随交易时段更新，约每分钟自动刷新。')
      : `${label}行情来自本地库或在线快照，约每分钟刷新；完整列表同步后可离线筛选与挖掘。`

  return (
    <div className={s.root}>
      <div className={s.hero}>
        <div className={s.titleRow}>
          <div className={s.titleMain}>
            <Text className={s.name}>{stock.name || quote?.name || displayCodeFromInstrument(ref)}</Text>
            <span className={s.badge}>{label}</span>
            {!isCrypto && quote && 'sessionLabel' in quote && quote.sessionLabel ? (
              <span className={s.badge}>{quote.sessionLabel}</span>
            ) : null}
          </div>
          {onManage && (
            <button type="button" className={s.manageBtn} onClick={onManage} aria-label="编辑关注备注">
              <EditRegular fontSize={12} />
              备注
            </button>
          )}
        </div>
        <Text size={200} style={{ color: opptrixCssVars.textTertiary }}>
          {formatInstrumentLabel(ref)}
        </Text>
        {loading || (fetching && !quote) ? (
          <Spinner size="tiny" label="正在获取行情…" />
        ) : quote ? (
          <>
            <div className={s.quoteRow}>
              <Text className={s.price}>{fmtPrice(quote.price)}</Text>
              <Text className={mergeClasses(s.change, pctClass(s, tone))}>
                {formatSignedNumber(quote.change ?? null, priceDigits)}
              </Text>
              <Text className={mergeClasses(s.change, pctClass(s, tone))}>
                {formatPct(quote.changePct)}
              </Text>
            </div>
            <div className={s.heroGrid}>
              <Text className={s.statLabel}>今开</Text>
              <Text className={s.statValue}>{fmtPrice(quote.open ?? null)}</Text>
              <Text className={s.statLabel}>最高</Text>
              <Text className={s.statValue}>{fmtPrice(quote.high ?? null)}</Text>
              <Text className={s.statLabel}>最低</Text>
              <Text className={s.statValue}>{fmtPrice(quote.low ?? null)}</Text>
              {quote.marketCap != null ? (
                <>
                  <Text className={s.statLabel}>市值</Text>
                  <Text className={s.statValue}>{formatCompactNumberForMarket(ref.market, quote.marketCap)}</Text>
                </>
              ) : null}
              {quote.volume != null ? (
                <>
                  <Text className={s.statLabel}>成交量</Text>
                  <Text className={s.statValue}>{formatCompactNumberForMarket(ref.market, quote.volume)}</Text>
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
            在线名录暂未匹配到该代码，请确认代码是否正确；A 股可直接输入 6 位代码，美股/港股可用 US:AAPL、HK:00700 格式引用。
          </Text>
        ) : null}
        <Text className={s.foot}>{footnote}</Text>
      </div>
    </div>
  )
}
