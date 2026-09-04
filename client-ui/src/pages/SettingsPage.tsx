import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import {
  Text, Spinner, Switch, makeStyles, mergeClasses,
  Dialog, DialogSurface, DialogBody, DialogTitle, DialogContent,
} from '@fluentui/react-components'
import { DeleteRegular, EditRegular, AddRegular, SystemRegular, WeatherMoonRegular, WeatherSunnyRegular } from '@fluentui/react-icons'
import OpptrixButton from '../components/opptrix/OpptrixButton'
import { useOpptrixDialogAlert } from '../components/opptrix/OpptrixDialogAlert'
import ProviderWizard from './ProviderWizard'
import SettingsSidebar, {
  settingsSectionTitle, settingsSectionSubtitle, type SettingsSection,
} from './settings/SettingsSidebar'
import { normalizeSettingsSection } from './settings/settingsTypes'
import type { SettingsSearchEntry } from './settings/settingsSearchIndex'
import SettingsBackRow from './settings/SettingsBackRow'
import DataProvidersSettingsSection from './settings/DataProvidersSettingsSection'
import McpServersSettingsSection from './settings/McpServersSettingsSection'
import AgentSkillsSettingsSection from './settings/AgentSkillsSettingsSection'
import NewsFeedSettingsSection from './settings/NewsFeedSettingsSection'
import TranslationSettingsSection from './settings/TranslationSettingsSection'
import MultimodalSettingsSection from './settings/MultimodalSettingsSection'
import DocLibrarySettingsSection from './settings/DocLibrarySettingsSection'
import SandboxSettingsSection from './settings/SandboxSettingsSection'
import CapabilityPacksSettingsSection from './settings/CapabilityPacksSettingsSection'
import PlatformMeterSettingsSection from './settings/PlatformMeterSettingsSection'
import ExtensionsSettingsSection from './settings/ExtensionsSettingsSection'
import ScheduleSettingsSection from './settings/ScheduleSettingsSection'
import PythonEnvironmentSettingsSection from './settings/PythonEnvironmentSettingsSection'
import SelfEvolveSettingsSection from './settings/SelfEvolveSettingsSection'
import PortfolioFeeSettingsSection from './settings/PortfolioFeeSettingsSection'
import AboutSettingsSection from './settings/AboutSettingsSection'
import { readSystemUpdateTab } from '../utils/settingsDeepLink'
import SystemUpdateSettingsSection from './settings/SystemUpdateSettingsSection'
import AccountSecuritySettingsSection from './settings/AccountSecuritySettingsSection'
import PwaInstallSettingsSection from './settings/PwaInstallSettingsSection'
import { SystemProxySettingsSection } from './settings/SystemProxySettingsSection'
import { SettingsToastProvider, useSettingsToast } from './settings/SettingsToast'
import {
  SettingsGroup, SettingsRow, SettingsEmptyState,
  SettingsTextField, SettingsProviderRow, SettingsPanelHeader,
  SettingsSectionLabel,
} from './settings/SettingsPrimitives'
import {
  getConfig, patchConfig, deleteProvider, getHealth, news,
  type AppConfig, type PublicProvider, type SystemProxySettings,
} from '../api/client'
import {
  applyFontScale, readFontScalePreference, writeFontScalePreference,
  type FontScaleName,
} from '../theme/fontScale'
import {
  applyFontFamily, readFontFamilyPreference, writeFontFamilyPreference,
  type FontFamilyPreset,
} from '../theme/fontFamily'
import {
  playChatCueSound,
  unlockChatCueSound,
  readChatSoundPreference,
  writeChatSoundPreference,
} from '../platform/chatSound'
import FontScalePreferencePicker from './settings/FontScalePreferencePicker'
import FontFamilyPreferencePicker from './settings/FontFamilyPreferencePicker'
import { opptrixTokens, opptrixCssVars, type ThemePreference } from '../theme/tokens'
import { useTheme } from '../theme/ThemeContext'
import { isElectron } from '../platform/detect'
import WorkspaceSplitDivider from '../chat/WorkspaceSplitDivider'
import { useDebouncedEffect } from '../hooks/useDebouncedEffect'
import { useSidebarOverlayMode } from '../hooks/useBreakpoint'
import { useSettingsSidebarWidth } from '../hooks/useSettingsSidebarWidth'

const SCORECARD_SAVE_MS = 650

