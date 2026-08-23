import { Text, makeStyles } from '@fluentui/react-components'
import type {
  InstrumentFeeOverrides,
  PortfolioGlobalFees,
  PortfolioLedgerKind,
} from '@opptrix/shared/portfolio-fees'
import { opptrixCssVars } from '../theme/tokens'
import PortfolioFeeRuleRow from './PortfolioFeeRuleRow'

type FeeFieldKey =
  | 'commission'
  | 'stampDuty'
  | 'transferFee'
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
) {
  if (ledgerKind === 'exchange') {
    if (key === 'commission') return globalFees.exchange.commission
    if (key === 'stampDuty') return globalFees.exchange.stampDuty
    if (key === 'transferFee') return globalFees.exchange.transferFee
  } else {
    if (key === 'subscriptionFee') return globalFees.otcFund.subscriptionFee
    if (key === 'redemptionFee') return globalFees.otcFund.redemptionFee
  }
  return { mode: 'none' as const }
}

export default function PortfolioFeeEditor({
  ledgerKind,
  globalFees,
  overrides,
  onChange,
}: {
  ledgerKind: PortfolioLedgerKind
  globalFees: PortfolioGlobalFees
  overrides: InstrumentFeeOverrides
  onChange: (next: InstrumentFeeOverrides) => void
}) {
  const s = useStyles()

  const patch = (key: FeeFieldKey, rule: InstrumentFeeOverrides[FeeFieldKey]) => {
    const next = { ...overrides }
    if (!rule) {
      delete next[key]
    } else {
      next[key] = rule
    }
    onChange(next)
  }

  const exchangeFields: Array<{ key: FeeFieldKey; label: string }> = [
    { key: 'commission', label: '佣金' },
    { key: 'stampDuty', label: '印花税' },
    { key: 'transferFee', label: '过户费' },
  ]
  const otcFields: Array<{ key: FeeFieldKey; label: string }> = [
    { key: 'subscriptionFee', label: '申购费' },
    { key: 'redemptionFee', label: '赎回费' },
  ]
  const fields = ledgerKind === 'exchange' ? exchangeFields : otcFields

  return (
    <div className={s.root}>
      <Text className={s.hint}>
        {ledgerKind === 'exchange'
          ? '场内按交易所规则计费；印花税仅在卖出时计入。'
          : '场外默认不计申赎费，可按基金实际费率单独设置。'}
      </Text>
      {fields.map(field => (
        <PortfolioFeeRuleRow
          key={field.key}
          label={field.label}
          value={overrides[field.key]}
          onChange={rule => patch(field.key, rule)}
          allowInherit
          globalRule={globalRuleFor(ledgerKind, field.key, globalFees)}
        />
      ))}
    </div>
  )
}
