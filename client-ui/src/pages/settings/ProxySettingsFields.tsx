import { makeStyles } from '@fluentui/react-components'
import OpptrixField from '../../components/opptrix/OpptrixField'
import OpptrixInput from '../../components/opptrix/OpptrixInput'
import OpptrixSelect, { OpptrixOption } from '../../components/opptrix/OpptrixSelect'

export type ProviderProxyMode = 'inherit' | 'none' | 'custom'

const PROXY_MODE_OPTIONS: Array<{ value: ProviderProxyMode; label: string }> = [
  { value: 'inherit', label: '跟随系统' },
  { value: 'none', label: '直连（不走代理）' },
  { value: 'custom', label: '自定义代理' },
]

function providerModeHint(mode: ProviderProxyMode): string | undefined {
  if (mode === 'inherit') {
    return '与「常规 → 网络」中的系统代理一致；系统未启用时自动直连。'
  }
  if (mode === 'none') {
    return '始终直连此服务的 API 地址，不使用系统或自定义代理。'
  }
  return undefined
}

const CUSTOM_PROXY_HINT = '仅对本提供商生效'

const SYSTEM_PROXY_HINT =
  '支持 HTTP、HTTPS、SOCKS5，如 http://127.0.0.1:7890'

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
  },
})

export function ProxySettingsFields({
  mode,
  url,
  onModeChange,
  onUrlChange,
  scope,
}: {
  mode: ProviderProxyMode
  url: string
  onModeChange: (mode: ProviderProxyMode) => void
  onUrlChange: (url: string) => void
  /** provider = per-LLM; system = global fallback */
  scope: 'provider' | 'system'
}) {
  const s = useStyles()
  const showUrl = scope === 'system' || mode === 'custom'

  return (
    <div className={s.root}>
      {scope === 'provider' ? (
        <OpptrixField label="网络代理" hint={providerModeHint(mode)}>
          <OpptrixSelect
            value={PROXY_MODE_OPTIONS.find(o => o.value === mode)?.label ?? mode}
            selectedOptions={[mode]}
            onOptionSelect={(_, data) => {
              const next = (data.optionValue ?? 'inherit') as ProviderProxyMode
              onModeChange(next)
            }}
          >
            {PROXY_MODE_OPTIONS.map(o => (
              <OpptrixOption key={o.value} value={o.value}>{o.label}</OpptrixOption>
            ))}
          </OpptrixSelect>
        </OpptrixField>
      ) : null}
      {showUrl ? (
        <OpptrixField
          label="代理地址"
          hint={scope === 'system' ? SYSTEM_PROXY_HINT : CUSTOM_PROXY_HINT}
        >
          <OpptrixInput
            value={url}
            onChange={(_, d) => onUrlChange(d.value ?? '')}
            placeholder="http://127.0.0.1:7890"
            autoComplete="off"
          />
        </OpptrixField>
      ) : null}
    </div>
  )
}
