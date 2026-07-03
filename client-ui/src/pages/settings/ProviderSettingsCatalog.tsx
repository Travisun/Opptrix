import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Input,
  Radio,
  RadioGroup,
  Spinner,
  Switch,
  Text,
  makeStyles,
} from '@fluentui/react-components'
import type { ProviderCatalogResponse, PublicProviderRuntime } from '../../types/provider'
import {
  getProviderCatalog,
  saveProviderConfig,
  testProviderConfig,
} from '../../api/client'
import OpptrixButton from '../../components/opptrix/OpptrixButton'
import { SettingsGroup, SettingsCredentialRow, SettingsPanelHeader, SettingsRow } from './SettingsPrimitives'
import ProviderBindingOverridesSection from './ProviderBindingOverridesSection'
import { useSettingsToast } from './SettingsToast'
import { opptrixCssVars } from '../../theme/tokens'

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  groupBlock: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  groupLabel: {
    fontSize: '11px',
    fontWeight: 650,
    color: opptrixCssVars.textTertiary,
    letterSpacing: '0.04em',
    textTransform: 'uppercase',
    padding: '2px 2px 0',
  },
  meta: {
    fontSize: '11px',
    color: opptrixCssVars.textTertiary,
    lineHeight: 1.4,
  },
  priorityRow: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    width: '100%',
  },
  priorityInput: {
    maxWidth: '120px',
  },
  saveRow: {
    display: 'flex',
    justifyContent: 'flex-end',
    padding: '0 18px 10px',
  },
})

function ProviderCard({
  provider,
  onSaved,
}: {
  provider: PublicProviderRuntime
  onSaved: () => void
}) {
  const s = useStyles()
  const toast = useSettingsToast()
  const [enabled, setEnabled] = useState(provider.enabled)
  const [priorityMode, setPriorityMode] = useState(provider.priorityMode)
  const [priority, setPriority] = useState(String(provider.priority ?? provider.manifestDefaultPriority))
  const [token, setToken] = useState('')
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)

  useEffect(() => {
    setEnabled(provider.enabled)
    setPriorityMode(provider.priorityMode)
    setPriority(String(provider.priority ?? provider.manifestDefaultPriority))
    setToken('')
  }, [provider])

  const tokenField = provider.settingsFields.find(f => f.type === 'secret')
  const hasCredential = tokenField != null

  const buildExtra = useCallback(() => {
    const trimmed = token.trim()
    if (!trimmed) return undefined
    return { [tokenField!.key]: trimmed }
  }, [token, tokenField])

  const handleSave = async () => {
    setSaving(true)
    try {
      await saveProviderConfig(provider.providerId, {
        enabled,
        priority_mode: priorityMode,
        priority: priorityMode === 'custom' ? Number(priority) : null,
        extra: buildExtra(),
      })
      toast.showSuccess('已保存')
      onSaved()
    } catch (e) {
      toast.showError(e instanceof Error ? e.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const handleTest = async () => {
    if (!provider.supportsTest) return
    setTesting(true)
    try {
      const extra = buildExtra()
      const resp = await testProviderConfig(provider.providerId, extra)
      const result = resp.data
      if (result?.ok) toast.showSuccess(result.message)
      else toast.showError(`测试失败：${result?.message ?? '未知错误'}`)
    } catch (e) {
      toast.showError(e instanceof Error ? e.message : '测试连接失败')
    } finally {
      setTesting(false)
    }
  }

  const tokenConfigured = tokenField ? provider.secretsConfigured[tokenField.key] : false

  return (
    <SettingsGroup>
      <SettingsPanelHeader
        title={provider.title}
        action={(
          <Switch
            checked={enabled}
            onChange={(_, d) => setEnabled(!!d.checked)}
            aria-label={`启用 ${provider.title}`}
          />
        )}
      />
      {provider.subtitle && (
        <SettingsRow title="说明" desc={provider.subtitle} />
      )}
      <SettingsRow
        title="当前优先级"
        desc={`生效 ${provider.effectivePriority} · 默认 ${provider.manifestDefaultPriority}`}
      />
      <SettingsRow
        title="回退顺序"
        stack
        control={(
          <div className={s.priorityRow}>
            <RadioGroup
              value={priorityMode}
              onChange={(_, d) => setPriorityMode(d.value as 'manifest' | 'custom')}
            >
              <Radio value="manifest" label="跟随默认" />
              <Radio value="custom" label="自定义" />
            </RadioGroup>
            {priorityMode === 'custom' && (
              <Input
                className={s.priorityInput}
                type="number"
                min={0}
                max={200}
                value={priority}
                onChange={(_, d) => setPriority(d.value)}
                aria-label="自定义优先级"
              />
            )}
          </div>
        )}
      />
      {hasCredential && tokenField && (
        <SettingsRow
          title={tokenField.label}
          stack
          control={(
            <SettingsCredentialRow
              value={token}
              onChange={setToken}
              placeholder={tokenField.placeholder ?? '粘贴 Token'}
              testing={testing}
              saving={saving}
              testDisabled={!provider.supportsTest}
              saveDisabled={enabled && !tokenConfigured && !token.trim()}
              onTest={() => { void handleTest() }}
              onSave={() => { void handleSave() }}
            />
          )}
          last
        />
      )}
      {!hasCredential && (
        <div className={s.saveRow}>
          <OpptrixButton variant="secondary" disabled={saving} onClick={() => { void handleSave() }}>
            {saving ? '保存中…' : '保存设置'}
          </OpptrixButton>
        </div>
      )}
      <ProviderBindingOverridesSection providerId={provider.providerId} enabled={enabled} />
    </SettingsGroup>
  )
}

export default function ProviderSettingsCatalog() {
  const s = useStyles()
  const toast = useSettingsToast()
  const [catalog, setCatalog] = useState<ProviderCatalogResponse | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const data = await getProviderCatalog()
      setCatalog(data)
    } catch (e) {
      toast.showError(e instanceof Error ? e.message : '无法读取数据源列表')
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    void refresh()
  }, [refresh])

  const groups = useMemo(() => catalog?.groups ?? [], [catalog])

  if (loading && !catalog) {
    return <Spinner size="tiny" label="加载数据源…" />
  }

  if (!groups.length) {
    return <Text block>暂无已注册的数据源</Text>
  }

  return (
    <div className={s.root}>
      {groups.map(group => (
        <div key={group.marketGroup} className={s.groupBlock}>
          <Text className={s.groupLabel} block>{group.label}</Text>
          {group.providers.map(provider => (
            <ProviderCard key={provider.providerId} provider={provider} onSaved={() => { void refresh() }} />
          ))}
        </div>
      ))}
    </div>
  )
}
