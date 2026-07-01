import { useState, useEffect, useCallback, useRef } from 'react'
import {
  Text, Spinner, makeStyles, mergeClasses,
  Dialog, DialogSurface, DialogBody, DialogTitle, DialogContent,
} from '@fluentui/react-components'
import { ChevronRightRegular, DeleteRegular, EditRegular } from '@fluentui/react-icons'
import OpptrixButton from '../components/opptrix/OpptrixButton'
import ProviderWizard from './ProviderWizard'
import SettingsSidebar, {
  settingsSectionTitle, settingsSectionSubtitle, type SettingsSection,
} from './settings/SettingsSidebar'
import SettingsBackRow from './settings/SettingsBackRow'
import MarketDataSettingsSection from './settings/MarketDataSettingsSection'
import DiscoverStrategiesSettingsSection from './settings/DiscoverStrategiesSettingsSection'
import NewsFeedSettingsSection from './settings/NewsFeedSettingsSection'
import { SettingsToastProvider, useSettingsToast } from './settings/SettingsToast'
import {
  SettingsGroup, SettingsRow, SettingsStaticBlock,
  SettingsTextField, SettingsProviderRow, SettingsActionRow,
} from './settings/SettingsPrimitives'
import {
  getConfig, patchConfig, deleteProvider, getHealth,
  type AppConfig, type PublicProvider,
} from '../api/client'
import { opptrixTokens } from '../theme/tokens'
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
    backgroundColor: opptrixTokens.canvas,
  },
  contentShell: {
    flex: 1,
    minWidth: 0,
    minHeight: 0,
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: opptrixTokens.canvas,
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
    color: opptrixTokens.textPrimary,
  },
  pageSubtitle: {
    fontSize: '14px',
    fontWeight: 400,
    color: opptrixTokens.textSecondary,
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
    color: opptrixTokens.textSecondary,
    letterSpacing: '-0.01em',
    paddingLeft: '2px',
  },
  saveHint: {
    fontSize: '12px',
    color: opptrixTokens.textTertiary,
    minHeight: '18px',
    paddingLeft: '2px',
  },
  saveHintActive: {
    color: opptrixTokens.textSecondary,
  },
  aboutProse: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    maxWidth: '52ch',
    paddingTop: '4px',
  },
  aboutProseFlush: {
    maxWidth: 'none',
  },
  aboutTitle: {
    fontSize: '15px',
    fontWeight: 600,
    letterSpacing: '-0.02em',
    color: opptrixTokens.textPrimary,
    lineHeight: 1.45,
  },
  aboutMeta: {
    fontSize: '14px',
    color: opptrixTokens.textSecondary,
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
    color: opptrixTokens.textPrimary,
  },
})

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
  const s = useStyles()
  const sidebarOverlayMode = useSidebarOverlayMode(!isMobile)
  const [section, setSection] = useState<SettingsSection>(initialSection ?? 'general')
  const [search, setSearch] = useState('')
  const [wizardOpen, setWizardOpen] = useState(false)
  const [editingProvider, setEditingProvider] = useState<PublicProvider | null>(null)
  const [config, setConfig] = useState<AppConfig | null>(null)
  const [scorecard, setScorecard] = useState('综合评估')
  const [loading, setLoading] = useState(true)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const skipScorecardSave = useRef(true)
  const scorecardBaseline = useRef<string | null>(null)
  const electronChrome = isElectron() && !isMobile

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
    setLoading(true)
    refresh()
      .catch(() => toast.showError('无法读取后端配置，请确认服务已启动'))
      .finally(() => setLoading(false))
  }, [refresh, toast])

  useEffect(() => {
    if (initialSection) setSection(initialSection)
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
    if (!confirm(`确定删除提供商「${p.name}」？`)) return
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

  const providers = config?.providers ?? []

  const saveHintText = (() => {
    switch (saveState) {
      case 'pending': return '正在保存…'
      case 'saved': return '已保存'
      case 'error': return ''
      default: return ''
    }
  })()

  const contentFlush = isMobile || sidebarOverlayMode

  const renderSection = () => {
    if (loading) return <Spinner size="tiny" label="加载配置..." />

    switch (section) {
      case 'general':
        return (
          <>
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
                icon={<ChevronRightRegular fontSize={16} color={opptrixTokens.textTertiary} />}
                onClick={() => openProviderWizard()}
              />
            </SettingsGroup>
          </div>
        )

      case 'market_data':
        return <MarketDataSettingsSection />

      case 'discover_strategies':
        return <DiscoverStrategiesSettingsSection />

      case 'news_feed':
        return <NewsFeedSettingsSection />

      case 'about':
        return (
          <div className={mergeClasses(s.aboutProse, contentFlush && s.aboutProseFlush)}>
            <Text className={s.aboutTitle} block>Opptrix · 你的A股投研助手</Text>
            <Text className={s.aboutMeta} block>
              21 投研工具 · 多会话 · Function Calling · 多模型提供商。
            </Text>
            <Text className={s.aboutMeta} block>
              本地运行，数据与 API Key 保存在本机服务端。
            </Text>
          </div>
        )

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
              section === 'market_data' && s.contentBodyCompact,
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
