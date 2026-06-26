import { useMemo } from 'react'
import { Text } from '@fluentui/react-components'
import InnoSelect, { InnoOption } from '../components/inno/InnoSelect'
import type { AvailableModel } from '../types/chat'
import { innoTokens } from '../theme/tokens'

interface ModelSelectorProps {
  models: AvailableModel[]
  value?: string
  disabled?: boolean
  isMobile?: boolean
  onChange: (ref: string) => void
}

function modelLabel(m: AvailableModel) {
  return `${m.providerName} · ${m.model}`
}

export default function ModelSelector({
  models, value, disabled, isMobile, onChange,
}: ModelSelectorProps) {
  const activeRef = useMemo(() => {
    if (value && models.some(m => m.ref === value)) return value
    return models[0]?.ref
  }, [models, value])

  const active = models.find(m => m.ref === activeRef)
  const displayValue = active ? modelLabel(active) : '选择模型'

  if (!models.length) {
    return (
      <Text style={{
        fontSize: 12,
        color: innoTokens.textTertiary,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }}
      >
        未配置模型
      </Text>
    )
  }

  return (
    <div
      className="inno-model-select"
      style={{
        maxWidth: isMobile ? 160 : 220,
        minWidth: isMobile ? 100 : 120,
        flexShrink: 1,
      }}
    >
      <InnoSelect
        value={displayValue}
        selectedOptions={activeRef ? [activeRef] : []}
        disabled={disabled}
        onOptionSelect={(_, d) => {
          if (d.optionValue) onChange(d.optionValue)
        }}
        aria-label="选择对话模型"
      >
        {models.map(m => (
          <InnoOption key={m.ref} value={m.ref} text={modelLabel(m)}>
            {modelLabel(m)}
          </InnoOption>
        ))}
      </InnoSelect>
    </div>
  )
}
