import { useState, useEffect } from 'react'
import {
  Text, Checkbox, makeStyles, mergeClasses,
} from '@fluentui/react-components'
import { CheckmarkRegular } from '@fluentui/react-icons'
import OpptrixField from '../components/opptrix/OpptrixField'
import OpptrixInput from '../components/opptrix/OpptrixInput'
import OpptrixSelect, { OpptrixOption } from '../components/opptrix/OpptrixSelect'
import OpptrixButton from '../components/opptrix/OpptrixButton'
import {
  getProviderPresets, discoverModels, createProvider, updateProvider,
  type ProviderPreset, type PublicProvider,
} from '../api/client'
import { useSettingsToast } from './settings/SettingsToast'
import { opptrixTokens, opptrixCssVars } from '../theme/tokens'

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: '18px',
    minHeight: 0,
  },
  steps: {
    display: 'flex',
    gap: '6px',
    width: '100%',
  },
  stepDot: {
    flex: 1,
    height: '3px',
    borderRadius: '999px',
    backgroundColor: opptrixCssVars.separator,
    transitionProperty: 'background-color',
    transitionDuration: '200ms',
  },
  stepActive: {
    backgroundColor: opptrixCssVars.accent,
  },
  scroll: {
    flex: 1,
    overflowY: 'auto',
    minHeight: 0,
    maxHeight: 'min(52vh, 420px)',
    marginRight: '-4px',
    paddingRight: '4px',
  },
  bodyInner: {
    display: 'flex',
    flexDirection: 'column',
    gap: '18px',
  },
  stepIntro: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  stepTitle: {
    fontSize: '16px',
    fontWeight: 650,
    letterSpacing: '-0.02em',
    color: opptrixCssVars.textPrimary,
    lineHeight: 1.25,
  },
  stepDesc: {
    fontSize: '13px',
    color: opptrixCssVars.textSecondary,
    lineHeight: 1.55,
  },
  formGrid: {
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
  },
  modelList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    border: `1px solid ${opptrixCssVars.border}`,
    borderRadius: opptrixTokens.radiusMd,
    padding: '4px 12px',
    maxHeight: '200px',
    overflowY: 'auto',
  },
  modelRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '10px 0',
    minHeight: '40px',
    cursor: 'pointer',
    borderBottom: `1px solid ${opptrixCssVars.separator}`,
    ':last-child': {
      borderBottom: 'none',
    },
  },
  customBlock: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  customActions: {
    display: 'flex',
    gap: '10px',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  footer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: '10px',
    flexShrink: 0,
    borderTop: `1px solid ${opptrixCssVars.separator}`,
    marginTop: '2px',
    paddingTop: '16px',
  },
  footerBack: {
    marginRight: 'auto',
  },
  statusLine: {
    fontSize: '13px',
    color: opptrixCssVars.textSecondary,
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    lineHeight: 1.5,
  },
  emptyModels: {
    fontSize: '13px',
    color: opptrixCssVars.textTertiary,
    lineHeight: 1.5,
    padding: '8px 0',
  },
})

interface ProviderWizardProps {
  onCancel: () => void
  onDone: () => void
  provider?: PublicProvider | null
}

const DEFAULT_PRESETS: ProviderPreset[] = [
  { id: 'deepseek', name: 'DeepSeek', base_url: 'https://api.deepseek.com' },
  { id: 'openai', name: 'OpenAI', base_url: 'https://api.openai.com' },
  { id: 'moonshot', name: 'Moonshot', base_url: 'https://api.moonshot.cn' },
  { id: 'custom', name: '自定义', base_url: '' },
]

