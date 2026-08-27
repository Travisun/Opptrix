import { Text, makeStyles } from '@fluentui/react-components'
import TradingViewChart from '../../market/TradingViewChart'
import { formatPriceWithCurrency } from '../../market/format'
import { opptrixCssVars } from '../../theme/tokens'
import CnChangePill from './CnChangePill'
import CnDashboardPanel from './CnDashboardPanel'
import { CN_DASH } from './cnDashboardTokens'

const useStyles = makeStyles({
  hero: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  heroPrice: {
    fontSize: '32px',
    fontWeight: 700,
    fontVariantNumeric: 'tabular-nums',
    color: opptrixCssVars.textPrimary,
    lineHeight: 1.05,
    letterSpacing: '-0.03em',
  },
  heroMeta: {
    display: 'flex',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: '10px',
  },
  heroNote: {
    fontSize: '11px',
    color: opptrixCssVars.textTertiary,
    lineHeight: 1.35,
  },
  chartWrap: {
    flex: 1,
    minHeight: '240px',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    padding: '4px 8px 8px',
  },
  empty: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '32px 20px',
    fontSize: 'var(--opptrix-font-sm)',
    color: opptrixCssVars.textTertiary,
    textAlign: 'center',
    lineHeight: 1.55,
  },
})

type Props = {
  chartCode: string | null
  title: string
  price?: number | null
  changePct?: number | null
  changeAmt?: number | null
  quoteTime?: string | null
}

export default function CnMarketChartPanel({
  chartCode,
  title,
  price,
  changePct,
  changeAmt,
  quoteTime,
}: Props) {
  const s = useStyles()

  const hero = chartCode ? (
    <div className={s.hero}>
      <span className={s.heroPrice}>
        {price != null ? formatPriceWithCurrency('CN', price, 2) : '—'}
      </span>
      <div className={s.heroMeta}>
        <CnChangePill changePct={changePct} changeAmt={changeAmt} />
        <span className={s.heroNote}>
          {quoteTime ? `报价 ${quoteTime}` : '日 K 走势 · 点击顶部指数切换标的'}
        </span>
      </div>
    </div>
  ) : undefined

  return (
    <CnDashboardPanel
      title={title}
      subtitle="指数走势分析"
      breadcrumb={['市场动态', title]}
      hero={hero}
      fill
    >
      {chartCode ? (
        <div className={s.chartWrap}>
          <TradingViewChart code={chartCode} chartVariant="index" expanded active />
        </div>
      ) : (
        <Text className={s.empty} block>
          点击顶部宽基指数卡片，在此查看走势与报价
        </Text>
      )}
    </CnDashboardPanel>
  )
}
