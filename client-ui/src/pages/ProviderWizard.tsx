import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import {
  Text, Checkbox, makeStyles, mergeClasses,
} from '@fluentui/react-components'
import { CheckmarkRegular, ChevronRightRegular } from '@fluentui/react-icons'
import OpptrixField from '../components/opptrix/OpptrixField'
import OpptrixInput from '../components/opptrix/OpptrixInput'
import OpptrixButton from '../components/opptrix/OpptrixButton'
import {
  getProviderPresets, discoverModels, createProvider, updateProvider,
  type ProviderPreset, type PublicProvider,
} from '../api/client'
import { useSettingsToast } from './settings/SettingsToast'
import { opptrixTokens, opptrixCssVars } from '../theme/tokens'
import { focusRing, ghostInteractive } from '../theme/mixins'

/** 返利预置置顶顺序（kimi → xiaomimimo → siliconflow → bigmodel） */
const PROMO_PRESET_IDS = ['moonshotai-cn', 'xiaomi', 'siliconflow-cn', 'zhipuai'] as const

/** 次要文案：返利权益说明 */
const PROMO_PRESET_HINTS: Record<(typeof PROMO_PRESET_IDS)[number], string> = {
  'moonshotai-cn': '新注册用户100%得会员权益',
  xiaomi: '新注册免费得10元体验金',
  'siliconflow-cn': '新用户注册得14元体验金',
  zhipuai: '新注册免费得2000万Tokens',
}

const PROMO_PRESET_ID_SET = new Set<string>(PROMO_PRESET_IDS)

/** 预置提供商注册/控制台链接；返利四家必须用指定 URL，勿改 */
const PRESET_SIGNUP_URLS: Record<string, string> = {
  'moonshotai-cn': 'https://kimi-bot.com/activities/zh-cn/viral-referral/share?scenario=invite&from=share_poster&invitation_code=ST7TJY',
  xiaomi: 'https://platform.xiaomimimo.com?ref=BFGUJ2',
  'siliconflow-cn': 'https://cloud.siliconflow.cn/i/USDgicnv',
  zhipuai: 'https://www.bigmodel.cn/invite?icode=3vdsl7O%2FnRjGs22eJGFJ3VwpqjqOwPB5EXW6OL4DgqY%3D',
  deepseek: 'https://platform.deepseek.com/',
  'minimax-cn': 'https://platform.minimaxi.com/',
  'alibaba-cn': 'https://dashscope.console.aliyun.com/',
  moonshotai: 'https://platform.moonshot.ai/',
  longcat: 'https://longcat.chat/',
  openai: 'https://platform.openai.com/api-keys',
  openrouter: 'https://openrouter.ai/keys',
  google: 'https://aistudio.google.com/apikey',
  meta: 'https://llama.developer.meta.com/',
  ollama: 'https://ollama.com/',
}

function normalizePresetBaseUrl(url: string): string {
  return url.trim().replace(/\/+$/, '')
}

/** 从已选 id，或按 name/baseUrl 反查预置 id（编辑已有提供商时） */
function resolvePresetId(
  presets: ProviderPreset[],
  selectedPresetId: string | null,
  name: string,
  baseUrl: string,
): string | null {
  if (selectedPresetId && selectedPresetId !== 'custom') return selectedPresetId
  const u = normalizePresetBaseUrl(baseUrl)
  if (u) {
    const byUrl = presets.find(p => p.id !== 'custom' && normalizePresetBaseUrl(p.base_url) === u)
    if (byUrl) return byUrl.id
  }
  const n = name.trim()
  if (n) {
    const byName = presets.find(p => p.id !== 'custom' && p.name === n)
    if (byName) return byName.id
  }
  return null
}

