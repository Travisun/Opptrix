import { useEffect, useMemo, useState } from 'react'
import {
  Input,
  Switch,
  Text,
  makeStyles,
} from '@fluentui/react-components'
import type { ProviderSettingsField, PublicProviderRuntime } from '../../types/provider'
import { saveProviderConfig, testProviderConfig } from '../../api/client'
import { SettingsCredentialRow } from './SettingsPrimitives'
import { useSettingsToast } from './SettingsToast'
import OpptrixSelect, { OpptrixOption } from '../../components/opptrix/OpptrixSelect'
import OpptrixButton from '../../components/opptrix/OpptrixButton'
import { opptrixCssVars } from '../../theme/tokens'

/** Row header already has the enable Switch — skip duplicate schema field. */
export function isExpandableSettingsField(field: ProviderSettingsField): boolean {
  return !(field.type === 'boolean' && field.key === 'enabled')
}

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    width: '100%',
  },
  fieldBlock: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  fieldLabel: {
    fontSize: '12px',
    fontWeight: 600,
    color: opptrixCssVars.textPrimary,
    lineHeight: 1.35,
  },
  fieldDesc: {
    fontSize: '11px',
    color: opptrixCssVars.textTertiary,
    lineHeight: 1.45,
  },
  inlineControl: {
    width: '100%',
  },
  secretBlock: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  actions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '8px',
    paddingTop: '2px',
  },
})

function fieldConfigured(provider: PublicProviderRuntime, field: ProviderSettingsField): boolean {
  if (field.type === 'secret') {
    return provider.secretsConfigured[field.key] === true
  }
  const value = provider.values[field.key]
  if (field.type === 'boolean') return typeof value === 'boolean'
  if (field.type === 'number') return value != null && value !== ''
  return String(value ?? '').trim().length > 0
}

function missingRequiredLabel(provider: PublicProviderRuntime, fields: ProviderSettingsField[]): string | null {
  const missing = fields.filter(f => f.required && !fieldConfigured(provider, f))
  if (!missing.length) return null
  if (missing.length === 1) return `请先填写「${missing[0]!.label}」`
  return `还有 ${missing.length} 项必填尚未完成`
}

function isExtraStorageField(field: ProviderSettingsField): boolean {
  return field.key !== 'enabled'
}

function readSecretValues(provider: PublicProviderRuntime): Record<string, string> {
  const out: Record<string, string> = {}
  for (const field of provider.settingsFields) {
    if (field.type !== 'secret' || !provider.secretsConfigured[field.key]) continue
    const raw = String(provider.values[field.key] ?? '').trim()
    if (raw) out[field.key] = raw
  }
  return out
}

