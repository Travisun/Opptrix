import { useMemo } from 'react'
import { Text } from '@fluentui/react-components'
import type { PublicProvider } from '../../api/client'
import type { AvailableModel } from '../../types/chat'
import ModelSelector from '../../chat/ModelSelector'
import { opptrixCssVars } from '../../theme/tokens'

export function buildRemoteModelsFromProviders(providers: PublicProvider[]): AvailableModel[] {
  return providers.flatMap(p =>
    (p.models ?? []).map(model => ({
      ref: `${p.id}:${model}`,
      model,
      providerId: p.id,
      providerName: p.name,
    })),
  )
}

export function parseRemoteModelRef(ref: string): { providerId: string; model: string } | null {
  const colon = ref.indexOf(':')
  if (colon <= 0) return null
  const providerId = ref.slice(0, colon)
  const model = ref.slice(colon + 1)
  if (!providerId || !model) return null
  return { providerId, model }
}

export function remoteModelRef(
  providerId: string | null | undefined,
  model: string | null | undefined,
): string | undefined {
  if (!providerId || !model) return undefined
  return `${providerId}:${model}`
}

/**
 * 设置页远程选模：按提供商分组，一步选定同时写入 provider_id + model（对齐聊天 ModelSelector）。
 */
export default function SettingsRemoteModelSelector({
  providers,
  providerId,
  model,
  disabled,
  onChange,
}: {
  providers: PublicProvider[]
  providerId: string | null
  model: string | null
  disabled?: boolean
  onChange: (next: { providerId: string | null; model: string | null }) => void
}) {
  const models = useMemo(() => {
    const list = buildRemoteModelsFromProviders(providers)
    const current = remoteModelRef(providerId, model)
    if (current && !list.some(m => m.ref === current) && providerId && model) {
      const p = providers.find(x => x.id === providerId)
      list.unshift({
        ref: current,
        model,
        providerId,
        providerName: p?.name ?? providerId,
      })
    }
    return list
  }, [providers, providerId, model])

  const value = remoteModelRef(providerId, model)

  if (!models.length) {
    return (
      <Text style={{
        fontSize: 'var(--opptrix-font-md)',
        color: opptrixCssVars.textTertiary,
        lineHeight: '34px',
        whiteSpace: 'nowrap',
      }}
      >
        暂无可选模型，请先在「模型」页添加
      </Text>
    )
  }

  return (
    <ModelSelector
      models={models}
      value={value}
      disabled={disabled}
      unsetLabel="选择模型"
      showParams={false}
      onChange={(ref) => {
        const parsed = parseRemoteModelRef(ref)
        if (!parsed) {
          onChange({ providerId: null, model: null })
          return
        }
        onChange(parsed)
      }}
    />
  )
}