function resolveSignupUrl(presetId: string | null): string | undefined {
  if (!presetId) return undefined
  const url = PRESET_SIGNUP_URLS[presetId]?.trim()
  return url || undefined
}

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: '18px',
    flex: 1,
    minHeight: 0,
    overflow: 'hidden',
  },
  steps: {
    display: 'flex',
    gap: '6px',
    width: '100%',
    flexShrink: 0,
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
    minHeight: 0,
    overflowY: 'auto',
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
    fontSize: 'var(--opptrix-font-2xl)',
    fontWeight: 650,
    letterSpacing: '-0.02em',
    color: opptrixCssVars.textPrimary,
    lineHeight: 1.25,
  },
  stepDesc: {
    fontSize: 'var(--opptrix-font-base)',
    color: opptrixCssVars.textSecondary,
    lineHeight: 1.55,
  },
  formGrid: {
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
  },
  providerMeta: {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'baseline',
    gap: '6px 12px',
  },
  providerMetaName: {
    fontSize: 'var(--opptrix-font-base)',
    fontWeight: 600,
    color: opptrixCssVars.textPrimary,
    lineHeight: 1.4,
  },
  signupLink: {
    fontSize: 'var(--opptrix-font-base)',
    fontWeight: 500,
    color: opptrixCssVars.accent,
    textDecoration: 'none',
    lineHeight: 1.4,
    ':hover': {
      textDecoration: 'underline',
    },
    ':focus-visible': {
      ...focusRing,
      borderRadius: opptrixTokens.radiusSm,
    },
  },
  presetList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    border: `1px solid ${opptrixCssVars.border}`,
    borderRadius: opptrixTokens.radiusMd,
    padding: '4px',
    overflow: 'hidden',
  },
  presetRow: {
    ...ghostInteractive,
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    width: '100%',
    padding: '10px 12px',
    minHeight: '42px',
    cursor: 'pointer',
    textAlign: 'left',
    color: opptrixCssVars.textPrimary,
    fontSize: 'var(--opptrix-font-base)',
    fontWeight: 500,
    lineHeight: 1.35,
    position: 'relative',
    borderRadius: opptrixTokens.radiusSm,
    border: 'none',
    backgroundColor: 'transparent',
    /* 分割线独立于圆角，避免 borderBottom 随 radius 弯折 */
    '::after': {
      content: '""',
      position: 'absolute',
      left: '12px',
      right: '12px',
      bottom: 0,
      height: '1px',
      backgroundColor: opptrixCssVars.separator,
      borderRadius: 0,
      pointerEvents: 'none',
    },
    ':last-child::after': {
      display: 'none',
    },
    /* surfaceHover 在浅色底上近乎不可见；改用 canvasAlt */
    ':hover': {
      backgroundColor: opptrixCssVars.canvasAlt,
    },
    ':hover::after': {
      backgroundColor: opptrixCssVars.canvasAlt,
    },
    ':focus': {
      outline: 'none',
    },
    ':focus-visible': {
      ...focusRing,
      backgroundColor: opptrixCssVars.canvasAlt,
    },
    ':focus-visible::after': {
      backgroundColor: opptrixCssVars.canvasAlt,
    },
  },
  presetRowLabel: {
    flex: 1,
    minWidth: 0,
  },
  presetRowHint: {
    fontSize: 'var(--opptrix-font-sm)',
    fontWeight: 400,
    color: opptrixCssVars.textTertiary,
    marginTop: '2px',
  },
  presetChevron: {
    color: opptrixCssVars.textTertiary,
    flexShrink: 0,
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
    fontSize: 'var(--opptrix-font-base)',
    color: opptrixCssVars.textSecondary,
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    lineHeight: 1.5,
  },
  emptyModels: {
    fontSize: 'var(--opptrix-font-base)',
    color: opptrixCssVars.textTertiary,
    lineHeight: 1.5,
    padding: '8px 0',
  },
})

interface ProviderWizardProps {
  onCancel: () => void
  onDone: () => void
  provider?: PublicProvider | null
  /** 嵌入引导等场景：隐藏底部导航，由外层统一控制 */
  hideFooter?: boolean
  /** 嵌入引导：隐藏顶部三步进度条 */
  compact?: boolean
  /** 为 true 时第一步不显示「取消」 */
  hideCancel?: boolean
  /** 引导流程：统一「继续」等文案，并通过 onNavStateChange 交出导航 */
  flowMode?: 'default' | 'onboarding'
  onNavStateChange?: (nav: ProviderWizardNavState | null) => void
}

export interface ProviderWizardNavState {
  step: number
  canWizardBack: boolean
  canAdvance: boolean
  advancing: boolean
  saving: boolean
  advanceLabel: string
  goWizardBack: () => void
  advance: () => void | Promise<void>
}

