import {
  Text,
  makeStyles,
  mergeClasses,
} from '@fluentui/react-components'
import type { FeeCalcMode, FeeRule } from '@opptrix/shared/portfolio-fees'
import OpptrixSelect, { OpptrixOption } from '../components/opptrix/OpptrixSelect'
import { opptrixCssVars } from '../theme/tokens'
import PortfolioFeeDraftInput from './PortfolioFeeDraftInput'
import { describeFeeRateCalc } from './portfolioFeeInput'

const useStyles = makeStyles({
  compactRoot: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    padding: '4px 0',
    minWidth: 0,
  },
  compactHead: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    minWidth: 0,
  },
  compactLabel: {
    flexShrink: 0,
    width: '64px',
    fontSize: 'var(--opptrix-font-sm)',
    color: opptrixCssVars.textSecondary,
    lineHeight: '18px',
  },
  compactParams: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
    minWidth: 0,
    width: '100%',
    paddingLeft: '72px',
    boxSizing: 'border-box',
    '@media (max-width: 520px)': {
      paddingLeft: 0,
    },
  },
  settingsControl: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
    justifyContent: 'flex-end',
    width: '100%',
    minWidth: 0,
  },
  modeSelect: {
    minWidth: '118px',
    maxWidth: '132px',
  },
  paramInput: {
    minWidth: '96px',
    maxWidth: '132px',
  },
  hint: {
    fontSize: 'var(--opptrix-font-xs)',
    color: opptrixCssVars.textTertiary,
    lineHeight: 1.4,
  },
  compactHint: {
    paddingLeft: '72px',
    '@media (max-width: 520px)': {
      paddingLeft: 0,
    },
  },
  settingsHint: {
    flexBasis: '100%',
    textAlign: 'right',
  },
})

const GLOBAL_MODE_OPTIONS: Array<{ value: FeeCalcMode; label: string }> = [
  { value: 'none', label: '不计' },
  { value: 'rate', label: '比例' },
  { value: 'min_rate', label: '比例+最低' },
  { value: 'fixed', label: '固定' },
]

const INSTRUMENT_MODE_OPTIONS: Array<{ value: FeeCalcMode; label: string }> = [
  { value: 'inherit', label: '默认' },
  ...GLOBAL_MODE_OPTIONS,
]

export function formatPortfolioFeeRuleHint(rule: FeeRule, currencyUnit = '元'): string {
  if (rule.mode === 'none') return '不计'
  if (rule.mode === 'rate') return `${((rule.rate ?? 0) * 100).toFixed(3)}%`
  if (rule.mode === 'min_rate') {
    return `${((rule.rate ?? 0) * 100).toFixed(3)}%，最低 ${rule.min ?? 0} ${currencyUnit}`
  }
  if (rule.mode === 'fixed') return `每笔 ${rule.fixed ?? 0} ${currencyUnit}`
  return ''
}

