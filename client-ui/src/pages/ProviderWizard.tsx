import { useState, useEffect } from 'react'
import {
  Text, Spinner, Checkbox, makeStyles, mergeClasses,
} from '@fluentui/react-components'
import { ArrowLeftRegular, ArrowRightRegular, CheckmarkRegular } from '@fluentui/react-icons'
import StatusBanner from '../components/StatusBanner'
import InnoField from '../components/inno/InnoField'
import InnoInput from '../components/inno/InnoInput'
import InnoSelect, { InnoOption } from '../components/inno/InnoSelect'
import InnoButton from '../components/inno/InnoButton'
import {
  getProviderPresets, discoverModels, createProvider,
  type ProviderPreset,
} from '../api/client'
import { innoTokens } from '../theme/tokens'
import { hairlineBottom, hairlineTop } from '../theme/mixins'

const useStyles = makeStyles({
  page: {
    display: 'flex',
    flexDirection: 'column',
    height: '100dvh',
    backgroundColor: innoTokens.canvas,
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 12px',
    paddingTop: 'max(8px, env(safe-area-inset-top))',
    backgroundColor: innoTokens.surface,
    ...hairlineBottom,
    flexShrink: 0,
    minHeight: '44px',
  },
  title: {
    fontSize: '17px',
    fontWeight: 600,
    color: innoTokens.textPrimary,
    flex: 1,
  },
  steps: {
    display: 'flex',
    gap: '6px',
    padding: '12px 16px 0',
    maxWidth: '540px',
    margin: '0 auto',
    width: '100%',
  },
  stepDot: {
    flex: 1,
    height: '3px',
    borderRadius: '999px',
    backgroundColor: innoTokens.separator,
    transitionProperty: 'background-color',
    transitionDuration: '200ms',
  },
  stepActive: {
    backgroundColor: innoTokens.accent,
  },
  body: {
    flex: 1,
    overflowY: 'auto',
    padding: '16px',
  },
  bodyInner: {
    maxWidth: '540px',
    margin: '0 auto',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  stepTitle: {
    fontSize: '20px',
    fontWeight: 650,
    color: innoTokens.textPrimary,
    letterSpacing: '-0.02em',
  },
  stepDesc: {
    fontSize: '14px',
    color: innoTokens.textSecondary,
    lineHeight: 1.5,
    marginTop: '4px',
  },
  formGrid: {
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
    marginTop: '8px',
  },
  modelList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    marginTop: '8px',
  },
  modelRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '10px 12px',
    borderRadius: innoTokens.radiusMd,
    backgroundColor: innoTokens.surface,
    cursor: 'pointer',
    ':hover': {
      backgroundColor: innoTokens.surfaceMuted,
    },
  },
  customRow: {
    display: 'flex',
    gap: '8px',
    alignItems: 'flex-end',
    marginTop: '8px',
  },
  footer: {
    padding: '12px 16px',
    paddingBottom: 'max(12px, env(safe-area-inset-bottom))',
    backgroundColor: innoTokens.surface,
    ...hairlineTop,
    flexShrink: 0,
  },
  footerInner: {
    maxWidth: '540px',
    margin: '0 auto',
    display: 'flex',
    gap: '10px',
  },
  skeletonList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    marginTop: '8px',
  },
  skeletonRow: {
    height: '44px',
    borderRadius: innoTokens.radiusMd,
    backgroundColor: innoTokens.surfaceMuted,
    animationName: {
      '0%, 100%': { opacity: 0.45 },
      '50%': { opacity: 0.85 },
    },
    animationDuration: '1.2s',
    animationIterationCount: 'infinite',
  },
  statusLine: {
    fontSize: '13px',
    color: innoTokens.textSecondary,
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
  },
})

interface ProviderWizardProps {
  onBack: () => void
  onDone: () => void
}

const DEFAULT_PRESETS: ProviderPreset[] = [
  { id: 'deepseek', name: 'DeepSeek', base_url: 'https://api.deepseek.com' },
  { id: 'openai', name: 'OpenAI', base_url: 'https://api.openai.com' },
  { id: 'moonshot', name: 'Moonshot', base_url: 'https://api.moonshot.cn' },
  { id: 'custom', name: '自定义', base_url: '' },
]