const useStyles = makeStyles({
  page: {
    display: 'flex',
    flexDirection: 'row',
    flex: 1,
    width: '100%',
    height: '100%',
    minWidth: 0,
    minHeight: 0,
    overflow: 'hidden',
    backgroundColor: 'transparent',
  },
  pageMobile: {
    flexDirection: 'column',
    backgroundColor: opptrixCssVars.canvas,
  },
  pageBody: {
    display: 'flex',
    flexDirection: 'row',
    flex: 1,
    minWidth: 0,
    minHeight: 0,
    overflow: 'hidden',
  },
  pageBodyMobile: {
    flexDirection: 'column',
  },
  contentShell: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: opptrixCssVars.canvas,
    overflow: 'hidden',
  },
  contentScroll: {
    flex: 1,
    minHeight: 0,
    width: '100%',
    overflowX: 'hidden',
    overflowY: 'auto',
  },
  contentColumn: {
    width: opptrixTokens.settingsContentWidth,
    maxWidth: opptrixTokens.settingsContentMaxWidth,
    minWidth: 0,
    marginLeft: 'auto',
    marginRight: 'auto',
    display: 'flex',
    flexDirection: 'column',
    boxSizing: 'border-box',
    paddingLeft: 'clamp(12px, 3.5vw, 32px)',
    paddingRight: 'clamp(12px, 3.5vw, 32px)',
  },
  /** 侧栏浮层 / 小窗口 — 内容区占满可用宽度，仅保留最小边距 */
  contentColumnFlush: {
    width: '100%',
    maxWidth: 'none',
    marginLeft: 0,
    marginRight: 0,
    paddingLeft: 'clamp(10px, 3vw, 20px)',
    paddingRight: 'clamp(10px, 3vw, 20px)',
  },
  contentColumnMobile: {
    width: '100%',
    maxWidth: 'none',
    marginLeft: 0,
    marginRight: 0,
    paddingLeft: '12px',
    paddingRight: '12px',
  },
  contentHeaderMobile: {
    paddingTop: '12px',
  },
  contentHeaderFlush: {
    /** 无次级 title band 时略增顶距，避免贴窗沿 */
    paddingTop: '28px',
  },
  pageSubtitleFlush: {
    maxWidth: 'none',
  },
  contentHeader: {
    flexShrink: 0,
    /** 去掉 mac 次级「设置」header 后补足原先 title band 的呼吸空间 */
    paddingTop: '40px',
    paddingBottom: '4px',
  },
  contentBack: {
    marginBottom: '12px',
    marginLeft: '-2px',
  },
  contentBackMobile: {
    marginBottom: 0,
    marginLeft: 0,
  },
  pageTitle: {
    fontSize: '17px',
    fontWeight: 500,
    lineHeight: '21px',
    color: opptrixCssVars.textPrimary,
  },
  pageSubtitle: {
    fontSize: 'var(--opptrix-font-base)',
    fontWeight: 400,
    color: opptrixCssVars.textSecondary,
    lineHeight: '18px',
    marginTop: '4px',
    maxWidth: '52ch',
  },
  contentBody: {
    padding: '16px 0 32px',
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
  },
  contentBodyCompact: {
    padding: '10px 0 20px',
    gap: '12px',
  },
  contentScrollFill: {
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  contentColumnFill: {
    flex: 1,
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
  },
  contentBodyFill: {
    flex: 1,
    minHeight: 0,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    paddingBottom: '16px',
  },
  sectionBlock: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  saveHint: {
    fontSize: 'var(--opptrix-font-md)',
    color: opptrixCssVars.textTertiary,
    minHeight: '18px',
    paddingLeft: '2px',
  },
  saveHintActive: {
    color: opptrixCssVars.textSecondary,
  },
  aboutMeta: {
    fontSize: 'var(--opptrix-font-lg)',
    color: opptrixCssVars.textSecondary,
    lineHeight: 1.65,
  },
  dialogSurface: {
    maxWidth: '520px',
    width: 'calc(100vw - 40px)',
    maxHeight: 'calc(100dvh - 32px)',
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
  },
  dialogBody: {
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
    minHeight: 0,
    overflow: 'hidden',
  },
  dialogTitle: {
    fontSize: 'var(--opptrix-font-2xl)',
    fontWeight: 650,
    letterSpacing: '-0.02em',
    color: opptrixCssVars.textPrimary,
    flexShrink: 0,
  },
  dialogContent: {
    flex: 1,
    minHeight: 0,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  },
  themePicker: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '2px',
    padding: '2px',
    borderRadius: opptrixTokens.radiusMd,
    backgroundColor: opptrixCssVars.canvasAlt,
    border: `1px solid ${opptrixCssVars.separator}`,
  },
  themePickerBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '34px',
    height: '30px',
    padding: 0,
    border: 'none',
    borderRadius: '6px',
    backgroundColor: 'transparent',
    color: opptrixCssVars.textTertiary,
    cursor: 'pointer',
    transitionProperty: 'background-color, color, box-shadow',
    transitionDuration: '140ms',
    transitionTimingFunction: 'cubic-bezier(0.4, 0, 0.2, 1)',
    ':hover': {
      color: opptrixCssVars.textPrimary,
      backgroundColor: opptrixCssVars.surfaceHover,
    },
    ':focus': { outline: 'none' },
    ':focus-visible': {
      outline: `2px solid ${opptrixCssVars.inputBorderFocus}`,
      outlineOffset: '2px',
    },
  },
  themePickerBtnActive: {
    backgroundColor: opptrixCssVars.canvas,
    color: opptrixCssVars.textPrimary,
    boxShadow: '0 1px 2px rgba(0, 0, 0, 0.06)',
  },
})