const DEFAULT_PRESETS: ProviderPreset[] = [
  { id: 'deepseek', name: 'DeepSeek', base_url: 'https://api.deepseek.com/v1', region: 'cn' },
  { id: 'minimax-cn', name: 'MiniMax', base_url: 'https://api.minimaxi.com/v1', region: 'cn' },
  { id: 'moonshotai-cn', name: 'Kimi', base_url: 'https://api.moonshot.cn/v1', region: 'cn' },
  { id: 'xiaomi', name: 'MiMo', base_url: 'https://api.xiaomimimo.com/v1', region: 'cn' },
  { id: 'siliconflow-cn', name: 'SiliconFlow (China)', base_url: 'https://api.siliconflow.cn/v1', region: 'cn' },
  { id: 'alibaba-cn', name: 'Alibaba (China)', base_url: 'https://dashscope.aliyuncs.com/compatible-mode/v1', region: 'cn' },
  { id: 'zhipuai', name: 'Zhipu AI', base_url: 'https://open.bigmodel.cn/api/paas/v4', region: 'cn' },
  { id: 'moonshotai', name: 'Moonshot AI', base_url: 'https://api.moonshot.ai/v1', region: 'cn' },
  { id: 'longcat', name: 'Meituan', base_url: 'https://api.longcat.chat/openai', region: 'cn' },
  { id: 'openai', name: 'OpenAI', base_url: 'https://api.openai.com/v1', region: 'global' },
  { id: 'openrouter', name: 'OpenRouter', base_url: 'https://openrouter.ai/api/v1', region: 'global' },
  { id: 'google', name: 'Google', base_url: 'https://generativelanguage.googleapis.com/v1beta/openai', region: 'global' },
  { id: 'meta', name: 'Meta', base_url: 'https://api.meta.ai/v1', region: 'global' },
  { id: 'ollama', name: '本地 Ollama', base_url: 'http://127.0.0.1:11434/v1', region: 'global' },
  { id: 'custom', name: '自定义', base_url: '', region: 'custom' },
]

function presetRegion(p: ProviderPreset): 'cn' | 'global' | 'custom' {
  if (p.region) return p.region
  if (p.id === 'custom') return 'custom'
  if (
    p.id === 'openai'
    || p.id === 'openrouter'
    || p.id === 'google'
    || p.id === 'meta'
    || p.id === 'ollama'
  ) {
    return 'global'
  }
  return 'cn'
}

/** 合并远端预置：禁止被旧短列表覆盖；白名单顺序/名称/region 为准，非空 base_url 取远端。 */
function mergeProviderPresets(remote: ProviderPreset[]): ProviderPreset[] {
  const remoteIsFull =
    remote.length >= DEFAULT_PRESETS.length
    && remote.every(p => p.region != null)
  if (remoteIsFull) return remote

  const byId = new Map(remote.map(p => [p.id, p]))
  return DEFAULT_PRESETS.map(local => {
    const fromApi = byId.get(local.id)
    if (!fromApi) return local
    const remoteUrl = typeof fromApi.base_url === 'string' ? fromApi.base_url.trim() : ''
    return {
      ...local,
      base_url: remoteUrl || local.base_url,
    }
  })
}

