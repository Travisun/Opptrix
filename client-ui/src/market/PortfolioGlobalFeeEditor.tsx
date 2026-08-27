import { useState } from 'react'
import { Text, makeStyles } from '@fluentui/react-components'
import type { ExchangeFeeTemplate, FeeRule, PortfolioGlobalFees } from '@opptrix/shared/portfolio-fees'
import { marketFeeCurrencyUnit } from '@opptrix/shared/portfolio-fees'
import OpptrixSegmentedControl from '../components/opptrix/OpptrixSegmentedControl'
import { opptrixCssVars } from '../theme/tokens'
import {
  SettingsGroup,
  SettingsRow,
} from '../pages/settings/SettingsPrimitives'
import { PortfolioFeeRuleControl } from './PortfolioFeeRuleRow'

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    minWidth: 0,
  },
  tabRow: {
    width: '100%',
    minWidth: 0,
  },
  hint: {
    fontSize: 'var(--opptrix-font-base)',
    color: opptrixCssVars.textSecondary,
    lineHeight: '18px',
    padding: '0 2px',
  },
})

type MarketKey = 'cn' | 'us' | 'hk'
type FeeTab = MarketKey | 'otc'

const TAB_OPTIONS: Array<{ value: FeeTab; label: string }> = [
  { value: 'cn', label: 'A 股' },
  { value: 'us', label: '美股' },
  { value: 'hk', label: '港股' },
  { value: 'otc', label: '场外基金' },
]

const MARKET_BLOCKS: Record<MarketKey, {
  hint: string
  fields: Array<{ key: keyof ExchangeFeeTemplate; label: string }>
}> = {
  cn: {
    hint: '适用于股票、ETF、场内基金。印花税仅在卖出时计入；未单独设置的标的沿用此处默认值。',
    fields: [
      { key: 'commission', label: '佣金' },
      { key: 'stampDuty', label: '印花税' },
      { key: 'transferFee', label: '过户费' },
    ],
  },
  us: {
    hint: '卖出时计入规费与交易活动费；可按券商实际费率调整。',
    fields: [
      { key: 'commission', label: '佣金' },
      { key: 'stampDuty', label: '卖出规费' },
      { key: 'transferFee', label: '交易活动费' },
      { key: 'platformFee', label: '平台费' },
    ],
  },
  hk: {
    hint: '印花税按成交额双边收取；交易征费含证监会与财汇局征费。',
    fields: [
      { key: 'commission', label: '佣金' },
      { key: 'stampDuty', label: '印花税' },
      { key: 'transferFee', label: '交易征费' },
    ],
  },
}

const OTC_BLOCK = {
  hint: '申购费在买入时计入，赎回费在卖出时计入。',
  fields: [
    { key: 'subscriptionFee' as const, label: '申购费' },
    { key: 'redemptionFee' as const, label: '赎回费' },
  ],
}

const MARKET_FOR_UNIT: Record<MarketKey, 'CN' | 'US' | 'HK'> = {
  cn: 'CN',
  us: 'US',
  hk: 'HK',
}

export default function PortfolioGlobalFeeEditor({
  value,
  onChange,
}: {
  value: PortfolioGlobalFees
  onChange: (next: PortfolioGlobalFees) => void
}) {
  const s = useStyles()
  const [tab, setTab] = useState<FeeTab>('cn')

  const patchExchange = (
    market: MarketKey,
    key: keyof ExchangeFeeTemplate,
    rule: FeeRule,
  ) => {
    onChange({
      ...value,
      [market]: { ...value[market], [key]: rule },
    })
  }

  const patchOtc = (key: 'subscriptionFee' | 'redemptionFee', rule: FeeRule) => {
    onChange({
      ...value,
      otcFund: { ...value.otcFund, [key]: rule },
    })
  }

  const marketBlock = tab !== 'otc' ? MARKET_BLOCKS[tab] : null
  const hint = tab === 'otc' ? OTC_BLOCK.hint : MARKET_BLOCKS[tab].hint

  return (
    <div className={s.root}>
      <div className={s.tabRow}>
        <OpptrixSegmentedControl
          value={tab}
          onChange={setTab}
          variant="embedded"
          aria-label="组合费率市场"
          options={TAB_OPTIONS}
        />
      </div>

      <div
        role="tabpanel"
        aria-label={tab === 'otc' ? '场外基金费率' : '场内交易费率'}
      >
        <Text className={s.hint} block>{hint}</Text>

        <SettingsGroup>
          {tab === 'otc' ? (
            OTC_BLOCK.fields.map((field, index) => (
              <SettingsRow
                key={field.key}
                title={field.label}
                stack
                last={index === OTC_BLOCK.fields.length - 1}
                control={(
                  <PortfolioFeeRuleControl
                    variant="settings"
                    currencyUnit="元"
                    value={value.otcFund[field.key]}
                    onChange={next => next && patchOtc(field.key, next)}
                  />
                )}
              />
            ))
          ) : marketBlock?.fields.map((field, index) => {
              const rule = value[tab][field.key]
              if (!rule) return null
              return (
                <SettingsRow
                  key={field.key}
                  title={field.label}
                  stack
                  last={index === marketBlock.fields.length - 1}
                  control={(
                    <PortfolioFeeRuleControl
                      variant="settings"
                      currencyUnit={marketFeeCurrencyUnit(MARKET_FOR_UNIT[tab])}
                      value={rule}
                      onChange={next => next && patchExchange(tab, field.key, next)}
                    />
                  )}
                />
              )
            })}
        </SettingsGroup>
      </div>
    </div>
  )
}