export default function ProviderWizard({ onCancel, onDone, provider = null }: ProviderWizardProps) {
  const s = useStyles()
  const toast = useSettingsToast()
  const isEdit = Boolean(provider)
  const [step, setStep] = useState(1)
  const [presets, setPresets] = useState<ProviderPreset[]>(DEFAULT_PRESETS)
  const [presetId, setPresetId] = useState('deepseek')
  const [name, setName] = useState('DeepSeek')
  const [baseUrl, setBaseUrl] = useState('https://api.deepseek.com')
  const [apiKey, setApiKey] = useState('')
  const [discovered, setDiscovered] = useState<string[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [customModel, setCustomModel] = useState('')
  const [discovering, setDiscovering] = useState(false)
  const [saving, setSaving] = useState(false)
  const [discoverHint, setDiscoverHint] = useState('')

  useEffect(() => {
    getProviderPresets()
      .then(({ presets: list }) => {
        if (list.length) setPresets(list)
      })
      .catch(() => { /* keep defaults */ })
  }, [])

  useEffect(() => {
    if (!provider) return
    setName(provider.name)
    setBaseUrl(provider.base_url)
    setSelected(new Set(provider.models))
    setDiscovered(provider.models)
    setApiKey('')
    setStep(1)
    setDiscoverHint('')
  }, [provider])

  useEffect(() => {
    if (!provider || !presets.length) return
    const match = presets.find(
      p => p.id !== 'custom' && p.base_url.replace(/\/$/, '') === provider.base_url.replace(/\/$/, ''),
    )
    setPresetId(match?.id ?? 'custom')
  }, [provider, presets])

  const isCustom = presetId === 'custom' || isEdit

  const handlePresetChange = (id: string) => {
    setPresetId(id)
    const preset = presets.find(p => p.id === id)
    if (preset) {
      setName(preset.id === 'custom' ? '' : preset.name)
      setBaseUrl(preset.id === 'custom' ? '' : preset.base_url)
    }
  }

  const runDiscover = async (): Promise<boolean> => {
    const url = baseUrl.trim()
    if (!url || !apiKey.trim()) return false
    setDiscovering(true)
    setDiscoverHint('正在验证 API Key 并拉取模型…')
    setDiscovered([])
    setSelected(new Set())
    try {
      const { models } = await discoverModels(url, apiKey.trim())
      setDiscovered(models)
      if (models.length) {
        if (isEdit && provider) {
          const kept = provider.models.filter(m => models.includes(m))
          setSelected(new Set(kept.length ? kept : models.slice(0, 3)))
        } else {
          setSelected(new Set(models.slice(0, 3)))
        }
        setDiscoverHint(`已获取 ${models.length} 个模型，请勾选要启用的型号`)
      } else {
        setDiscoverHint('连接成功，但未获取到模型，可手动添加')
      }
      return true
    } catch (e) {
      setDiscoverHint('')
      toast.showError(e instanceof Error ? e.message : 'API Key 验证失败，请检查后重试')
      return false
    } finally {
      setDiscovering(false)
    }
  }

  const toggleModel = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const addCustomModel = () => {
    const m = customModel.trim()
    if (!m) return
    setDiscovered(prev => (prev.includes(m) ? prev : [...prev, m]))
    setSelected(prev => new Set([...prev, m]))
    setCustomModel('')
  }

  const allModels = [...discovered]
  for (const m of selected) {
    if (!allModels.includes(m)) allModels.push(m)
  }

  const canNextStep1 = Boolean(name.trim() && baseUrl.trim())
  const canNextStep2 = isEdit || Boolean(apiKey.trim())
  const canSave = selected.size > 0

  const handleNext = async () => {
    if (step === 1 && canNextStep1) {
      setStep(2)
      return
    }
    if (step === 2 && canNextStep2 && !discovering) {
      if (isEdit && !apiKey.trim()) {
        setDiscoverHint('沿用已保存的密钥，可调整启用的模型')
        setStep(3)
        return
      }
      const ok = await runDiscover()
      if (ok) setStep(3)
    }
  }

  const handleSave = async () => {
    if (!canSave) {
      toast.showError('请至少勾选一个模型')
      return
    }
    setSaving(true)
    try {
      if (isEdit && provider) {
        await updateProvider(provider.id, {
          name: name.trim(),
          base_url: baseUrl.trim(),
          ...(apiKey.trim() ? { api_key: apiKey.trim() } : {}),
          models: [...selected],
        })
      } else {
        await createProvider({
          name: name.trim(),
          base_url: baseUrl.trim(),
          api_key: apiKey.trim(),
          models: [...selected],
        })
      }
      onDone()
    } catch (e) {
      toast.showError(e instanceof Error ? e.message : '保存失败')
    }
    setSaving(false)
  }

  const handleBack = () => {
    if (step === 1) {
      onCancel()
      return
    }
    setStep(step - 1)
  }

  return (
    <div className={s.root}>
      <div className={s.steps}>
        {[1, 2, 3].map(n => (
          <div key={n} className={mergeClasses(s.stepDot, n <= step && s.stepActive)} />
        ))}
      </div>

      <div className={`${s.scroll} opptrix-scroll`}>
        <div className={s.bodyInner}>

          {step === 1 && (
            <>
              <div className={s.stepIntro}>
                <Text className={s.stepTitle} block>{isEdit ? '编辑提供商' : '选择提供商'}</Text>
                <Text className={s.stepDesc} block>OpenAI 兼容接口（/v1/chat/completions）</Text>
              </div>
              <div className={s.formGrid}>
                {!isEdit && (
                  <OpptrixField label="提供商">
                    <OpptrixSelect
                      selectedOptions={[presetId]}
                      onOptionSelect={(_, d) => handlePresetChange(d.optionValue || presetId)}
                    >
                      {presets.map(p => (
                        <OpptrixOption key={p.id} value={p.id}>{p.name}</OpptrixOption>
                      ))}
                    </OpptrixSelect>
                  </OpptrixField>
                )}
                <OpptrixField label="显示名称">
                  <OpptrixInput
                    value={name}
                    onChange={(_, d) => setName(d.value || '')}
                    placeholder={isCustom ? '例如 My Provider' : '例如 DeepSeek'}
                  />
                </OpptrixField>
                {isCustom && (
                  <OpptrixField label="Base URL" hint="无需包含 /v1，系统会自动补全">
                    <OpptrixInput
                      value={baseUrl}
                      onChange={(_, d) => setBaseUrl(d.value || '')}
                      placeholder="https://api.example.com"
                    />
                  </OpptrixField>
                )}
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <div className={s.stepIntro}>
                <Text className={s.stepTitle} block>配置 API Key</Text>
                <Text className={s.stepDesc} block>
                  {isEdit
                    ? '留空表示沿用已保存的密钥；填写新密钥将重新验证并拉取模型列表。'
                    : '密钥保存在本地服务端。点击「下一步」将自动验证并拉取可用模型。'}
                </Text>
              </div>
              <div className={s.formGrid}>
                <OpptrixField label={isEdit ? 'API Key（可选）' : 'API Key'}>
                  <OpptrixInput
                    type="password"
                    value={apiKey}
                    onChange={(_, d) => setApiKey(d.value || '')}
                    placeholder={isEdit ? '留空不修改' : 'sk-...'}
                  />
                </OpptrixField>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <div className={s.stepIntro}>
                <Text className={s.stepTitle} block>启用模型</Text>
                <Text className={s.stepDesc} block>勾选要启用的大模型，也可手动添加</Text>
              </div>

              {discoverHint && (
                <div className={s.statusLine}>
                  <Text style={{ fontSize: 13, color: opptrixCssVars.textSecondary }}>
                    {discoverHint}
                  </Text>
                </div>
              )}

              {allModels.length === 0 ? (
                <Text className={s.emptyModels} block>暂无模型，请在下方手动添加</Text>
              ) : (
                <div className={`${s.modelList} opptrix-scroll`}>
                  {allModels.map(model => (
                    <label key={model} className={s.modelRow}>
                      <Checkbox
                        checked={selected.has(model)}
                        onChange={() => toggleModel(model)}
                      />
                      <Text style={{ fontSize: 13, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace', lineHeight: 1.4 }}>
                        {model}
                      </Text>
                    </label>
                  ))}
                </div>
              )}

              <div className={s.customBlock}>
                <OpptrixField label="自定义模型" hint="无需等待远程拉取，可立即添加">
                  <OpptrixInput
                    value={customModel}
                    onChange={(_, d) => setCustomModel(d.value || '')}
                    placeholder="deepseek-chat"
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustomModel() } }}
                  />
                </OpptrixField>
                <div className={s.customActions}>
                  <OpptrixButton variant="secondary" onClick={addCustomModel} disabled={!customModel.trim()}>
                    添加模型
                  </OpptrixButton>
                  {allModels.length === 0 && (
                    <OpptrixButton variant="secondary" onClick={() => void runDiscover()} disabled={discovering}>
                      {discovering ? '获取中…' : '重新获取'}
                    </OpptrixButton>
                  )}
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <div className={s.footer}>
        <OpptrixButton
          className={s.footerBack}
          variant="secondary"
          onClick={handleBack}
        >
          {step === 1 ? '取消' : '上一步'}
        </OpptrixButton>
        {step < 3 ? (
          <OpptrixButton
            variant="primary"
            onClick={() => void handleNext()}
            disabled={
              (step === 1 && !canNextStep1)
              || (step === 2 && (!canNextStep2 || discovering))
            }
          >
            {step === 2 && discovering ? '验证中…' : '下一步'}
          </OpptrixButton>
        ) : (
          <OpptrixButton
            variant="primary"
            icon={<CheckmarkRegular />}
            onClick={handleSave}
            disabled={saving || !canSave}
          >
            {saving ? '保存中…' : (isEdit ? '保存更改' : '完成添加')}
          </OpptrixButton>
        )}
      </div>
    </div>
  )
}
