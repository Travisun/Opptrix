import { Text, makeStyles } from '@fluentui/react-components'
import type { FeeRule, PortfolioGlobalFees } from '@opptrix/shared/portfolio-fees'
import { opptrixCssVars } from '../theme/tokens'
import PortfolioFeeRuleRow from './PortfolioFeeRuleRow'

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
    minWidth: 0,
  },
  block: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    minWidth: 0,
  },
  blockTitle: {
    fontSize: 'var(--opptrix-font-md)',
    fontWeight: 400,
    color: opptrixCssVars.textSecondary,
    lineHeight: '16px',
  },
  hint: {
    fontSize: 'var(--opptrix-font-xs)',
    color: opptrixCssVars.textTertiary,
    lineHeight: 1.4,
  },
})

export default function PortfolioGlobalFeeEditor({
  value,
  onChange,
}: {
  value: PortfolioGlobalFees
  onChange: (next: PortfolioGlobalFees) => void
}) {
  const s = useStyles()

  const patchExchange = (key: 'commission' | 'stampDuty' | 'transferFee', rule: FeeRule) => {
    onChange({
      ...value,
      exchange: { ...value.exchange, [key]: rule },
    })
  }

  const patchOtc = (key: 'subscriptionFee' | 'redemptionFee', rule: FeeRule) => {
    onChange({
      ...value,
      otcFund: { ...value.otcFund, [key]: rule },
    })
  }

  return (
    <div className={s.root}>
      <div className={s.block}>
        <Text className={s.blockTitle}>场内交易（股票、ETF、场内基金）</Text>
        <Text className={s.hint}>印花税仅在卖出时计入；未单独设置的标的沿用此处默认值。</Text>
        <PortfolioFeeRuleRow
          label="佣金"
          value={value.exchange.commission}
          onChange={rule => rule && patchExchange('commission', rule)}
        />
        <PortfolioFeeRuleRow
          label="印花税"
          value={value.exchange.stampDuty}
          onChange={rule => rule && patchExchange('stampDuty', rule)}
        />
        <PortfolioFeeRuleRow
          label="过户费"
          value={value.exchange.transferFee}
          onChange={rule => rule && patchExchange('transferFee', rule)}
        />
      </div>
      <div className={s.block}>
        <Text className={s.blockTitle}>场外基金</Text>
        <Text className={s.hint}>申购费在买入时计入，赎回费在卖出时计入。</Text>
        <PortfolioFeeRuleRow
          label="申购费"
          value={value.otcFund.subscriptionFee}
          onChange={rule => rule && patchOtc('subscriptionFee', rule)}
        />
        <PortfolioFeeRuleRow
          label="赎回费"
          value={value.otcFund.redemptionFee}
          onChange={rule => rule && patchOtc('redemptionFee', rule)}
        />
      </div>
    </div>
  )
}
