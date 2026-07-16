import { useEffect, useMemo, useState } from 'react'
import {
  Input,
  Switch,
  Text,
  makeStyles,
} from '@fluentui/react-components'
import {
  Wifi1Regular,
  CheckmarkRegular,
  EyeRegular,
  EyeOffRegular,
} from '@fluentui/react-icons'
import type { ProviderSettingsField, PublicProviderRuntime } from '../../types/provider'
import { saveProviderConfig, testProviderConfig } from '../../api/client'
import { useSettingsToast } from './SettingsToast'
import OpptrixSelect, { OpptrixOption } from '../../components/opptrix/OpptrixSelect'
import OpptrixButton from '../../components/opptrix/OpptrixButton'
import { opptrixTokens, opptrixCssVars } from '../../theme/tokens'
import { inputShellInteractive } from '../../theme/mixins'

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
    maxWidth: '100%',
    boxSizing: 'border-box',
    overflow: 'hidden',
  },
  fieldLabel: {
    fontSize: 'var(--opptrix-font-md)',
    fontWeight: 600,
    color: opptrixCssVars.textPrimary,
    lineHeight: 1.35,
    paddingLeft: '2px',
  },
  fieldDesc: {
    fontSize: 'var(--opptrix-font-sm)',
    color: opptrixCssVars.textTertiary,
    lineHeight: 1.45,
    paddingLeft: '2px',
  },
  combo: {
    ...inputShellInteractive,
    width: '100%',
    minWidth: 0,
    minHeight: '32px',
    display: 'flex',
    alignItems: 'stretch',
    padding: 0,
    overflow: 'hidden',
    boxSizing: 'border-box',
    borderRadius: opptrixTokens.radiusMd,
  },
  comboInput: {
    flex: '1 1 0',
    minWidth: 0,
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
    fontSize: 'var(--opptrix-font-md)',
    paddingLeft: '10px',
    paddingRight: '4px',
  },
  comboSelectWrap: {
    flex: '1 1 0',
    minWidth: 0,
    display: 'flex',
    alignItems: 'center',
  },
  comboSegment: {
    display: 'flex',
    alignItems: 'center',
    flexShrink: 0,
    borderLeft: `1px solid ${opptrixCssVars.separator}`,
  },
  credHint: {
    fontSize: 'var(--opptrix-font-sm)',
    color: opptrixCssVars.textTertiary,
    lineHeight: 1.45,
    paddingLeft: '2px',
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

  if (!provider.settingsFields.length) {
    return (
      <Text block style={{ fontSize: 'var(--opptrix-font-md)', color: opptrixCssVars.textTertiary }}>
        此数据源暂无可配置项。
      </Text>
    )
  }

  const missingHint = missingRequiredLabel(provider, provider.settingsFields)

  return (
    <div className={s.root}>
      {plainFields.map(field => (
        <ProviderFieldRow
          key={field.key}
          field={field}
          value={draft[field.key]}
          onChange={v => setDraft(prev => ({ ...prev, [field.key]: v }))}
          onTest={provider.supportsTest ? () => { void handleTest() } : undefined}
          onSave={() => { void handleSave() }}
          testing={testing}
          saving={saving}
          testDisabled={false}
          saveDisabled={!hasPendingChanges && !fieldConfigured(provider, field)}
        />
      ))}

      {secretFields.length > 0 && (
        secretFields.map(field => (
          <ProviderFieldRow
            key={field.key}
            field={field}
            value={secrets[field.key] ?? ''}
            onChange={v => setSecrets(prev => ({ ...prev, [field.key]: String(v) }))}
            secret
            onTest={provider.supportsTest ? () => { void handleTest() } : undefined}
            onSave={() => { void handleSave() }}
            testing={testing}
            saving={saving}
            testDisabled={false}
            saveDisabled={!canSave && !provider.secretsConfigured[field.key]}
            configured={provider.secretsConfigured[field.key]}
            preview={provider.secretPreviews?.[field.key]}
          />
        ))
      )}

      {missingHint && (
        <Text block style={{ fontSize: 'var(--opptrix-font-sm)', color: opptrixCssVars.textTertiary }}>
          {missingHint}
        </Text>
      )}
    </div>
  )
}