const THEME_OPTIONS: { id: ThemePreference; label: string; icon: typeof SystemRegular }[] = [
  { id: 'system', label: '跟随系统', icon: SystemRegular },
  { id: 'light', label: '浅色', icon: WeatherSunnyRegular },
  { id: 'dark', label: '深色', icon: WeatherMoonRegular },
]

function ThemePreferencePicker({
  value,
  onChange,
  className,
}: {
  value: ThemePreference
  onChange: (next: ThemePreference) => void
  className?: string
}) {
  const s = useStyles()
  return (
    <div className={mergeClasses(s.themePicker, className)} role="radiogroup" aria-label="主题">
      {THEME_OPTIONS.map(opt => {
        const Icon = opt.icon
        const active = value === opt.id
        return (
          <button
            key={opt.id}
            type="button"
            role="radio"
            aria-checked={active}
            aria-label={opt.label}
            title={opt.label}
            className={mergeClasses(s.themePickerBtn, active && s.themePickerBtnActive)}
            onClick={() => onChange(opt.id)}
          >
            <Icon fontSize={18} />
          </button>
        )
      })}
    </div>
  )
}

type SaveState = 'idle' | 'pending' | 'saved' | 'error'

interface SettingsPageProps {
  onBack: () => void
  onSaved?: () => void
  isMobile?: boolean
  sidebarVisible?: boolean
  onSidebarClose?: () => void
  initialSection?: SettingsSection
  /** Fired when the user picks another settings section (for URL deep-link sync). */
  onSectionChange?: (section: SettingsSection) => void
  /**
   * Electron left inset for the content-column title bar when settings sidebar is overlay.
   * Panel (inline) mode ignores this and uses the compact `DESKTOP_TITLE_GAP` inset.
   * Pass `desktopChromeToolbarReserve(fullscreen)` from ChatApp.
   */
  chromeToolbarReserve?: number
  /** Settings nav width — omit to own drag/persist via useSettingsSidebarWidth */
  sidebarWidth?: number
  sidebarDragging?: boolean
  onBeginSidebarDrag?: (clientX: number) => void
}

export default function SettingsPage(props: SettingsPageProps) {
  return (
    <SettingsToastProvider>
      <SettingsPageView {...props} />
    </SettingsToastProvider>
  )
}