export function PortfolioFeeRuleControl({
  value,
  onChange,
  allowInherit = false,
  globalRule,
  currencyUnit = '元',
  variant = 'compact',
  label,
}: {
  value?: FeeRule
  onChange: (next: FeeRule | undefined) => void
  allowInherit?: boolean
  globalRule?: FeeRule
  currencyUnit?: string
  variant?: 'settings' | 'compact'
  label?: string
}) {
  const s = useStyles()
  const mode: FeeCalcMode = allowInherit
    ? (value?.mode ?? 'inherit')
    : (value?.mode === 'inherit' ? 'none' : value?.mode ?? 'none')
  const baseRule = globalRule ?? { mode: 'none' as FeeCalcMode }
  const activeRule = mode === 'inherit'
    ? baseRule
    : (value?.mode && value.mode !== 'inherit' ? value : { ...baseRule, mode })

  const modeOptions = allowInherit ? INSTRUMENT_MODE_OPTIONS : GLOBAL_MODE_OPTIONS

  const patchMode = (nextMode: FeeCalcMode) => {
    if (allowInherit && nextMode === 'inherit') {
      onChange(undefined)
      return
    }
    if (nextMode === 'none') onChange({ mode: 'none' })
    else if (nextMode === 'rate') onChange({ mode: 'rate', rate: activeRule.rate ?? 0 })
    else if (nextMode === 'min_rate') {
      onChange({ mode: 'min_rate', rate: activeRule.rate ?? 0, min: activeRule.min ?? 0 })
    } else onChange({ mode: 'fixed', fixed: activeRule.fixed ?? 0 })
  }

  const patchField = (patch: Partial<FeeRule>) => {
    onChange({ ...activeRule, ...patch })
  }

  const modeSelect = (
    <OpptrixSelect
      className={s.modeSelect}
      size="small"
      selectedOptions={[mode]}
      onOptionSelect={(_, data) => {
        const next = data.optionValue as FeeCalcMode
        if (next) patchMode(next)
      }}
    >
      {modeOptions.map(opt => (
        <OpptrixOption key={opt.value} value={opt.value}>{opt.label}</OpptrixOption>
      ))}
    </OpptrixSelect>
  )

  const paramInput = (
    kind: 'ratePercent' | 'amount',
    placeholder: string,
    numericValue: number | undefined,
    onCommit: (next: number) => void,
  ) => (
    <PortfolioFeeDraftInput
      className={s.paramInput}
      kind={kind}
      value={numericValue}
      placeholder={placeholder}
      onCommit={onCommit}
    />
  )

  const params = mode === 'rate' || mode === 'min_rate' || mode === 'fixed' ? (
    <>
      {(mode === 'rate' || mode === 'min_rate') && paramInput(
        'ratePercent',
        '如 0.025',
        activeRule.rate,
        rate => patchField({ mode, rate }),
      )}
      {mode === 'min_rate' && paramInput(
        'amount',
        `最低 ${currencyUnit}`,
        activeRule.min,
        min => patchField({ mode: 'min_rate', min }),
      )}
      {mode === 'fixed' && paramInput(
        'amount',
        `每笔 ${currencyUnit}`,
        activeRule.fixed,
        fixed => patchField({ mode: 'fixed', fixed }),
      )}
    </>
  ) : null

  const calcHint = (mode === 'rate' || mode === 'min_rate')
    ? describeFeeRateCalc(currencyUnit)
    : null

  const hintText = mode === 'inherit'
    ? `默认 ${formatPortfolioFeeRuleHint(baseRule, currencyUnit)}`
    : mode === 'none'
      ? '不计入成本'
      : null

  if (variant === 'settings') {
    return (
      <div className={s.settingsControl}>
        {modeSelect}
        {params}
        {hintText && (
          <Text className={mergeClasses(s.hint, s.settingsHint)} block>{hintText}</Text>
        )}
        {calcHint && (
          <Text className={mergeClasses(s.hint, s.settingsHint)} block>{calcHint}</Text>
        )}
      </div>
    )
  }

  return (
    <div className={s.compactRoot}>
      <div className={s.compactHead}>
        {label ? <Text className={s.compactLabel}>{label}</Text> : null}
        {modeSelect}
      </div>
      {hintText && (
        <Text className={mergeClasses(s.hint, s.compactHint)} block>{hintText}</Text>
      )}
      {calcHint && (
        <Text className={mergeClasses(s.hint, s.compactHint)} block>{calcHint}</Text>
      )}
      {params && <div className={s.compactParams}>{params}</div>}
    </div>
  )
}

export default function PortfolioFeeRuleRow({
  label,
  value,
  onChange,
  allowInherit = false,
  globalRule,
  currencyUnit = '元',
}: {
  label: string
  value?: FeeRule
  onChange: (next: FeeRule | undefined) => void
  allowInherit?: boolean
  globalRule?: FeeRule
  currencyUnit?: string
}) {
  return (
    <PortfolioFeeRuleControl
      label={label}
      value={value}
      onChange={onChange}
      allowInherit={allowInherit}
      globalRule={globalRule}
      currencyUnit={currencyUnit}
      variant="compact"
    />
  )
}
