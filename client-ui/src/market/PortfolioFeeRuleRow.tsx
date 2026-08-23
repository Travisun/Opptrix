import {
  Input,
  Text,
  makeStyles,
  mergeClasses,
} from '@fluentui/react-components'
import type { FeeCalcMode, FeeRule } from '@opptrix/shared/portfolio-fees'
import OpptrixSelect, { OpptrixOption } from '../components/opptrix/OpptrixSelect'
import { opptrixCssVars } from '../theme/tokens'

const useStyles = makeStyles({
  row: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    padding: '4px 0',
    minWidth: 0,
  },
  head: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    minWidth: 0,
  },
  label: {
    flexShrink: 0,
    width: '56px',
    fontSize: 'var(--opptrix-font-sm)',
    color: opptrixCssVars.textSecondary,
    lineHeight: '18px',
  },
  modeSelect: {
    flex: '1 1 140px',
    minWidth: 0,
  },
  params: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '6px',
    alignItems: 'center',
    minWidth: 0,
    width: '100%',
  },
  paramField: {
    flex: '1 1 100px',
    minWidth: 0,
    maxWidth: '160px',
  },
  hint: {
    fontSize: 'var(--opptrix-font-xs)',
    color: opptrixCssVars.textTertiary,
    lineHeight: 1.4,
    paddingLeft: '64px',
  },
  glassInput: {
    minWidth: 0,
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

export function formatPortfolioFeeRuleHint(rule: FeeRule): string {
  if (rule.mode === 'none') return '不计'
  if (rule.mode === 'rate') return `${((rule.rate ?? 0) * 100).toFixed(3)}%`
  if (rule.mode === 'min_rate') {
    return `${((rule.rate ?? 0) * 100).toFixed(3)}%，最低 ${rule.min ?? 0} 元`
  }
  if (rule.mode === 'fixed') return `每笔 ${rule.fixed ?? 0} 元`
  return ''
}

export default function PortfolioFeeRuleRow({
  label,
  value,
  onChange,
  allowInherit = false,
  globalRule,
}: {
  label: string
  value?: FeeRule
  onChange: (next: FeeRule | undefined) => void
  allowInherit?: boolean
  globalRule?: FeeRule
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
  const inputClass = mergeClasses(s.glassInput, s.paramField, 'opptrix-glass-input')

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

  return (
    <div className={s.row}>
      <div className={s.head}>
        <Text className={s.label}>{label}</Text>
        <OpptrixSelect
          className={mergeClasses(s.modeSelect, 'opptrix-glass-input')}
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
      </div>
      {mode === 'inherit' ? (
        <Text className={s.hint}>默认 {formatPortfolioFeeRuleHint(baseRule)}</Text>
      ) : mode === 'none' ? (
        <Text className={s.hint}>不计入成本</Text>
      ) : (
        <div className={s.params}>
          {(mode === 'rate' || mode === 'min_rate') && (
            <Input
              className={inputClass}
              size="small"
              appearance="filled-darker"
              placeholder="费率 %"
              value={String(((activeRule.rate ?? 0) * 100).toFixed(4)).replace(/\.?0+$/, '')}
              onChange={(_, d) => {
                const pct = Number(d.value)
                if (!Number.isFinite(pct)) return
                patchField({ mode, rate: pct / 100 })
              }}
            />
          )}
          {mode === 'min_rate' && (
            <Input
              className={inputClass}
              size="small"
              appearance="filled-darker"
              placeholder="最低元"
              value={String(activeRule.min ?? 0)}
              onChange={(_, d) => {
                const min = Number(d.value)
                if (!Number.isFinite(min)) return
                patchField({ mode: 'min_rate', min })
              }}
            />
          )}
          {mode === 'fixed' && (
            <Input
              className={inputClass}
              size="small"
              appearance="filled-darker"
              placeholder="每笔元"
              value={String(activeRule.fixed ?? 0)}
              onChange={(_, d) => {
                const fixed = Number(d.value)
                if (!Number.isFinite(fixed)) return
                patchField({ mode: 'fixed', fixed })
              }}
            />
          )}
        </div>
      )}
    </div>
  )
}
