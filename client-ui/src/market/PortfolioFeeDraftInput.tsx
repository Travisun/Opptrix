import { useEffect, useRef, useState } from 'react'
import { Input } from '@fluentui/react-components'
import { SettingsInlineInput } from '../pages/settings/SettingsPrimitives'
import {
  formatFeeAmountInput,
  formatFeeRatePercentInput,
  isAllowedDecimalDraft,
  parseFeeAmountInput,
  parseFeeRatePercentInput,
} from './portfolioFeeInput'

type DraftKind = 'ratePercent' | 'amount'

function formatForKind(kind: DraftKind, value: number | undefined): string {
  return kind === 'ratePercent'
    ? formatFeeRatePercentInput(value)
    : formatFeeAmountInput(value)
}

function parseForKind(kind: DraftKind, raw: string): number | null {
  return kind === 'ratePercent'
    ? parseFeeRatePercentInput(raw)
    : parseFeeAmountInput(raw)
}

export default function PortfolioFeeDraftInput({
  kind,
  value,
  onCommit,
  placeholder,
  className,
}: {
  kind: DraftKind
  value: number | undefined
  onCommit: (next: number) => void
  placeholder: string
  className?: string
}) {
  const [draft, setDraft] = useState(() => formatForKind(kind, value))
  const [focused, setFocused] = useState(false)
  const valueRef = useRef(value)

  useEffect(() => {
    valueRef.current = value
    if (!focused) {
      setDraft(formatForKind(kind, value))
    }
  }, [kind, value, focused])

  const commitDraft = (raw: string) => {
    const parsed = parseForKind(kind, raw)
    if (parsed != null) {
      onCommit(parsed)
      setDraft(formatForKind(kind, parsed))
      return
    }
    setDraft(formatForKind(kind, valueRef.current))
  }

  return (
    <div className={className}>
      <SettingsInlineInput>
        <Input
          className="opptrix-settings-field-input"
          size="small"
          appearance="filled-darker"
          placeholder={placeholder}
          inputMode="decimal"
          value={draft}
          onFocus={() => {
            setFocused(true)
            setDraft(formatForKind(kind, valueRef.current))
          }}
          onBlur={() => {
            setFocused(false)
            commitDraft(draft)
          }}
          onChange={(_, data) => {
            const raw = data.value
            if (!isAllowedDecimalDraft(raw)) return
            setDraft(raw)
            const parsed = parseForKind(kind, raw)
            if (parsed != null) onCommit(parsed)
          }}
        />
      </SettingsInlineInput>
    </div>
  )
}
