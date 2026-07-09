import { Spinner, Text, makeStyles, mergeClasses } from '@fluentui/react-components'
import { ArrowSyncRegular } from '@fluentui/react-icons'
import ChromeToolButton from '../../desktop/ChromeToolButton'
import OpptrixButton from '../../components/opptrix/OpptrixButton'
import { electronPlatform } from '../../platform/detect'
import { opptrixTokens, opptrixCssVars } from '../../theme/tokens'
import {
  DESKTOP_SIDEBAR_TOOL_ICON_PADDING,
  DESKTOP_SIDEBAR_TOOL_ICON_SIZE,
  DESKTOP_TITLEBAR_HEIGHT,
} from '../../desktop/constants'
import { formatPct, formatPrice, pctTone } from '../../market/format'
import { MARKET_DOWN, MARKET_UP } from '../../market/chartTheme'
import type { MarketDynamicsSection, MarketIndexQuote } from '../../types/schemas'
import { useMarketDynamics } from './useMarketDynamics'

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
    minWidth: 0,
    minHeight: 0,
    height: '100%',
    backgroundColor: opptrixCssVars.canvas,
    overflow: 'hidden',
  },
  electronTitleBar: {
    flexShrink: 0,
    height: `${DESKTOP_TITLEBAR_HEIGHT}px`,
    boxSizing: 'border-box',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    paddingLeft: '12px',
    borderBottom: `1px solid ${opptrixCssVars.separatorStrong}`,
    backgroundColor: opptrixCssVars.canvas,
    position: 'relative',
  },
  electronTitleBarMac: {
    paddingRight: '12px',
  },
  electronTitleBarWin: {
    paddingRight: '132px',
  },
  titleBarSpacer: {
    flex: 1,
    minWidth: 0,
  },
  titleBarPageTitle: {
    fontSize: '13px',
    fontWeight: 500,
    letterSpacing: '-0.01em',
    color: opptrixCssVars.textPrimary,
    flexShrink: 0,
    whiteSpace: 'nowrap',
  },
  titleBarMeta: {
    fontSize: '11px',
    color: opptrixCssVars.textTertiary,
    flexShrink: 0,
    whiteSpace: 'nowrap',
  },
  titleBarActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    flexShrink: 0,
  },
  webHead: {
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '10px 16px',
    borderBottom: `1px solid ${opptrixCssVars.separatorStrong}`,
  },
  webTitle: {
    fontSize: '15px',
    fontWeight: 650,
    color: opptrixCssVars.textPrimary,
    flex: 1,
  },
  toolbarMeta: {
    fontSize: '11px',
    color: opptrixCssVars.textTertiary,
    flexShrink: 0,
  },
  body: {
    flex: 1,
    minHeight: 0,
    overflowY: 'auto',
    padding: '16px',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  loadingWrap: {
    flex: 1,
    minHeight: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorBanner: {
    padding: '10px 12px',
    borderRadius: opptrixTokens.radiusMd,
    backgroundColor: opptrixCssVars.errorSoft,
    color: opptrixCssVars.error,
    fontSize: '13px',
    lineHeight: 1.5,
  },
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  sectionHead: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  sectionTitle: {
    fontSize: '13px',
    fontWeight: 600,
    color: opptrixCssVars.textPrimary,
  },
  sectionHint: {
    fontSize: '12px',
    color: opptrixCssVars.textTertiary,
    lineHeight: 1.45,
  },
  spotlightRow: {
    display: 'flex',
    gap: '8px',
    overflowX: 'auto',
    paddingBottom: '2px',
  },
  spotlightCard: {
    flex: '0 0 148px',
    padding: '12px',
    borderRadius: opptrixTokens.radiusLg,
    backgroundColor: opptrixCssVars.surface,
    border: `1px solid ${opptrixCssVars.border}`,
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    minWidth: 0,
  },
  tableCard: {
    borderRadius: opptrixTokens.radiusLg,
    backgroundColor: opptrixCssVars.surface,
    border: `1px solid ${opptrixCssVars.border}`,
    overflow: 'hidden',
  },
  tableHead: {
    display: 'grid',
    gridTemplateColumns: '1fr 88px 72px 72px',
    gap: '8px',
    padding: '8px 12px',
    fontSize: '11px',
    fontWeight: 600,
    color: opptrixCssVars.textTertiary,
    borderBottom: `1px solid ${opptrixCssVars.separator}`,
    backgroundColor: opptrixCssVars.surfaceMuted,
  },
  tableRow: {
    display: 'grid',
    gridTemplateColumns: '1fr 88px 72px 72px',
    gap: '8px',
    padding: '9px 12px',
    fontSize: '13px',
    color: opptrixCssVars.textPrimary,
    borderBottom: `1px solid ${opptrixCssVars.separator}`,
    alignItems: 'center',
    ':last-child': {
      borderBottom: 'none',
    },
  },
  nameCell: {
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '1px',
  },
  nameMain: {
    fontWeight: 500,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  nameMeta: {
    fontSize: '11px',
    color: opptrixCssVars.textTertiary,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  numCell: {
    textAlign: 'right',
    fontVariantNumeric: 'tabular-nums',
  },
  pctUp: { color: MARKET_UP },
  pctDown: { color: MARKET_DOWN },
  pctFlat: { color: opptrixCssVars.textSecondary },
  cardName: {
    fontSize: '12px',
    fontWeight: 500,
    color: opptrixCssVars.textPrimary,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  cardPrice: {
    fontSize: '18px',
    fontWeight: 600,
    fontVariantNumeric: 'tabular-nums',
    color: opptrixCssVars.textPrimary,
  },
  cardPct: {
    fontSize: '12px',
    fontWeight: 500,
    fontVariantNumeric: 'tabular-nums',
  },
  empty: {
    padding: '32px 16px',
    textAlign: 'center',
    fontSize: '13px',
    color: opptrixCssVars.textTertiary,
    lineHeight: 1.6,
  },
})

type Props = {
  electronChrome?: boolean
}

function pctClass(s: ReturnType<typeof useStyles>, value: number | null | undefined) {
  const tone = pctTone(value)
  if (tone === 'up') return s.pctUp
  if (tone === 'down') return s.pctDown
  return s.pctFlat
}

function formatIndexPrice(item: MarketIndexQuote): string {
  if (item.price == null) return '—'
  if (item.market === 'futures' || (item.price > 0 && item.price < 10)) {
    return formatPrice(item.price, 2)
  }
  return formatPrice(item.price, 2)
}

function IndexTable({ section }: { section: MarketDynamicsSection }) {
  const s = useStyles()
  const showLocation = section.id !== 'cn_major' && section.id !== 'spotlight'

  return (
    <div className={s.tableCard}>
      <div className={s.tableHead}>
        <span>指数</span>
        <span className={s.numCell}>最新</span>
        <span className={s.numCell}>涨跌</span>
        <span className={s.numCell}>涨跌幅</span>
      </div>
      {section.items.map(item => {
        const key = item.qt_code || item.code || item.name
        const meta = [
          showLocation ? item.location : null,
          item.trade_state_label,
          item.quote_time,
        ].filter(Boolean).join(' · ')
        return (
          <div key={key} className={s.tableRow}>
            <div className={s.nameCell}>
              <span className={s.nameMain}>{item.name}</span>
              {meta ? <span className={s.nameMeta}>{meta}</span> : null}
            </div>
            <span className={s.numCell}>{formatIndexPrice(item)}</span>
            <span className={mergeClasses(s.numCell, pctClass(s, item.change_amt ?? item.change_pct))}>
              {item.change_amt != null
                ? `${item.change_amt > 0 ? '+' : ''}${item.change_amt.toFixed(2)}`
                : '—'}
            </span>
            <span className={mergeClasses(s.numCell, pctClass(s, item.change_pct))}>
              {formatPct(item.change_pct)}
            </span>
          </div>
        )
      })}
    </div>
  )
}

function SpotlightRow({ items }: { items: MarketIndexQuote[] }) {
  const s = useStyles()
  return (
    <div className={mergeClasses(s.spotlightRow, 'opptrix-scroll', 'opptrix-scroll-hover')}>
      {items.map(item => {
        const key = item.qt_code || item.code || item.name
        return (
          <div key={key} className={s.spotlightCard}>
            <span className={s.cardName}>{item.name}</span>
            <span className={s.cardPrice}>{formatIndexPrice(item)}</span>
            <span className={mergeClasses(s.cardPct, pctClass(s, item.change_pct))}>
              {formatPct(item.change_pct)}
            </span>
          </div>
        )
      })}
    </div>
  )
}

function MarketDynamicsContent({ electronChrome = false }: Props) {
  const s = useStyles()
  const { data, loading, refreshing, error, refreshedAt, refresh } = useMarketDynamics()

  const updatedLabel = refreshedAt
    ? new Date(refreshedAt).toLocaleString('zh-CN', {
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
    : null

  const statusLabel = refreshing
    ? '刷新中…'
    : updatedLabel
      ? `更新 ${updatedLabel}`
      : '尚未刷新'

  const electronWin = electronChrome && electronPlatform() !== 'darwin'

  const electronTitleBar = electronChrome ? (
    <div
      className={mergeClasses(
        s.electronTitleBar,
        'opptrix-market-dynamics-title-bar',
        electronWin ? s.electronTitleBarWin : s.electronTitleBarMac,
      )}
    >
      <Text className={mergeClasses(s.titleBarPageTitle, 'opptrix-panel-title-no-drag')} block>
        市场动态
      </Text>
      <div className={mergeClasses(s.titleBarSpacer, 'opptrix-market-dynamics-title-drag')} aria-hidden />
      <Text className={mergeClasses(s.titleBarMeta, 'opptrix-panel-title-no-drag')}>{statusLabel}</Text>
      <div className={mergeClasses(s.titleBarActions, 'opptrix-panel-title-no-drag')}>
        <ChromeToolButton
          label="刷新行情"
          iconPadding={DESKTOP_SIDEBAR_TOOL_ICON_PADDING}
          disabled={refreshing}
          onClick={() => { void refresh() }}
        >
          <ArrowSyncRegular fontSize={DESKTOP_SIDEBAR_TOOL_ICON_SIZE} />
        </ChromeToolButton>
      </div>
    </div>
  ) : null

  const webHead = !electronChrome ? (
    <div className={s.webHead}>
      <Text className={s.webTitle} block>市场动态</Text>
      {updatedLabel && <Text className={s.toolbarMeta}>更新 {updatedLabel}</Text>}
      <OpptrixButton
        variant="secondary"
        icon={<ArrowSyncRegular />}
        disabled={refreshing}
        onClick={() => { void refresh() }}
      >
        {refreshing ? '刷新中…' : '刷新行情'}
      </OpptrixButton>
    </div>
  ) : null

  const sections = data?.sections ?? []
  const hasData = sections.some(sec => sec.items.length > 0)

  return (
    <div className={mergeClasses(s.root, 'opptrix-market-dynamics')}>
      {electronTitleBar}
      {webHead}

      {loading && !hasData ? (
        <div className={s.loadingWrap}>
          <Spinner size="medium" label="正在获取全球市场指数…" />
        </div>
      ) : (
        <div className={mergeClasses(s.body, 'opptrix-scroll', 'opptrix-scroll-hover')}>
          {error && !hasData && <div className={s.errorBanner}>{error}</div>}
          {error && hasData && (
            <div className={s.errorBanner}>部分数据可能不是最新：{error}</div>
          )}

          {!hasData && !loading && !error && (
            <div className={s.empty}>暂无市场指数数据，请稍后再试</div>
          )}

          {sections.map(section => (
            <section key={section.id} className={s.section}>
              <div className={s.sectionHead}>
                <Text className={s.sectionTitle} block>{section.title}</Text>
                {section.hint ? (
                  <Text className={s.sectionHint} block>{section.hint}</Text>
                ) : null}
              </div>
              {section.id === 'spotlight'
                ? <SpotlightRow items={section.items} />
                : <IndexTable section={section} />}
            </section>
          ))}
        </div>
      )}
    </div>
  )
}

export default function MarketDynamicsPage(props: Props) {
  return <MarketDynamicsContent {...props} />
}