export function ProviderSettingsForm({
  provider,
  onSaved,
}: {
  provider: PublicProviderRuntime
  onSaved: () => void
}) {
  const s = useStyles()
  const toast = useSettingsToast()
  const [draft, setDraft] = useState<Record<string, unknown>>(() => ({ ...provider.values }))
  const [secrets, setSecrets] = useState<Record<string, string>>(() => readSecretValues(provider))
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)

  useEffect(() => {
    setDraft({ ...provider.values })
    setSecrets(readSecretValues(provider))
  }, [provider])

  const extraStorageFields = useMemo(
    () => provider.settingsFields.filter(isExtraStorageField),
    [provider.settingsFields],
  )

  const secretFields = useMemo(
    () => extraStorageFields.filter(f => f.type === 'secret'),
    [extraStorageFields],
  )
  const plainFields = useMemo(
    () => extraStorageFields.filter(f => f.type !== 'secret' && isExpandableSettingsField(f)),
    [extraStorageFields],
  )

  const buildExtra = () => {
    const extra: Record<string, unknown> = {}
    for (const field of extraStorageFields) {
      if (field.type === 'secret') {
        const trimmed = (secrets[field.key] ?? '').trim()
        if (trimmed) extra[field.key] = trimmed
        continue
      }
      if (!(field.key in draft)) continue
      const value = draft[field.key]
      if (field.type === 'number') {
        if (value === '' || value == null) continue
        extra[field.key] = Number(value)
      } else {
        extra[field.key] = value
      }
    }
    return Object.keys(extra).length ? extra : undefined
  }

  const hasPendingChanges = useMemo(() => {
    for (const field of plainFields) {
      const current = provider.values[field.key]
      const next = draft[field.key]
      if (field.type === 'boolean') {
        if (Boolean(next) !== Boolean(current)) return true
      } else if (String(next ?? '') !== String(current ?? '')) {
        return true
      }
    }
    return secretFields.some(f => {
      const next = (secrets[f.key] ?? '').trim()
      const current = String(provider.values[f.key] ?? '').trim()
      return next !== current
    })
  }, [draft, plainFields, provider.values, secretFields, secrets])

  const canSave = hasPendingChanges || plainFields.some(f => fieldConfigured(provider, f))

  const handleSave = async () => {
    const extra = buildExtra()
    const hasSecretChanges = secretFields.some(f => {
      const next = (secrets[f.key] ?? '').trim()
      const current = String(provider.values[f.key] ?? '').trim()
      return next !== current
    })
    if (hasSecretChanges && !extra) {
      toast.showError('请先填写 API Key 后再保存')
      return
    }
    if (!extra && !hasPendingChanges) {
      toast.showError('没有可保存的更改')
      return
    }
    setSaving(true)
    try {
      const saved = await saveProviderConfig(provider.providerId, extra ? { extra } : {})
      const savedSecrets = secretFields.filter(f => (secrets[f.key] ?? '').trim().length > 0)
      if (savedSecrets.length > 0) {
        const missing = savedSecrets.filter(f => !saved.secretsConfigured[f.key])
        if (missing.length > 0) {
          throw new Error('密钥未能写入本地配置，请重试')
        }
      }
      toast.showSuccess(hasSecretChanges ? '密钥已保存，数据源已自动启用' : '设置已保存')
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
      const resp = await testProviderConfig(provider.providerId, buildExtra())
      const result = resp.data
      if (result?.ok) toast.showSuccess(result.message)
      else toast.showError(`连接测试未通过：${result?.message ?? '未知错误'}`)
    } catch (e) {
      toast.showError(e instanceof Error ? e.message : '测试连接失败')
    } finally {
      setTesting(false)
    }
  }

  const renderPlainField = (field: ProviderSettingsField) => {
    const value = draft[field.key]
    if (field.type === 'boolean') {
      return (
        <Switch
          checked={Boolean(value)}
          onChange={(_, d) => setDraft(prev => ({ ...prev, [field.key]: !!d.checked }))}
          aria-label={field.label}
        />
      )
    }
    if (field.type === 'select') {
      return (
        <OpptrixSelect
          className={s.inlineControl}
          value={String(value ?? field.default ?? '')}
          onOptionSelect={(_, d) => {
            if (d.optionValue != null) {
              setDraft(prev => ({ ...prev, [field.key]: String(d.optionValue) }))
            }
          }}
        >
          {(field.options ?? []).map(opt => (
            <OpptrixOption key={opt.value} value={opt.value}>{opt.label}</OpptrixOption>
          ))}
        </OpptrixSelect>
      )
    }
    return (
      <Input
        className={s.inlineControl}
        appearance="filled-darker"
        size="medium"
        type={field.type === 'number' ? 'number' : 'text'}
        value={value == null ? '' : String(value)}
        placeholder={field.placeholder}
        onChange={(_, d) => {
          const next = d.value ?? ''
          setDraft(prev => ({
            ...prev,
            [field.key]: field.type === 'number' ? (next === '' ? '' : next) : next,
          }))
        }}
      />
    )
  }

  if (!provider.settingsFields.length) {
    return (
      <Text block style={{ fontSize: '12px', color: opptrixCssVars.textTertiary }}>
        此数据源暂无可配置项。
      </Text>
    )
  }

  const missingHint = missingRequiredLabel(provider, provider.settingsFields)

  return (
    <div className={s.root}>
      {plainFields.map(field => (
        <div key={field.key} className={s.fieldBlock}>
          <Text className={s.fieldLabel} block>{field.label}</Text>
          {field.description && (
            <Text className={s.fieldDesc} block>{field.description}</Text>
          )}
          {renderPlainField(field)}
        </div>
      ))}

      {secretFields.length > 0 && (
        <div className={s.secretBlock}>
          {secretFields.map(field => (
            <div key={field.key} className={s.fieldBlock}>
              <Text className={s.fieldLabel} block>{field.label}</Text>
              {field.description && (
                <Text className={s.fieldDesc} block>{field.description}</Text>
              )}
              <SettingsCredentialRow
                value={secrets[field.key] ?? ''}
                onChange={v => setSecrets(prev => ({ ...prev, [field.key]: v }))}
                placeholder={field.placeholder ?? '粘贴 API Key 或 Token'}
                testing={testing}
                saving={saving}
                testDisabled={!provider.supportsTest}
                saveDisabled={!canSave && !provider.secretsConfigured[field.key]}
                onTest={() => { void handleTest() }}
                onSave={() => { void handleSave() }}
              />
            </div>
          ))}
        </div>
      )}

      {secretFields.length === 0 && (
        <div className={s.actions}>
          {provider.supportsTest && (
            <OpptrixButton
              variant="ghost"
              disabled={testing}
              onClick={() => { void handleTest() }}
            >
              {testing ? '测试中…' : '测试连接'}
            </OpptrixButton>
          )}
          <OpptrixButton
            variant="primary"
            disabled={saving || !canSave}
            onClick={() => { void handleSave() }}
          >
            {saving ? '保存中…' : '保存'}
          </OpptrixButton>
        </div>
      )}

      {missingHint && (
        <Text block style={{ fontSize: '11px', color: opptrixCssVars.textTertiary }}>
          {missingHint}
        </Text>
      )}
    </div>
  )
}