function SettingsPageView({
  onBack, onSaved, isMobile = false,
  sidebarVisible = true,
  onSidebarClose,
  initialSection,
  onSectionChange,
  chromeToolbarReserve: _chromeToolbarReserve = 0,
  sidebarWidth: sidebarWidthProp,
  sidebarDragging: sidebarDraggingProp,
  onBeginSidebarDrag,
}: SettingsPageProps) {
  const toast = useSettingsToast()
  const { confirm } = useOpptrixDialogAlert()
  const { preference: themePreference, setPreference: setThemePreference } = useTheme()
  const [fontScale, setFontScaleState] = useState<FontScaleName>(() => readFontScalePreference())
  const setFontScale = useCallback((name: FontScaleName) => {
    writeFontScalePreference(name)
    applyFontScale(name)
    setFontScaleState(name)
  }, [])
  const [fontFamily, setFontFamilyState] = useState<FontFamilyPreset>(() => readFontFamilyPreference())
  const setFontFamily = useCallback((preset: FontFamilyPreset) => {
    writeFontFamilyPreference(preset)
    applyFontFamily(preset)
    setFontFamilyState(preset)
  }, [])
  const [chatSoundEnabled, setChatSoundEnabled] = useState(() => readChatSoundPreference())
  const setChatSound = useCallback((enabled: boolean) => {
    writeChatSoundPreference(enabled)
    setChatSoundEnabled(enabled)
    if (enabled) {
      unlockChatCueSound()
      playChatCueSound()
    }
  }, [])
  const s = useStyles()
  const [viewportWidth, setViewportWidth] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth : 1280,
  )
  useEffect(() => {
    const onResize = () => setViewportWidth(window.innerWidth)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  const ownsSidebarWidth = sidebarWidthProp == null
  const {
    width: internalSidebarWidth,
    isDragging: internalSidebarDragging,
    beginDrag: internalBeginSidebarDrag,
  } = useSettingsSidebarWidth({
    enabled: !isMobile && ownsSidebarWidth,
    viewportWidth,
  })
  const settingsSidebarWidth = sidebarWidthProp ?? internalSidebarWidth
  const settingsSidebarDragging = sidebarDraggingProp ?? internalSidebarDragging
  const beginSettingsSidebarDrag = onBeginSidebarDrag ?? internalBeginSidebarDrag
  const sidebarOverlayMode = useSidebarOverlayMode(!isMobile, settingsSidebarWidth)
  const [section, setSection] = useState<SettingsSection>(() => normalizeSettingsSection(initialSection))
  const selectSection = useCallback((next: SettingsSection) => {
    setSection(next)
    onSectionChange?.(next)
  }, [onSectionChange])
  const [search, setSearch] = useState('')
  const [wizardOpen, setWizardOpen] = useState(false)
  const [editingProvider, setEditingProvider] = useState<PublicProvider | null>(null)
  const [config, setConfig] = useState<AppConfig | null>(null)
  const [newsSearchEntries, setNewsSearchEntries] = useState<SettingsSearchEntry[]>([])
  const [scorecard, setScorecard] = useState('综合评估')
  const [loading, setLoading] = useState(() => {
    const sec = normalizeSettingsSection(initialSection)
    return sec === 'general' || sec === 'models'
  })
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const skipScorecardSave = useRef(true)
  const scorecardBaseline = useRef<string | null>(null)
  const newsSearchLoaded = useRef(false)
  const electronChrome = isElectron() && !isMobile
  const searchActive = Boolean(search.trim()) && !isMobile
  const needsConfig = section === 'general' || section === 'models'

  const refresh = useCallback(async () => {
    const cfg = await getConfig()
    setConfig(cfg)
    const baseline = cfg.default_scorecard || '综合评估'
    scorecardBaseline.current = baseline
    skipScorecardSave.current = true
    setScorecard(baseline)
    return cfg
  }, [])

  useEffect(() => {
    if (!needsConfig || config !== null) return
    let active = true
    setLoading(true)
    getConfig()
      .then((cfg) => {
        if (!active) return
        setLoading(false)
        setConfig(cfg)
        const baseline = cfg.default_scorecard || '综合评估'
        scorecardBaseline.current = baseline
        skipScorecardSave.current = true
        setScorecard(baseline)
      })
      .catch((e) => {
        console.error('[settings] config load failed:', e)
        if (active) {
          setLoading(false)
          toast.showError('无法读取后端配置，请确认服务已启动')
        }
      })
    return () => { active = false }
  }, [needsConfig, toast])

  useEffect(() => {
    if (section !== 'news_feed' && !searchActive) return
    if (newsSearchLoaded.current) return
    newsSearchLoaded.current = true
    news.listSubscriptions()
      .then(res => {
        const entries: SettingsSearchEntry[] = []
        for (const sub of res.subscriptions) {
          const groupTitle = res.groups.find(g => g.id === sub.group_id)?.title
          entries.push({
            section: 'news_feed',
            group: '订阅源',
            title: sub.title,
            desc: groupTitle ?? '未分组',
          })
        }
        for (const group of res.groups) {
          entries.push({
            section: 'news_feed',
            group: '订阅分组',
            title: group.title,
          })
        }
        setNewsSearchEntries(entries)
      })
      .catch(() => setNewsSearchEntries([]))
  }, [section, searchActive])

  useEffect(() => {
    setSection(normalizeSettingsSection(initialSection))
  }, [initialSection])

  useDebouncedEffect(() => {
    if (loading || skipScorecardSave.current) {
      skipScorecardSave.current = false
      return
    }
    const baseline = scorecardBaseline.current
    if (baseline === null || scorecard === baseline) return

    setSaveState('pending')
    patchConfig({ default_scorecard: scorecard })
      .then(() => {
        scorecardBaseline.current = scorecard
        setConfig(prev => (prev ? { ...prev, default_scorecard: scorecard } : prev))
        setSaveState('saved')
        onSaved?.()
        toast.showSuccess('已保存')
        window.setTimeout(() => setSaveState('idle'), 2000)
      })
      .catch((e: unknown) => {
        setSaveState('error')
        toast.showError(e instanceof Error ? e.message : '保存失败')
        window.setTimeout(() => setSaveState('idle'), 2000)
      })
  }, [scorecard, loading, onSaved, toast], SCORECARD_SAVE_MS, true)

  const handleSystemProxySaved = useCallback((next: SystemProxySettings) => {
    setConfig(prev => (prev ? { ...prev, system_proxy: next } : prev))
    onSaved?.()
  }, [onSaved])

  const openProviderWizard = useCallback((provider: PublicProvider | null = null) => {
    setEditingProvider(provider)
    setWizardOpen(true)
  }, [])

  const closeProviderWizard = useCallback(() => {
    setWizardOpen(false)
    setEditingProvider(null)
  }, [])

  const handleDeleteProvider = async (p: PublicProvider) => {
    const ok = await confirm({
      title: `确定删除提供商「${p.name}」？`,
      message: '删除后将无法使用该提供商下的模型。',
      confirmLabel: '删除',
      confirmTone: 'danger',
    })
    if (!ok) return
    try {
      await deleteProvider(p.id)
      await refresh()
      toast.showSuccess('已删除')
      onSaved?.()
    } catch (e) {
      toast.showError(e instanceof Error ? e.message : '删除失败')
    }
  }

  const handleTest = async () => {
    try {
      const health = await getHealth()
      toast.showSuccess(health.llm_configured
        ? `连接正常 · ${health.available_models ?? 0} 个可用模型`
        : '后端已连接，但尚未配置大模型提供商')
    } catch (e) {
      toast.showError(e instanceof Error ? e.message : '连接失败')
    }
  }

  const providers = useMemo(() => config?.providers ?? [], [config?.providers])

  const dynamicSearchEntries = useMemo((): SettingsSearchEntry[] => {
    const entries: SettingsSearchEntry[] = []
    for (const p of providers) {
      entries.push({
        section: 'models',
        title: p.name,
        desc: '提供商',
        keywords: [p.base_url, ...p.models, '大模型'],
      })
    }
    entries.push(...newsSearchEntries)
    return entries
  }, [providers, newsSearchEntries])

  const saveHintText = (() => {
    switch (saveState) {
      case 'pending': return '正在保存…'
      case 'saved': return '已保存'
      case 'error': return '保存失败，请重试'
      default: return ''
    }
  })()

  const contentFlush = isMobile || sidebarOverlayMode

  const renderSection = () => {
    if (loading && needsConfig) return <Spinner size="tiny" label="加载配置…" />

    switch (section) {
      case 'general':
        return (
          <>
            <div className={s.sectionBlock}>
              <SettingsSectionLabel spaced>外观</SettingsSectionLabel>
              <SettingsGroup>
                <SettingsRow
                  title="主题"
                  desc="切换后立即生效；跟随系统会随操作系统浅色/深色自动变化"
                  control={(
                    <ThemePreferencePicker
                      value={themePreference}
                      onChange={setThemePreference}
                    />
                  )}
                />
                <SettingsRow
                  title="界面字体"
                  desc="使用本机系统字体，按设备自动适配；不下载额外字库"
                  control={(
                    <FontFamilyPreferencePicker
                      value={fontFamily}
                      onChange={setFontFamily}
                    />
                  )}
                />
                <SettingsRow
                  title="字体大小"
                  desc="调整全局文字尺寸，切换后立即生效"
                  control={(
                    <FontScalePreferencePicker
                      value={fontScale}
                      onChange={setFontScale}
                    />
                  )}
                />
                <SettingsRow
                  title="提示音"
                  desc="对话完成或需要你确认时播放轻提示"
                  control={(
                    <Switch
                      checked={chatSoundEnabled}
                      onChange={(_, data) => setChatSound(Boolean(data.checked))}
                      aria-label="提示音"
                    />
                  )}
                  last
                />
              </SettingsGroup>
            </div>

            <div className={s.sectionBlock}>
              <SettingsSectionLabel spaced>偏好</SettingsSectionLabel>
              <SettingsGroup>
                <SettingsRow
                  title="评分卡"
                  desc="因子评估默认使用的评分模板"
                  control={(
                    <SettingsTextField
                      value={scorecard}
                      onChange={setScorecard}
                      placeholder="G=B+M"
                    />
                  )}
                  last
                />
              </SettingsGroup>
              <Text className={mergeClasses(s.saveHint, saveState !== 'idle' && s.saveHintActive)} block>
                {saveHintText}
              </Text>
            </div>

            <div className={s.sectionBlock}>
              <SettingsSectionLabel spaced>网络</SettingsSectionLabel>
              <SystemProxySettingsSection
                saved={config?.system_proxy}
                onSaved={handleSystemProxySaved}
              />
            </div>

            <div className={s.sectionBlock}>
              <SettingsSectionLabel spaced>连接</SettingsSectionLabel>
              <SettingsGroup>
                <SettingsRow
                  title="后端连接"
                  desc="检查服务连接与大模型配置是否正常"
                  control={(
                    <OpptrixButton variant="secondary" onClick={handleTest}>
                      测试
                    </OpptrixButton>
                  )}
                  last
                />
              </SettingsGroup>
            </div>

            {!isElectron() && (
              <div className={s.sectionBlock}>
                <PwaInstallSettingsSection />
              </div>
            )}
          </>
        )

      case 'models':
        return (
          <>
            <div className={s.sectionBlock}>
              <SettingsGroup>
                <SettingsPanelHeader
                  title="提供商"
                  action={(
                    <OpptrixButton
                      variant="secondary"
                      size="small"
                      icon={<AddRegular />}
                      onClick={() => openProviderWizard()}
                    >
                      添加
                    </OpptrixButton>
                  )}
                />
                {providers.length === 0 ? (
                  <SettingsEmptyState
                    title="还没有配置提供商"
                    desc="点击上方「添加」，选择预置服务或自定义后即可开始对话"
                  />
                ) : (
                  providers.map((p, i) => (
                    <SettingsProviderRow
                      key={p.id}
                      name={p.name}
                      models={p.models}
                      avatar={p.name.charAt(0).toUpperCase()}
                      first={i === 0}
                      action={(
                        <>
                          <OpptrixButton
                            variant="icon"
                            icon={<EditRegular />}
                            onClick={() => openProviderWizard(p)}
                            aria-label={`编辑 ${p.name}`}
                          />
                          <OpptrixButton
                            variant="icon"
                            icon={<DeleteRegular />}
                            onClick={() => handleDeleteProvider(p)}
                            aria-label={`删除 ${p.name}`}
                          />
                        </>
                      )}
                    />
                  ))
                )}
              </SettingsGroup>
            </div>
          </>
        )


      case 'data_providers':
        return <DataProvidersSettingsSection />

      case 'mcp_servers':
        return <McpServersSettingsSection />

      case 'agent_skills':
        return <AgentSkillsSettingsSection />

      case 'self_evolve':
        return <SelfEvolveSettingsSection />

      case 'news_feed':
        return <NewsFeedSettingsSection />

      case 'sandbox':
        return <SandboxSettingsSection />

      case 'capability_packs':
        return (
          <>
            <div className={s.sectionBlock}>
              <CapabilityPacksSettingsSection />
            </div>
            <div className={s.sectionBlock}>
              <ExtensionsSettingsSection />
            </div>
            <div className={s.sectionBlock}>
              <PlatformMeterSettingsSection />
            </div>
          </>
        )

      case 'schedule':
        return <ScheduleSettingsSection />

      case 'python':
        return <PythonEnvironmentSettingsSection />

      case 'portfolio_fees':
        return <PortfolioFeeSettingsSection />

      case 'account_security':
        return <AccountSecuritySettingsSection />

      case 'translation':
        return <TranslationSettingsSection />

      case 'doc_library':
        return <DocLibrarySettingsSection />

      case 'multimodal':
        return <MultimodalSettingsSection />

      case 'system_update':
        return <SystemUpdateSettingsSection initialTab={readSystemUpdateTab()} />

      case 'about':
        return <AboutSettingsSection contentFlush={contentFlush} />

      default:
        return null
    }
  }

  const sectionTitle = settingsSectionTitle(section)
  const sectionSubtitle = settingsSectionSubtitle(section)

  return (
    <div className={mergeClasses(
      s.page,
      isMobile && s.pageMobile,
    )}
    >
      <div className={mergeClasses(s.pageBody, isMobile && s.pageBodyMobile)}>
      {!sidebarOverlayMode && (
        <>
          <SettingsSidebar
            mode="panel"
            width={settingsSidebarWidth}
            active={section}
            onSelect={selectSection}
            onBack={onBack}
            search={search}
            onSearchChange={setSearch}
            dynamicSearchEntries={dynamicSearchEntries}
            isMobile={isMobile}
          />
          {!isMobile && (
            <WorkspaceSplitDivider
              electronChrome={electronChrome}
              isDragging={settingsSidebarDragging}
              onBeginDrag={beginSettingsSidebarDrag}
              ariaLabel="调整设置侧栏宽度"
            />
          )}
        </>
      )}
      {sidebarOverlayMode && (
        <SettingsSidebar
          mode="overlay"
          width={settingsSidebarWidth}
          visible={sidebarVisible}
          onClose={onSidebarClose}
          active={section}
          onSelect={selectSection}
          onBack={onBack}
          search={search}
          onSearchChange={setSearch}
          dynamicSearchEntries={dynamicSearchEntries}
          isMobile={isMobile}
        />
      )}

      <div
        className={mergeClasses(
          s.contentShell,
          'opptrix-settings-content',
        )}
      >
        <div className={mergeClasses(
          s.contentScroll,
          'opptrix-scroll',
        )}>
          <div className={mergeClasses(
            s.contentColumn,
            contentFlush && s.contentColumnFlush,
            isMobile && s.contentColumnMobile,
          )}>
            <header className={mergeClasses(
              s.contentHeader,
              contentFlush && s.contentHeaderFlush,
              isMobile && s.contentHeaderMobile,
            )}>
              {sidebarOverlayMode && !sidebarVisible && (
                <SettingsBackRow
                  className={mergeClasses(s.contentBack, isMobile && s.contentBackMobile)}
                  onClick={onBack}
                  mobile={isMobile}
                />
              )}
              <Text className={s.pageTitle} block>{sectionTitle}</Text>
              <Text
                className={mergeClasses(s.pageSubtitle, contentFlush && s.pageSubtitleFlush)}
                block
              >
                {sectionSubtitle}
              </Text>
            </header>

            <div className={mergeClasses(
              s.contentBody,
              section === 'data_providers' && s.contentBodyCompact,
            )}>
              {renderSection()}
            </div>
          </div>
        </div>
      </div>
      </div>

      <Dialog open={wizardOpen} onOpenChange={(_, data) => { if (!data.open) closeProviderWizard() }}>
        <DialogSurface className={mergeClasses(
          s.dialogSurface,
          'opptrix-dialog-surface',
          'opptrix-provider-wizard-dialog',
        )}>
          <DialogBody className={s.dialogBody}>
            <DialogTitle className={s.dialogTitle}>
              {editingProvider ? '编辑提供商' : '添加提供商'}
            </DialogTitle>
            <DialogContent className={s.dialogContent}>
              <ProviderWizard
                key={editingProvider?.id ?? 'new'}
                provider={editingProvider}
                onCancel={closeProviderWizard}
                onDone={async () => {
                  const wasEdit = Boolean(editingProvider)
                  await refresh()
                  closeProviderWizard()
                  setSection('models')
                  toast.showSuccess(wasEdit ? '提供商已更新' : '提供商已添加')
                  onSaved?.()
                }}
              />
            </DialogContent>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </div>
  )
}