export default function ProviderWizard({ onBack, onDone }: ProviderWizardProps) {
  const s = useStyles()
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
  const [error, setError] = useState('')
  const [discoverHint, setDiscoverHint] = useState('')

  useEffect(() => {
    getProviderPresets()
      .then(({ presets: list }) => {
        if (list.length) setPresets(list)
      })
      .catch(() => { /* keep defaults */ })
  }, [])

  const handlePresetChange = (id: string) => {
    setPresetId(id)
    const preset = presets.find(p => p.id === id)
    if (preset) {
      setName(preset.id === 'custom' ? '' : preset.name)
      setBaseUrl(preset.base_url)
    }
  }

  const handleDiscover = async () => {
    if (!baseUrl.trim() || !apiKey.trim()) return
    setDiscovering(true)
    setError('')
    setDiscoverHint('正在连接并拉取模型…')
    try {
      const { models } = await discoverModels(baseUrl.trim(), apiKey.trim())
      setDiscovered(models)
      if (models.length) {
        setSelected(prev => {
          const next = new Set(prev)
          for (const m of models.slice(0, 3)) next.add(m)
          return next
        })
        setDiscoverHint(`已获取 ${models.length} 个模型，请勾选要启用的型号`)
      } else {
        setDiscoverHint('未获取到模型，可在下方手动添加')
      }
    } catch (e) {
      setDiscoverHint('')
      setError(e instanceof Error ? e.message : '获取模型列表失败，可手动添加型号')
    }
    setDiscovering(false)
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

  const canNextStep1 = name.trim() && baseUrl.trim()
  const canNextStep2 = apiKey.trim()
  const canSave = selected.size > 0

  const handleNext = () => {
    if (step === 1 && canNextStep1) {
      setStep(2)
      setError('')
      return
    }
    if (step === 2 && canNextStep2) {
      setStep(3)
      setError('')
      void handleDiscover()
    }
  }

  const presetLabel = presets.find(p => p.id === presetId)?.name ?? presetId

  const handleSave = async () => {
    if (!canSave) {
      setError('请至少勾选一个模型')
      return
    }
    setSaving(true)
    setError('')
    try {
      await createProvider({
        name: name.trim(),
        base_url: baseUrl.trim(),
        api_key: apiKey.trim(),
        models: [...selected],
      })
      onDone()
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存失败')
    }
    setSaving(false)
  }

  return (
    <div className={s.page}>
      <header className={s.header}>
        <InnoButton
          variant="ghost"
          icon={<ArrowLeftRegular />}
          onClick={step === 1 ? onBack : () => { setStep(step - 1); setError('') }}
          aria-label="返回"
        />
        <Text className={s.title}>添加模型提供商</Text>
      </header>

      <div className={s.steps}>
        {[1, 2, 3].map(n => (
          <div key={n} className={mergeClasses(s.stepDot, n <= step && s.stepActive)} />
        ))}
      </div>

      <div className={`${s.body} inno-scroll`}>
        <div className={s.bodyInner}>
          {error && <StatusBanner message={error} tone="error" />}

          {step === 1 && (
            <>
              <div>
                <Text className={s.stepTitle}>选择提供商</Text>
                <Text className={s.stepDesc}>所有接口均采用 OpenAI 兼容格式（/v1/chat/completions）</Text>
              </div>
              <div className={s.formGrid}>
                <InnoField label="提供商">
                  <InnoSelect
                    value={presetLabel}
                    selectedOptions={[presetId]}
                    onOptionSelect={(_, d) => handlePresetChange(d.optionValue || presetId)}
                  >
                    {presets.map(p => (
                      <InnoOption key={p.id} value={p.id}>{p.name}</InnoOption>
                    ))}
                  </InnoSelect>
                </InnoField>
                <InnoField label="显示名称">
                  <InnoInput
                    value={name}
                    onChange={(_, d) => setName(d.value || '')}
                    placeholder="例如 DeepSeek"
                  />
                </InnoField>
                <InnoField label="Base URL" hint="无需包含 /v1，系统会自动补全">
                  <InnoInput
                    value={baseUrl}
                    onChange={(_, d) => setBaseUrl(d.value || '')}
                    placeholder="https://api.deepseek.com"
                  />
                </InnoField>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <div>
                <Text className={s.stepTitle}>配置 API Key</Text>
                <Text className={s.stepDesc}>密钥用于下一步拉取可用模型列表，保存在本地服务端</Text>
              </div>
              <div className={s.formGrid}>
                <InnoField label="API Key">
                  <InnoInput
                    type="password"
                    value={apiKey}
                    onChange={(_, d) => setApiKey(d.value || '')}
                    placeholder="sk-..."
                  />
                </InnoField>
                <InnoButton
                  variant="secondary"
                  onClick={handleDiscover}
                  disabled={discovering || !apiKey.trim()}
                  style={{ alignSelf: 'flex-start' }}
                >
                  {discovering ? '获取中…' : '预拉取模型列表'}
                </InnoButton>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <div>
                <Text className={s.stepTitle}>启用模型</Text>
                <Text className={s.stepDesc}>
                  勾选本提供商下要启用的大模型。获取失败时也可手动输入型号。
                </Text>
              </div>

              {(discovering || discoverHint) && (
                <div className={s.statusLine}>
                  {discovering && <Spinner size="tiny" />}
                  <Text style={{ fontSize: 13, color: discovering ? innoTokens.textSecondary : innoTokens.success }}>
                    {discoverHint || '正在获取模型…'}
                  </Text>
                </div>
              )}

              {discovering && allModels.length === 0 && (
                <div className={s.skeletonList}>
                  {[0, 1, 2, 3].map(i => (
                    <div key={i} className={s.skeletonRow} style={{ animationDelay: `${i * 0.12}s` }} />
                  ))}
                </div>
              )}

              <div className={s.modelList}>
                {allModels.length === 0 && !discovering && (
                  <Text style={{ fontSize: 13, color: innoTokens.textTertiary, padding: '8px 0' }}>
                    暂无模型，请在下方手动添加
                  </Text>
                )}
                {allModels.map(model => (
                  <label key={model} className={s.modelRow}>
                    <Checkbox
                      checked={selected.has(model)}
                      onChange={() => toggleModel(model)}
                    />
                    <Text style={{ fontSize: 14, fontFamily: 'ui-monospace, monospace' }}>{model}</Text>
                  </label>
                ))}
              </div>

              <div className={s.customRow}>
                <InnoField label="自定义模型" hint="无需等待，可立即添加">
                  <InnoInput
                    value={customModel}
                    onChange={(_, d) => setCustomModel(d.value || '')}
                    placeholder="deepseek-chat"
                    onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addCustomModel() } }}
                  />
                </InnoField>
                <InnoButton variant="secondary" onClick={addCustomModel} disabled={!customModel.trim()}>
                  添加
                </InnoButton>
              </div>

              {!discovering && allModels.length === 0 && (
                <InnoButton variant="secondary" onClick={() => void handleDiscover()} style={{ alignSelf: 'flex-start' }}>
                  重新获取模型
                </InnoButton>
              )}
            </>
          )}
        </div>
      </div>

      <footer className={s.footer}>
        <div className={s.footerInner}>
          {step < 3 ? (
            <InnoButton
              variant="primary"
              icon={<ArrowRightRegular />}
              iconPosition="after"
              onClick={handleNext}
              disabled={(step === 1 && !canNextStep1) || (step === 2 && !canNextStep2)}
              style={{ flex: 1 }}
            >
              下一步
            </InnoButton>
          ) : (
            <InnoButton
              variant="primary"
              icon={<CheckmarkRegular />}
              onClick={handleSave}
              disabled={saving || !canSave}
              style={{ flex: 1 }}
            >
              {saving ? '保存中…' : '完成添加'}
            </InnoButton>
          )}
        </div>
      </footer>
    </div>
  )
}
