import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import {
  Text, Spinner, makeStyles, mergeClasses,
  Dialog, DialogSurface, DialogBody, DialogTitle, DialogContent,
} from '@fluentui/react-components'
import { ChevronRightRegular, DeleteRegular, EditRegular, SystemRegular, WeatherMoonRegular, WeatherSunnyRegular } from '@fluentui/react-icons'
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
import DiscoverStrategiesSettingsSection from './settings/DiscoverStrategiesSettingsSection'
import NewsFeedSettingsSection from './settings/NewsFeedSettingsSection'
import TranslationSettingsSection from './settings/TranslationSettingsSection'
import MultimodalSettingsSection from './settings/MultimodalSettingsSection'
import AboutSettingsSection from './settings/AboutSettingsSection'
import { SettingsToastProvider, useSettingsToast } from './settings/SettingsToast'
import {
  SettingsGroup, SettingsRow, SettingsStaticBlock,
  SettingsTextField, SettingsProviderRow, SettingsActionRow,
} from './settings/SettingsPrimitives'
import {
  getConfig, patchConfig, deleteProvider, getHealth, listDiscoverStrategies, news,
  type AppConfig, type PublicProvider,
} from '../api/client'
import { opptrixTokens, opptrixCssVars, type ThemePreference } from '../theme/tokens'
import { useTheme } from '../theme/ThemeContext'
import { isElectron } from '../platform/detect'
import { DESKTOP_TITLEBAR_HEIGHT } from '../desktop/constants'
import { useDebouncedEffect } from '../hooks/useDebouncedEffect'
import { useSidebarOverlayMode } from '../hooks/useBreakpoint'

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
  contentShellElectron: {
    paddingTop: `calc(${DESKTOP_TITLEBAR_HEIGHT}px + ${opptrixTokens.windowInset})`,
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
    paddingLeft: '28px',
    paddingRight: '28px',
  },
  /** 侧栏浮层 / 小窗口 — 内容区占满可用宽度，仅保留最小边距 */
  contentColumnFlush: {
    width: '100%',
    maxWidth: 'none',
    marginLeft: 0,
    marginRight: 0,
    paddingLeft: '12px',
    paddingRight: '12px',
  },
  contentColumnMobile: {
    width: '100%',
    maxWidth: 'none',
    marginLeft: 0,
    marginRight: 0,
    paddingLeft: '12px',
    paddingRight: '12px',
  },
  contentHeaderFlush: {
    paddingTop: '16px',
  },
  pageSubtitleFlush: {
    maxWidth: 'none',
  },
  contentHeader: {
    flexShrink: 0,
    paddingTop: '24px',
    paddingBottom: '4px',
  },
  contentBack: {
    marginBottom: '12px',
    marginLeft: '-2px',
  },
  pageTitle: {
    fontSize: '20px',
    fontWeight: 600,
    letterSpacing: '-0.02em',
    lineHeight: 1.3,
    color: opptrixCssVars.textPrimary,
  },
  pageSubtitle: {
    fontSize: '14px',
    fontWeight: 400,
    color: opptrixCssVars.textSecondary,
    lineHeight: 1.55,
    marginTop: '8px',
    maxWidth: '52ch',
  },
  contentBody: {
    padding: '16px 0 32px',
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
  },
  contentBodyCompact: {
    padding: '10px 0 20px',
    gap: '8px',
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
    gap: '10px',
  },
  sectionLabel: {
    fontSize: '13px',
    fontWeight: 600,
    color: opptrixCssVars.textSecondary,
    letterSpacing: '-0.01em',
    paddingLeft: '2px',
  },
  saveHint: {
    fontSize: '12px',
    color: opptrixCssVars.textTertiary,
    minHeight: '18px',
    paddingLeft: '2px',
  },
  saveHintActive: {
    color: opptrixCssVars.textSecondary,
  },
  aboutMeta: {
    fontSize: '14px',
    color: opptrixCssVars.textSecondary,
    lineHeight: 1.65,
  },
  dialogSurface: {
    maxWidth: '520px',
    width: 'calc(100vw - 40px)',
  },
  dialogTitle: {
    fontSize: '17px',
    fontWeight: 650,
    letterSpacing: '-0.02em',
    color: opptrixCssVars.textPrimary,
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
}: SettingsPageProps) {
  const toast = useSettingsToast()
  const { confirm } = useOpptrixDialogAlert()
  const { preference: themePreference, setPreference: setThemePreference } = useTheme()
  const s = useStyles()
  const sidebarOverlayMode = useSidebarOverlayMode(!isMobile)
  const [section, setSection] = useState<SettingsSection>(() => normalizeSettingsSection(initialSection))
  const [search, setSearch] = useState('')
  const [wizardOpen, setWizardOpen] = useState(false)
  const [editingProvider, setEditingProvider] = useState<PublicProvider | null>(null)
  const [config, setConfig] = useState<AppConfig | null>(null)
  const [strategyNames, setStrategyNames] = useState<string[]>([])
  const [newsSearchEntries, setNewsSearchEntries] = useState<SettingsSearchEntry[]>([])
  const [scorecard, setScorecard] = useState('综合评估')
  const [loading, setLoading] = useState(() => {
    const sec = normalizeSettingsSection(initialSection)
    return sec === 'general' || sec === 'models'
  })
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const skipScorecardSave = useRef(true)
  const scorecardBaseline = useRef<string | null>(null)
  const strategiesSearchLoaded = useRef(false)
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
    console.log('[settings] loading config...')
    let cancelled = false
    setLoading(true)
    refresh()
      .then(() => { if (!cancelled) console.log('[settings] config loaded') })
      .catch((e) => {
        console.error('[settings] config load failed:', e)
        if (!cancelled) toast.showError('无法读取后端配置，请确认服务已启动')
      })
      .finally(() => {
        if (!cancelled) { setLoading(false); console.log('[settings] loading=false') }
      })
    // Safety timeout: if getConfig() hangs (e.g. Electron IPC issue),
    // ensure loading resolves so settings content can render.
    const timer = setTimeout(() => {
      if (!cancelled) setLoading(false)
    }, 12000)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [needsConfig, config, refresh, toast])

  useEffect(() => {
    if (section !== 'discover_strategies' && !searchActive) return
    if (strategiesSearchLoaded.current) return
    strategiesSearchLoaded.current = true
    listDiscoverStrategies()
      .then(res => setStrategyNames(res.strategies.map(item => item.name)))
      .catch(() => setStrategyNames([]))
  }, [section, searchActive])

  useEffect(() => {
    if (section !== 'news_feed' && !searchActive) return
    if (newsSearchLoaded.current) return
    newsSearchLoaded.current = true
    news.listSubscriptions()
      .then(res => {
        const entries: SettingsSearchEntry[] = []
        for (const sub of res.subscriptions) {
          entries.push({
            section: 'news_feed',
            group: '订阅源',
            title: sub.title,
            desc: sub.url,
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
        : '后端已连接，但尚未配置 LLM 提供商')
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
        desc: '模型提供商',
        keywords: [p.base_url, ...p.models],
      })
    }
    for (const name of strategyNames) {
      entries.push({
        section: 'discover_strategies',
        title: name,
        desc: '选股策略',
      })
    }
    entries.push(...newsSearchEntries)
    return entries
  }, [providers, strategyNames, newsSearchEntries])

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
              <Text className={s.sectionLabel} block>外观</Text>
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
                  last
                />
              </SettingsGroup>
            </div>

            <div className={s.sectionBlock}>
              <Text className={s.sectionLabel} block>偏好</Text>
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
              <Text className={s.sectionLabel} block>连接</Text>
              <SettingsGroup>
                <SettingsRow
                  title="后端连接"
                  desc="检查 API 服务与 LLM 提供商配置是否正常"
                  control={(
                    <OpptrixButton variant="secondary" onClick={handleTest}>
                      测试
                    </OpptrixButton>
                  )}
                  last
                />
              </SettingsGroup>
            </div>
          </>
        )

      case 'models':
        return (
          <div className={s.sectionBlock}>
            <Text className={s.sectionLabel} block>提供商</Text>
            <SettingsGroup>
              {providers.length === 0 ? (
                <SettingsStaticBlock>
                  <Text className={s.aboutMeta} block>
                    尚未配置任何提供商。添加 OpenAI 兼容接口以启用多模型对话。
                  </Text>
                </SettingsStaticBlock>
              ) : (
                providers.map((p, i) => (
                  <SettingsProviderRow
                    key={p.id}
                    name={p.name}
                    baseUrl={p.base_url}
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
              <SettingsActionRow
                title="添加模型提供商"
                desc="配置 Base URL 与 API Key"
                icon={<ChevronRightRegular fontSize={16} color={opptrixCssVars.textTertiary} />}
                onClick={() => openProviderWizard()}
              />
            </SettingsGroup>
          </div>
        )


      case 'data_providers':
        return <DataProvidersSettingsSection />

      case 'discover_strategies':
        return <DiscoverStrategiesSettingsSection />

      case 'news_feed':
        return <NewsFeedSettingsSection />

      case 'translation':
        return <TranslationSettingsSection />

      case 'multimodal':
        return <MultimodalSettingsSection />

      case 'about':
        return <AboutSettingsSection contentFlush={contentFlush} />

      default:
        return null
    }
  }

  const sectionTitle = settingsSectionTitle(section)
  const sectionSubtitle = settingsSectionSubtitle(section)

  return (
    <div className={mergeClasses(s.page, isMobile && s.pageMobile)}>
      {!sidebarOverlayMode && (
        <SettingsSidebar
          mode="panel"
          active={section}
          onSelect={setSection}
          onBack={onBack}
          search={search}
          onSearchChange={setSearch}
          dynamicSearchEntries={dynamicSearchEntries}
          isMobile={isMobile}
        />
      )}
      {sidebarOverlayMode && (
        <SettingsSidebar
          mode="overlay"
          visible={sidebarVisible}
          onClose={onSidebarClose}
          active={section}
          onSelect={setSection}
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
          electronChrome && s.contentShellElectron,
        )}
      >
        <div className={mergeClasses(
          s.contentScroll,
          'opptrix-scroll',
          section === 'discover_strategies' && s.contentScrollFill,
        )}>
          <div className={mergeClasses(
            s.contentColumn,
            contentFlush && s.contentColumnFlush,
            isMobile && s.contentColumnMobile,
            section === 'discover_strategies' && s.contentColumnFill,
          )}>
            <header className={mergeClasses(s.contentHeader, contentFlush && s.contentHeaderFlush)}>
              {sidebarOverlayMode && !sidebarVisible && (
                <SettingsBackRow className={s.contentBack} onClick={onBack} />
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
              section === 'discover_strategies' && s.contentBodyFill,
            )}>
              {renderSection()}
            </div>
          </div>
        </div>
      </div>

      <Dialog open={wizardOpen} onOpenChange={(_, data) => { if (!data.open) closeProviderWizard() }}>
        <DialogSurface className={mergeClasses(s.dialogSurface, 'opptrix-dialog-surface')}>
          <DialogBody>
            <DialogTitle className={s.dialogTitle}>
              {editingProvider ? '编辑模型提供商' : '添加模型提供商'}
            </DialogTitle>
            <DialogContent>
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
