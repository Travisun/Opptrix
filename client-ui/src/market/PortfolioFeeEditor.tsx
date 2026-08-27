import { Text, makeStyles } from '@fluentui/react-components'
import type {
  InstrumentFeeOverrides,
  PortfolioGlobalFees,
  PortfolioLedgerKind,
} from '@opptrix/shared/portfolio-fees'
import {
  marketFeeCurrencyUnit,
  resolveMarketExchangeFees,
} from '@opptrix/shared/portfolio-fees'
import type { Market } from '../types/instrument'
import { opptrixCssVars } from '../theme/tokens'
import PortfolioFeeRuleRow from './PortfolioFeeRuleRow'

type FeeFieldKey =
  | 'commission'
  | 'stampDuty'
  | 'transferFee'
  | 'platformFee'
  | 'subscriptionFee'
  | 'redemptionFee'

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    padding: '4px 0',
    minWidth: 0,
  },
  hint: {
    fontSize: 'var(--opptrix-font-xs)',
    color: opptrixCssVars.textTertiary,
    lineHeight: 1.4,
  },
})

function globalRuleFor(
  ledgerKind: PortfolioLedgerKind,
  key: FeeFieldKey,
  globalFees: PortfolioGlobalFees,
  market?: Market,
) {
  if (ledgerKind === 'exchange') {
    const tpl = resolveMarketExchangeFees(globalFees, market)
    if (key === 'commission') return tpl.commission
    if (key === 'stampDuty') return tpl.stampDuty
    if (key === 'transferFee') return tpl.transferFee
    if (key === 'platformFee') return tpl.platformFee ?? { mode: 'none' as const }
  } else {
    if (key === 'subscriptionFee') return globalFees.otcFund.subscriptionFee
    if (key === 'redemptionFee') return globalFees.otcFund.redemptionFee
  }
  return { mode: 'none' as const }
}

function exchangeFieldsForMarket(market?: Market): Array<{ key: FeeFieldKey; label: string }> {
  if (market === 'US') {
    return [
      { key: 'commission', label: '佣金' },
      { key: 'stampDuty', label: '卖出规费' },
      { key: 'transferFee', label: '交易活动费' },
      { key: 'platformFee', label: '平台费' },
    ]
  }
  if (market === 'HK') {
    return [
      { key: 'commission', label: '佣金' },
      { key: 'stampDuty', label: '印花税' },
      { key: 'transferFee', label: '交易征费' },
    ]
  }
  return [
    { key: 'commission', label: '佣金' },
    { key: 'stampDuty', label: '印花税' },
    { key: 'transferFee', label: '过户费' },
  ]
}

export default function PortfolioFeeEditor({
  ledgerKind,
  market,
  globalFees,
  overrides,
  onChange,
}: {
  ledgerKind: PortfolioLedgerKind
  market?: Market
  globalFees: PortfolioGlobalFees
  overrides: InstrumentFeeOverrides
  onChange: (next: InstrumentFeeOverrides) => void
}) {
  const s = useStyles()
  const currencyUnit = marketFeeCurrencyUnit(market)

  const patch = (key: FeeFieldKey, rule: InstrumentFeeOverrides[FeeFieldKey]) => {
    const next = { ...overrides }
    if (!rule) {
      delete next[key]
    } else {
      next[key] = rule
    }
    onChange(next)
  }

  const otcFields: Array<{ key: FeeFieldKey; label: string }> = [
    { key: 'subscriptionFee', label: '申购费' },
    { key: 'redemptionFee', label: '赎回费' },
  ]
  const fields = ledgerKind === 'exchange' ? exchangeFieldsForMarket(market) : otcFields

  const hint = ledgerKind === 'exchange'
    ? (market === 'US'
      ? '美股卖出时计入规费与交易活动费；未覆盖项沿用对应市场默认。'
      : market === 'HK'
        ? '港股印花税双边收取；未覆盖项沿用对应市场默认。'
        : '场内按交易所规则计费；印花税仅在卖出时计入。')
    : '场外默认不计申赎费，可按基金实际费率单独设置。'

  return (
    <div className={s.root}>
      <Text className={s.hint}>{hint}</Text>
      {fields.map(field => (
        <PortfolioFeeRuleRow
          key={field.key}
          label={field.label}
          value={overrides[field.key]}
          currencyUnit={currencyUnit}
          onChange={rule => patch(field.key, rule)}
          allowInherit
          globalRule={globalRuleFor(ledgerKind, field.key, globalFees, market)}
        />
      ))}
    </div>
  )
}