function ProviderFieldRow({
  field,
  value,
  onChange,
  secret = false,
  onTest,
  onSave,
  testing = false,
  saving = false,
  testDisabled = false,
  saveDisabled = false,
  configured = false,
  preview,
}: {
  field: ProviderSettingsField
  value: unknown
  onChange: (value: unknown) => void
  secret?: boolean
  onTest?: () => void
  onSave: () => void
  testing?: boolean
  saving?: boolean
  testDisabled?: boolean
  saveDisabled?: boolean
  configured?: boolean
  preview?: string
}) {
  const s = useStyles()
  const [visible, setVisible] = useState(false)
  const showConfiguredHint = configured && !String(value ?? '').trim()

  const renderInput = (withCombo = true) => {
    if (field.type === 'boolean') {
      return (
        <div className={withCombo ? s.comboSelectWrap : undefined} style={!withCombo ? { width: '100%' } : undefined}>
          <Switch
            checked={Boolean(value)}
            onChange={(_, d) => onChange(!!d.checked)}
            aria-label={field.label}
          />
        </div>
      )
    }
    if (field.type === 'select') {
      return (
        <div className={withCombo ? s.comboSelectWrap : undefined} style={!withCombo ? { width: '100%' } : undefined}>
          <OpptrixSelect
            style={{ width: '100%' }}
            value={String(value ?? field.default ?? '')}
            onOptionSelect={(_, d) => {
              if (d.optionValue != null) onChange(String(d.optionValue))
            }}
          >
            {(field.options ?? []).map(opt => (
              <OpptrixOption key={opt.value} value={opt.value}>{opt.label}</OpptrixOption>
            ))}
          </OpptrixSelect>
        </div>
      )
    }
    return (
      <Input
        className={withCombo ? s.comboInput : undefined}
        style={!withCombo ? { width: '100%' } : undefined}
        appearance="filled-darker"
        size="small"
        type={secret && !visible ? 'password' : field.type === 'number' ? 'number' : 'text'}
        value={value == null ? '' : String(value)}
        placeholder={field.placeholder}
        onChange={(_, d) => {
          const next = d.value ?? ''
          onChange(field.type === 'number' ? (next === '' ? '' : next) : next)
        }}
      />
    )
  }

  return (
    <div>
      <Text className={s.fieldLabel} block>{field.label}</Text>
      <div className={s.combo}>
        {renderInput()}
        {secret && (
          <div className={s.comboSegment}>
            <OpptrixButton
              variant="icon"
              aria-label={visible ? '隐藏' : '显示'}
              icon={visible ? <EyeOffRegular fontSize={14} /> : <EyeRegular fontSize={14} />}
              onClick={() => setVisible(v => !v)}
            />
          </div>
        )}
        {onTest && (
          <div className={s.comboSegment}>
            <OpptrixButton
              variant="icon"
              aria-label="测试连接"
              icon={<Wifi1Regular fontSize={14} />}
              disabled={testing || testDisabled || saving}
              onClick={onTest}
            />
          </div>
        )}
        <div className={s.comboSegment}>
          <OpptrixButton
            variant="icon"
            aria-label="保存"
            icon={<CheckmarkRegular fontSize={14} />}
            disabled={saving || saveDisabled}
            onClick={onSave}
          />
        </div>
      </div>
      {field.description && (
        <Text className={s.fieldDesc} block style={{ marginTop: '4px' }}>{field.description}</Text>
      )}
      {showConfiguredHint && (
        <Text className={s.credHint} block>
          {preview ? `当前密钥：${preview}。如需更换，输入新密钥后保存。` : '密钥已保存在本机，如需更换请输入新密钥后保存。'}
        </Text>
      )}
    </div>
  )
}