export default function ProviderWizard({
  onCancel,
  onDone,
  provider = null,
  hideFooter = false,
  hideCancel = false,
  compact = false,
  flowMode = 'default',
  onNavStateChange,
}: ProviderWizardProps) {
  const s = useStyles()
  const toast = useSettingsToast()
  const isEdit = Boolean(provider)
  const [step, setStep] = useState(1)
  const [presets, setPresets] = useState<ProviderPreset[]>(DEFAULT_PRESETS)
  const [customFormOpen, setCustomFormOpen] = useState(false)
  const [selectedPresetId, setSelectedPresetId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
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
        if (list.length) setPresets(mergeProviderPresets(list))
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
    setCustomFormOpen(false)
    setSelectedPresetId(null)
    setDiscoverHint('')
  }, [provider])

  /** 扁平列表：返利置顶 → 其余中国 → 海外 → 自定义 */
  const flatPresets = useMemo((): ProviderPreset[] => {
    const byId = new Map(presets.map(p => [p.id, p]))
    const promo = PROMO_PRESET_IDS
      .map(id => byId.get(id))
      .filter((p): p is ProviderPreset => p != null)
    const rest = presets.filter(p => !PROMO_PRESET_ID_SET.has(p.id) && presetRegion(p) !== 'custom')
    const cn = rest.filter(p => presetRegion(p) === 'cn')
    const global = rest.filter(p => presetRegion(p) === 'global')
    const custom = presets.find(p => presetRegion(p) === 'custom')
      ?? { id: 'custom', name: '自定义', base_url: '', region: 'custom' as const }
    return [...promo, ...cn, ...global, custom]
  }, [presets])

  /** 仅第 1 步展示预置列表；进密钥步后必须为 false，否则页脚会把「下一步」渲染成 null */
  const showPresetList = !isEdit && !customFormOpen && step === 1
  const showCustomForm = !isEdit && customFormOpen && step === 1

  const matchedPresetId = useMemo(
    () => resolvePresetId(presets, selectedPresetId, name, baseUrl),
    [presets, selectedPresetId, name, baseUrl],
  )
  const signupUrl = resolveSignupUrl(matchedPresetId)

  const selectPreset = (preset: ProviderPreset) => {
    if (preset.id === 'custom') {
      setName('')
      setBaseUrl('')
      setSelectedPresetId(null)
      setCustomFormOpen(true)
      return
    }
    setName(preset.name)
    setBaseUrl(preset.base_url)
    setSelectedPresetId(preset.id)
    // Ollama 兼容接口需带 Authorization，本地常用占位密钥即可
    setApiKey(preset.id === 'ollama' ? 'ollama' : '')
    setCustomFormOpen(false)
    setStep(2)
  }

  const runDiscover = async (): Promise<boolean> => {
    const url = baseUrl.trim()
    const key = apiKey.trim()
    if (!url) {
      toast.showError('缺少服务地址，请返回上一步重新选择提供商')
      return false
    }
    if (!key) {
      toast.showError('请先填写密钥')
      return false
    }
    setDiscovering(true)
    setDiscoverHint('正在验证密钥并拉取模型…')
    setDiscovered([])
    setSelected(new Set())
    try {
      const { models } = await discoverModels(url, key)
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
      const raw = e instanceof Error ? e.message : '密钥验证失败，请检查后重试'
      const friendly = /超时|timeout|abort/i.test(raw)
        ? '验证超时，请确认网络后重试'
        : /HTTP\s*401|unauthorized|invalid.*key|incorrect.*api/i.test(raw)
          ? '密钥无效或已过期，请检查后重试'
          : /HTTP\s*404|not\s*found/i.test(raw)
            ? '服务地址可能不正确，请返回重选提供商或改用自定义'
            : raw
      toast.showError(friendly)
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
  /** 新建须同时有地址与密钥；编辑可留空密钥沿用已存 */
  const canNextStep2 = isEdit
    ? true
    : Boolean(baseUrl.trim() && apiKey.trim())
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
      if (showCustomForm) {
        setCustomFormOpen(false)
        setName('')
        setBaseUrl('')
        setSelectedPresetId(null)
        return
      }
      if (!hideCancel) onCancel()
      return
    }
    setStep(step - 1)
  }

  const isOnboarding = flowMode === 'onboarding'

  const advanceLabel = step < 3
    ? (step === 2 && discovering ? '验证中…' : (isOnboarding ? '继续' : '下一步'))
    : (saving
      ? '保存中…'
      : (isOnboarding ? '完成配置' : (isEdit ? '保存更改' : '完成添加')))

  const canAdvance = step === 1
    ? (showPresetList ? false : canNextStep1)
    : step === 2
      ? canNextStep2 && !discovering
      : canSave && !saving

  const navActionsRef = useRef({
    goWizardBack: handleBack,
    advance: async () => {
      if (step < 3) await handleNext()
      else await handleSave()
    },
  })

  navActionsRef.current = {
    goWizardBack: handleBack,
    advance: async () => {
      if (step < 3) await handleNext()
      else await handleSave()
    },
  }

  const reportNav = useCallback(() => {
    if (!hideFooter || !onNavStateChange) return
    onNavStateChange({
      step,
      canWizardBack: step > 1 || showCustomForm,
      canAdvance,
      advancing: discovering,
      saving,
      advanceLabel,
      goWizardBack: () => navActionsRef.current.goWizardBack(),
      advance: () => navActionsRef.current.advance(),
    })
  }, [
    hideFooter,
    onNavStateChange,
    step,
    showCustomForm,
    canAdvance,
    discovering,
    saving,
    advanceLabel,
  ])

  useEffect(() => {
    reportNav()
  }, [reportNav])

  useEffect(() => {
    if (!hideFooter || !onNavStateChange) return
    return () => { onNavStateChange(null) }
  }, [hideFooter, onNavStateChange])

  const renderPresetRow = (preset: ProviderPreset, hint?: string) => (
    <button
      key={preset.id}
      type="button"
      className={mergeClasses(s.presetRow, 'opptrix-focusable')}
      onClick={() => selectPreset(preset)}
    >
      <span className={s.presetRowLabel}>
        {preset.name}
        {hint ? <div className={s.presetRowHint}>{hint}</div> : null}
      </span>
      <ChevronRightRegular className={s.presetChevron} fontSize={16} />
    </button>
  )

  return (
    <div className={s.root}>
      {!compact && (
      <div className={s.steps}>
        {[1, 2, 3].map(n => (
          <div key={n} className={mergeClasses(s.stepDot, n <= step && s.stepActive)} />
        ))}
      </div>
      )}

      <div className={`${s.scroll} opptrix-scroll`}>
        <div className={s.bodyInner}>

          {step === 1 && showPresetList && (
            <>
              <div className={s.stepIntro}>
                <Text className={s.stepTitle} block>选择提供商</Text>
                <Text className={s.stepDesc} block>
                  选一个预置服务，直接填写密钥；也可自定义服务地址。
                </Text>
              </div>
              <div className={s.presetList}>
                {flatPresets.map(p => {
                  const promoId = PROMO_PRESET_IDS.find(id => id === p.id)
                  return renderPresetRow(
                    p,
                    p.id === 'custom'
                      ? '自行填写名称与服务地址'
                      : (promoId ? PROMO_PRESET_HINTS[promoId] : undefined),
                  )
                })}
              </div>
            </>
          )}

          {step === 1 && (isEdit || showCustomForm) && (
            <>
              <div className={s.stepIntro}>
                <Text className={s.stepTitle} block>
                  {isEdit ? '编辑提供商' : '自定义提供商'}
                </Text>
                <Text className={s.stepDesc} block>
                  {isEdit
                    ? '可调整显示名称与服务地址'
                    : '填写显示名称与服务地址，下一步再配置密钥'}
                </Text>
              </div>
              <div className={s.formGrid}>
                <OpptrixField label="显示名称">
                  <OpptrixInput
                    value={name}
                    onChange={(_, d) => setName(d.value || '')}
                    placeholder="例如 我的服务"
                  />
                </OpptrixField>
                <OpptrixField
                  label="服务地址"
                  hint="填写完整兼容接口根地址；路径因服务而异（如 /v1、/v4、/openai），系统不会自动补全"
                >
                  <OpptrixInput
                    value={baseUrl}
                    onChange={(_, d) => setBaseUrl(d.value || '')}
                    placeholder="https://api.example.com/v1"
                  />
                </OpptrixField>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <div className={s.stepIntro}>
                <Text className={s.stepTitle} block>填写密钥</Text>
                <Text className={s.stepDesc} block>
                  {isEdit
                    ? '留空表示沿用已保存的密钥；填写新密钥将重新验证并拉取模型列表。'
                    : isOnboarding
                      ? '密钥保存在你的电脑上。点「继续」将自动验证并拉取可用模型。'
                      : '密钥保存在本地。点击「下一步」将自动验证并拉取可用模型。'}
                </Text>
              </div>
              <div className={s.formGrid}>
                {name.trim() ? (
                  <div className={s.providerMeta}>
                    <Text className={s.providerMetaName}>{name.trim()}</Text>
                    {signupUrl ? (
                      <a
                        className={s.signupLink}
                        href={signupUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        点此获取密钥
                      </a>
                    ) : null}
                  </div>
                ) : null}
                <OpptrixField label={isEdit ? '密钥（可选）' : '密钥'}>
                  <OpptrixInput
                    type="password"
                    value={apiKey}
                    onChange={(_, d) => setApiKey(d.value || '')}
                    onInput={e => setApiKey((e.target as HTMLInputElement).value || '')}
                    placeholder={isEdit ? '留空不修改' : '粘贴密钥'}
                    autoComplete="off"
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
                  <Text style={{ fontSize: 'var(--opptrix-font-base)', color: opptrixCssVars.textSecondary }}>
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
                      <Text style={{ fontSize: 'var(--opptrix-font-base)', fontFamily: 'var(--opptrix-font-mono)', lineHeight: 1.4 }}>
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

      {!hideFooter && (
      <div className={s.footer}>
        {!(hideCancel && step === 1 && !showCustomForm) && (
        <OpptrixButton
          className={s.footerBack}
          variant="secondary"
          onClick={handleBack}
        >
          {step === 1
            ? (showCustomForm ? '返回列表' : '取消')
            : '上一步'}
        </OpptrixButton>
        )}
        {step < 3 ? (
          showPresetList ? null : (
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
          )
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
      )}
    </div>
  )
}
