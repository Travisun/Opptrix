import { Spinner, Text, makeStyles } from '@fluentui/react-components'
import type { WatchlistItem } from '../types/market'
import {
  formatInstrumentLabel,
  marketDisplayName,
  resolveWatchlistInstrument,
  UNRESOLVED_INSTRUMENT_COPY,
} from './instrument'
import { opptrixCssVars, opptrixTokens } from '../theme/tokens'

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
    fontSize: 'var(--opptrix-font-lg)',
    fontWeight: 650,
    color: opptrixCssVars.textPrimary,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  badge: {
    fontSize: 'var(--opptrix-font-xs)',
    fontWeight: 600,
    padding: '2px 8px',
    borderRadius: opptrixTokens.radiusFull,
    backgroundColor: opptrixCssVars.accentSoft,
    color: opptrixCssVars.textSecondary,
    flexShrink: 0,
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
  },
  muted: {
    fontSize: 'var(--opptrix-font-base)',
    color: opptrixCssVars.textSecondary,
    lineHeight: 1.55,
  },
})

interface Props {
  stock: WatchlistItem
  marketLabel?: string
  loading?: boolean
}

export default function CrossMarketDetailPlaceholder({
  stock,
  marketLabel,
  loading = false,
}: Props) {
  const s = useStyles()
  const ref = resolveWatchlistInstrument(stock)
  if (!ref) {
    return (
      <div className={s.root}>
        <div className={s.hero}>
          <div className={s.titleRow}>
            <Text className={s.name}>{stock.name}</Text>
          </div>
          <Text size={200} style={{ color: opptrixCssVars.textTertiary }}>
            {stock.code}
          </Text>
        </div>
        <div className={s.body}>
          <div className={s.card}>
            <Text className={s.muted}>{UNRESOLVED_INSTRUMENT_COPY.hint}</Text>
          </div>
        </div>
      </div>
    )
  }
  const label = marketLabel ?? marketDisplayName(ref.market)

  return (
    <div className={s.root}>
      <div className={s.hero}>
        <div className={s.titleRow}>
          <Text className={s.name}>{stock.name}</Text>
          <span className={s.badge}>{label}</span>
        </div>
        <Text size={200} style={{ color: opptrixCssVars.textTertiary }}>
          {formatInstrumentLabel(ref)}
        </Text>
      </div>
      <div className={s.body}>
        {loading ? (
          <Spinner size="small" label="正在查询标的…" />
        ) : (
          <div className={s.card}>
            <Text className={s.muted}>
              跨市场详情页已就绪；接入行情源后将在此展示概况、K 线与分析模块。
            </Text>
          </div>
        )}
        <Text size={200} style={{ color: opptrixCssVars.textTertiary }}>
          提示：聊天框输入 @ 可引用 US:AAPL、CRYPTO:BTC/USDT 等格式；A 股仍可直接输入 6 位代码。
        </Text>
      </div>
    </div>
  )
}
