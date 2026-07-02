import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ProgressBar,
  Spinner,
  Text,
  makeStyles,
  mergeClasses,
} from '@fluentui/react-components'
import {
  ArrowDownloadRegular,
  CheckmarkCircleRegular,
  DismissRegular,
} from '@fluentui/react-icons'
import { getConfig, news, type PublicProvider } from '../../api/client'
import type { NewsSettings, NewsTranslationSettings } from '../../types/schemas'
import OpptrixButton from '../../components/opptrix/OpptrixButton'
import OpptrixSelect, { OpptrixOption } from '../../components/opptrix/OpptrixSelect'
import {
  SettingsGroup,
  SettingsRow,
  SettingsStaticBlock,
  SettingsTextField,
} from './SettingsPrimitives'
import { useSettingsToast } from './SettingsToast'
import { useDebouncedEffect } from '../../hooks/useDebouncedEffect'
import { opptrixTokens, opptrixCssVars } from '../../theme/tokens'
import { ghostInteractive } from '../../theme/mixins'
import {
  isElectron,
  type TranslationDownloadProgress,
  type TranslationEngineStatus,
  type TranslationModelsResult,
} from '../../platform/detect'

const SETTINGS_SAVE_MS = 500

const useStyles = makeStyles({
  sectionBlock: {
    marginTop: '20px',
  },
  sectionHeaderRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '12px',
    padding: '0 2px 8px',
  },
  sectionHeaderLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    minWidth: 0,
    flex: 1,
  },
  sectionLabel: {
    fontSize: '11px',
    fontWeight: 600,
    color: opptrixCssVars.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    flexShrink: 0,
  },
  sectionLabelSpaced: {
    padding: '0 2px 8px',
  },
  saveHint: {
    fontSize: '11px',
    color: opptrixCssVars.textTertiary,
    padding: '4px 2px 0',
    minHeight: '16px',
  },
  saveHintActive: {
    color: opptrixCssVars.textSecondary,
  },
  listPanel: {
    border: opptrixCssVars.settingsPanelBorder,
    borderRadius: opptrixTokens.radiusLg,
    backgroundColor: opptrixCssVars.canvas,
    overflow: 'hidden',
    height: '360px',
    display: 'flex',
    flexDirection: 'column',
  },
  listScroll: {
    flex: 1,
    minHeight: 0,
    overflowY: 'auto',
    overscrollBehavior: 'contain',
  },
  listHeader: {
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '12px',
    padding: '10px 14px',
    minHeight: '44px',
    borderBottom: `1px solid ${opptrixCssVars.separator}`,
  },
  listHeaderMeta: {
    fontSize: '12px',
    color: opptrixCssVars.textTertiary,
    lineHeight: 1.45,
    flex: 1,
    minWidth: 0,
  },
  listHeaderActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flexShrink: 0,
    flexWrap: 'nowrap',
  },
  listRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '10px',
    padding: '5px 12px',
    minHeight: '34px',
    borderBottom: `1px solid ${opptrixCssVars.separator}`,
    ':last-child': {
      borderBottom: 'none',
    },
  },
  listRowMain: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '1px',
  },
  listRowTitle: {
    fontSize: '13px',
    fontWeight: 600,
    color: opptrixCssVars.textPrimary,
    lineHeight: 1.35,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  listRowMeta: {
    fontSize: '11px',
    color: opptrixCssVars.textTertiary,
    lineHeight: 1.4,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  listRowControls: {
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  modelSelect: {
    minWidth: '140px',
    maxWidth: '220px',
    flexShrink: 0,
  },
  statusBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    fontSize: '11px',
    color: opptrixCssVars.textSecondary,
    whiteSpace: 'nowrap',
    flexShrink: 0,
  },
  statusReady: {
    color: opptrixCssVars.success,
  },
  intervalSelect: {
    minWidth: '160px',
  },
  remoteModelSelect: {
    minWidth: '220px',
  },
  progressBlock: {
    flexShrink: 0,
    padding: '10px 14px 12px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    borderTop: `1px solid ${opptrixCssVars.separator}`,
    backgroundColor: opptrixCssVars.canvasAlt,
  },
  progressTopRow: {
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: '12px',
    minWidth: 0,
  },
  progressInfo: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  progressLabel: {
    fontSize: '11px',
    fontWeight: 600,
    color: opptrixCssVars.textTertiary,
    lineHeight: 1.35,
  },
  progressFilename: {
    fontSize: '12px',
    fontWeight: 500,
    color: opptrixCssVars.textPrimary,
    lineHeight: 1.4,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  progressSub: {
    fontSize: '11px',
    color: opptrixCssVars.textTertiary,
    lineHeight: 1.4,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  progressActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    flexShrink: 0,
  },
  progressPct: {
    fontSize: '12px',
    fontWeight: 600,
    fontVariantNumeric: 'tabular-nums',
    color: opptrixCssVars.textPrimary,
    lineHeight: 1.35,
    minWidth: '36px',
    textAlign: 'right',
  },
  progressBarTrack: {
    width: '100%',
    minHeight: '6px',
  },
  progressCancel: {
    minWidth: 'auto',
    height: '24px',
    padding: '0 6px',
    fontSize: '12px',
    color: opptrixCssVars.textTertiary,
    ':hover': {
      color: opptrixCssVars.textPrimary,
    },
  },
  hint: {
    fontSize: '12px',
    color: opptrixCssVars.textSecondary,
    lineHeight: 1.55,
    padding: '0 2px',
  },
  panelFooter: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    fontSize: '11px',
    color: opptrixCssVars.textTertiary,
    lineHeight: 1.5,
    padding: '8px 2px 0',
  },
  panelFooterText: {
    fontSize: '11px',
    color: opptrixCssVars.textTertiary,
    lineHeight: 1.5,
  },
  panelFooterDirRow: {
    minWidth: 0,
  },
  panelFooterDirMuted: {
    display: 'block',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    fontSize: '11px',
    color: opptrixCssVars.textSecondary,
    lineHeight: 1.45,
  },
  panelFooterDir: {
    display: 'block',
    width: '100%',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    fontSize: '11px',
    color: opptrixCssVars.accent,
    wordBreak: 'break-all',
    textAlign: 'left',
    textDecoration: 'underline',
    textUnderlineOffset: '2px',
    padding: 0,
    border: 'none',
    background: 'transparent',
    cursor: 'pointer',
    lineHeight: 1.45,
    ...ghostInteractive,
    ':hover': {
      color: opptrixCssVars.accent,
      opacity: 0.85,
    },
  },
})

type SaveState = 'idle' | 'pending' | 'saved' | 'error'

const DEFAULT_TRANSLATION: NewsTranslationSettings = {
  service_mode: 'offline',
  offline_model: '__auto__',
  remote_provider_id: null,
  remote_model: null,
}

function formatDownloadProgress(progress: TranslationDownloadProgress | null | undefined): string {
  if (!progress) return ''
  const pct = progress.totalBytes > 0
    ? Math.min(100, Math.round((progress.receivedBytes / progress.totalBytes) * 100))
    : 0
  return `${pct}%`
}

function formatDownloadBytes(bytes: number): string {
  if (!bytes || bytes <= 0) return '—'
  const units = ['B', 'KB', 'MB', 'GB']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`
}

export default function TranslationSettingsSection() {
  const s = useStyles()
  const toast = useSettingsToast()
  const [loading, setLoading] = useState(true)
  const [settings, setSettings] = useState<NewsSettings>({
    refresh_interval_min: 15,
    retention_years: 3,
    max_articles: null,
    translation: DEFAULT_TRANSLATION,
  })
  const [providers, setProviders] = useState<PublicProvider[]>([])
  const [status, setStatus] = useState<TranslationEngineStatus | null>(null)
  const [models, setModels] = useState<TranslationModelsResult | null>(null)
  const [download, setDownload] = useState<TranslationDownloadProgress | null>(null)
  const [downloadDir, setDownloadDir] = useState<string | null>(null)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const skipSettingsSave = useRef(true)
  const settingsBaseline = useRef<NewsTranslationSettings | null>(null)

  const refreshEngine = useCallback(async () => {
    if (!isElectron()) return
    const [nextStatus, nextModels, dir] = await Promise.all([
      window.electronAPI?.translationGetStatus?.() ?? Promise.resolve(null),
      window.electronAPI?.translationGetModels?.() ?? Promise.resolve(null),
      window.electronAPI?.translationGetDownloadDir?.() ?? Promise.resolve(null),
    ])
    if (nextStatus) setStatus(nextStatus)
    if (nextModels) setModels(nextModels)
    if (nextStatus?.download) setDownload(nextStatus.download)
    const resolvedDir = dir ?? nextModels?.downloadDir ?? nextStatus?.downloadDir ?? null
    if (resolvedDir) setDownloadDir(resolvedDir)
  }, [])

  const handleOpenDownloadDir = useCallback(async () => {
    if (!window.electronAPI?.translationOpenDownloadDir) return
    try {
      const dir = await window.electronAPI.translationOpenDownloadDir()
      setDownloadDir(dir)
    } catch (e) {
      toast.showError(e instanceof Error ? e.message : '无法打开目录')
    }
  }, [toast])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [st, cfg] = await Promise.all([
        news.getSettings(),
        getConfig().catch(() => null),
      ])
      setSettings(st.settings)
      settingsBaseline.current = st.settings.translation
      skipSettingsSave.current = true
      setProviders(cfg?.providers ?? [])
      await refreshEngine()
    } catch (e) {
      toast.showError(e instanceof Error ? e.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }, [refreshEngine, toast])

  useEffect(() => { void load() }, [load])

  useEffect(() => {
    if (!isElectron()) return
    const unsubscribe = window.electronAPI?.onTranslationDownloadProgress?.(progress => {
      setDownload(progress)
      if (progress.status === 'completed') {
        toast.showSuccess('离线翻译模型已下载完成')
        void refreshEngine()
      }
      if (progress.status === 'error') {
        toast.showError(progress.error ?? '模型下载失败')
      }
    })
    return unsubscribe
  }, [refreshEngine, toast])

  useDebouncedEffect(() => {
    if (loading || skipSettingsSave.current) {
      skipSettingsSave.current = false
      return
    }
    const baseline = settingsBaseline.current
    if (!baseline) return
    const next = settings.translation
    if (
      baseline.service_mode === next.service_mode
      && baseline.offline_model === next.offline_model
      && baseline.remote_provider_id === next.remote_provider_id
      && baseline.remote_model === next.remote_model
    ) return

    setSaveState('pending')
    news.saveSettings({ translation: next })
      .then(resp => {
        setSettings(resp.settings)
        settingsBaseline.current = resp.settings.translation
        setSaveState('saved')
        toast.showSuccess('已保存')
        void refreshEngine()
        window.setTimeout(() => setSaveState('idle'), 2000)
      })
      .catch((e: unknown) => {
        setSaveState('error')
        toast.showError(e instanceof Error ? e.message : '保存失败')
      })
  }, [
    settings.translation.service_mode,
    settings.translation.offline_model,
    settings.translation.remote_provider_id,
    settings.translation.remote_model,
    loading,
  ], SETTINGS_SAVE_MS)

  const selectedProvider = providers.find(p => p.id === settings.translation.remote_provider_id) ?? null
  const providerModels = selectedProvider?.models ?? []
  const isTranslationModelFilename = (filename: string) => /hy[-_]?mt/i.test(filename) && !/smolvlm/i.test(filename)
  const offlineOptions = [
    { value: '__auto__', label: '自动匹配 HY-MT' },
    ...(models?.installed ?? [])
      .filter(item => isTranslationModelFilename(item.filename))
      .map(item => ({
        value: item.filename,
        label: item.filename,
      })),
  ]

  const handleDownload = async (modelId: string) => {
    if (!window.electronAPI?.translationStartDownload) return
    try {
      await window.electronAPI.translationStartDownload(modelId)
      await refreshEngine()
    } catch (e) {
      toast.showError(e instanceof Error ? e.message : '下载失败')
    }
  }

  const saveHintText = (() => {
    switch (saveState) {
      case 'pending': return '保存中…'
      case 'saved': return '已保存'
      default: return ''
    }
  })()

  const engineHint = (() => {
    if (!isElectron()) {
      return '离线翻译仅在桌面版可用；远程翻译需先在「模型」中配置提供商。'
    }
    if (settings.translation.service_mode === 'remote') {
      return status?.remoteConfigured
        ? '将始终使用远程大模型翻译。'
        : '请先在下方选择远程提供商与模型名称。'
    }
    if (status?.ready) {
      return `当前使用本地模型：${status.modelName ?? '已加载'}`
    }
    if (status?.localAvailable) {
      return '已找到本地模型文件，首次翻译时将自动加载（约十几秒）。'
    }
    if (status?.remoteConfigured) {
      return '本地模型尚未就绪，翻译时将自动使用远程大模型。'
    }
    return '请下载离线模型，或在下方配置远程翻译作为回退。'
  })()

  if (loading) return <Spinner size="tiny" label="加载翻译设置…" />

  return (
    <>
      <Text className={s.hint} block>{engineHint}</Text>

      <div className={s.sectionBlock}>
        <Text className={mergeClasses(s.sectionLabel, s.sectionLabelSpaced)} block>翻译服务</Text>
        <SettingsGroup>
          <SettingsRow
            title="服务类型"
            desc="离线优先时，本地模型可用则用本地；否则回退到远程 API"
            control={(
              <OpptrixSelect
                className={s.intervalSelect}
                size="small"
                selectedOptions={[settings.translation.service_mode]}
                onOptionSelect={(_, d) => {
                  const mode = d.optionValue === 'remote' ? 'remote' : 'offline'
                  setSettings(prev => ({
                    ...prev,
                    translation: { ...prev.translation, service_mode: mode },
                  }))
                }}
              >
                <OpptrixOption value="offline">离线翻译（优先）</OpptrixOption>
                <OpptrixOption value="remote">远程大模型</OpptrixOption>
              </OpptrixSelect>
            )}
            last
          />
        </SettingsGroup>
        <Text className={mergeClasses(s.saveHint, saveState !== 'idle' && s.saveHintActive)} block>
          {saveHintText}
        </Text>
      </div>

      {settings.translation.service_mode !== 'remote' && isElectron() && (
        <div className={s.sectionBlock}>
          <div className={s.sectionHeaderRow}>
            <div className={s.sectionHeaderLeft}>
              <Text className={s.sectionLabel}>离线翻译</Text>
              <span className={mergeClasses(s.statusBadge, status?.ready && s.statusReady)}>
                {status?.ready
                  ? <><CheckmarkCircleRegular fontSize={14} /> 已就绪</>
                  : status?.loading
                    ? '加载中…'
                    : status?.modelFound
                      ? '待加载'
                      : '未安装'}
              </span>
            </div>
            <OpptrixSelect
              className={s.modelSelect}
              size="small"
              selectedOptions={[settings.translation.offline_model]}
              onOptionSelect={(_, d) => {
                setSettings(prev => ({
                  ...prev,
                  translation: {
                    ...prev.translation,
                    offline_model: d.optionValue ?? '__auto__',
                  },
                }))
              }}
            >
              {offlineOptions.map(opt => (
                <OpptrixOption key={opt.value} value={opt.value}>{opt.label}</OpptrixOption>
              ))}
            </OpptrixSelect>
          </div>

          <div className={s.listPanel}>
            <div className={s.listHeader}>
              <Text className={s.listHeaderMeta} block>
                {status?.ready
                  ? `当前：${status.modelName}`
                  : status?.modelFound
                    ? `已安装 ${status.modelName}，首次翻译时加载`
                    : `下载离线模型（默认 ${models?.defaultDownloadSource ?? 'hf-mirror'}，失败自动换源）`}
              </Text>
            </div>

            <div className={mergeClasses(s.listScroll, 'opptrix-scroll', 'opptrix-scroll-hover')}>
              {(models?.catalog ?? []).map(item => (
                <div key={item.id} className={s.listRow}>
                  <div className={s.listRowMain}>
                    <Text className={s.listRowTitle} block title={item.name}>
                      {item.name}{item.recommended ? ' · 推荐' : ''}{item.purposeLabel ? ` · ${item.purposeLabel}` : ''}
                    </Text>
                    <Text className={s.listRowMeta} block>
                      {item.sizeLabel}{item.installed ? ' · 已安装' : ''}
                    </Text>
                  </div>
                  <div className={s.listRowControls}>
                    {item.installed ? (
                      <span className={mergeClasses(s.statusBadge, s.statusReady)}>
                        <CheckmarkCircleRegular fontSize={14} /> 已安装
                      </span>
                    ) : (
                      <OpptrixButton
                        variant="secondary"
                        size="small"
                        icon={<ArrowDownloadRegular fontSize={12} />}
                        disabled={Boolean(download?.status === 'downloading')}
                        onClick={() => { void handleDownload(item.id) }}
                      >
                        下载
                      </OpptrixButton>
                    )}
                  </div>
                </div>
              ))}

              {(models?.installed ?? [])
                .filter(installed => !(models?.catalog ?? []).some(item => item.filename === installed.filename))
                .map(item => (
                  <div key={item.path} className={s.listRow}>
                    <div className={s.listRowMain}>
                      <Text className={s.listRowTitle} block title={item.filename}>{item.filename}</Text>
                      <Text className={s.listRowMeta} block>{item.sizeLabel} · 本地文件</Text>
                    </div>
                    <span className={mergeClasses(s.statusBadge, s.statusReady)}>
                      <CheckmarkCircleRegular fontSize={14} /> 已安装
                    </span>
                  </div>
                ))}
            </div>

            {download?.status === 'downloading' && (() => {
              const downloadName = models?.catalog?.find(item => item.id === download.modelId)?.name
                ?? download.filename
              const sizeHint = download.totalBytes > 0
                ? `${formatDownloadBytes(download.receivedBytes)} / ${formatDownloadBytes(download.totalBytes)}`
                : null
              const subParts = [
                download.sourceLabel,
                sizeHint,
              ].filter(Boolean)

              return (
                <div className={s.progressBlock}>
                  <div className={s.progressTopRow}>
                    <div className={s.progressInfo}>
                      <Text className={s.progressLabel} block>正在下载</Text>
                      <Text className={s.progressFilename} block title={downloadName}>
                        {downloadName}
                      </Text>
                      {subParts.length > 0 && (
                        <Text className={s.progressSub} block>
                          {subParts.join(' · ')}
                        </Text>
                      )}
                    </div>
                    <div className={s.progressActions}>
                      <span className={s.progressPct}>{formatDownloadProgress(download)}</span>
                      <OpptrixButton
                        variant="ghost"
                        size="small"
                        className={s.progressCancel}
                        icon={<DismissRegular fontSize={12} />}
                        onClick={() => { void window.electronAPI?.translationCancelDownload?.() }}
                      >
                        取消
                      </OpptrixButton>
                    </div>
                  </div>
                  <ProgressBar
                    className={s.progressBarTrack}
                    value={download.totalBytes > 0 ? download.receivedBytes / download.totalBytes : undefined}
                    thickness="medium"
                    color="brand"
                    shape="rounded"
                  />
                </div>
              )
            })()}
          </div>
          <div className={s.panelFooter}>
            <Text className={s.panelFooterText} block>
              若自动下载失败，可自行下载腾讯 HY-MT 的 Q4_K_M 或更高量化 GGUF 文件，保存后应用会自动识别。
            </Text>
            <div className={s.panelFooterDirRow}>
              {downloadDir ? (
                <button
                  type="button"
                  className={s.panelFooterDir}
                  title="点击打开文件夹"
                  onClick={() => { void handleOpenDownloadDir() }}
                >
                  {downloadDir}
                </button>
              ) : (
                <span className={s.panelFooterDirMuted}>加载中…</span>
              )}
            </div>
          </div>
        </div>
      )}

      <div className={s.sectionBlock}>
        <Text className={mergeClasses(s.sectionLabel, s.sectionLabelSpaced)} block>远程翻译</Text>
        <SettingsGroup>
          {providers.length === 0 ? (
            <SettingsStaticBlock>
              <Text block style={{ fontSize: '13px', color: opptrixCssVars.textSecondary, lineHeight: 1.55 }}>
                尚未配置模型提供商。请先在「模型」页添加 OpenAI 兼容接口，再回来选择远程翻译用的提供商与模型。
              </Text>
            </SettingsStaticBlock>
          ) : (
            <>
              <SettingsRow
                title="提供商"
                desc="使用系统已配置的 API 提供商"
                control={(
                  <OpptrixSelect
                    className={s.remoteModelSelect}
                    size="small"
                    selectedOptions={[settings.translation.remote_provider_id ?? '']}
                    onOptionSelect={(_, d) => {
                      const providerId = d.optionValue || null
                      const provider = providers.find(p => p.id === providerId)
                      setSettings(prev => ({
                        ...prev,
                        translation: {
                          ...prev.translation,
                          remote_provider_id: providerId,
                          remote_model: provider?.models[0] ?? null,
                        },
                      }))
                    }}
                  >
                    <OpptrixOption value="">未选择</OpptrixOption>
                    {providers.map(p => (
                      <OpptrixOption key={p.id} value={p.id}>{p.name}</OpptrixOption>
                    ))}
                  </OpptrixSelect>
                )}
              />
              <SettingsRow
                title="模型名称"
                desc="从提供商已启用模型中选择，或手动输入"
                stack
                control={providerModels.length > 0 ? (
                  <OpptrixSelect
                    className={s.remoteModelSelect}
                    size="small"
                    selectedOptions={[settings.translation.remote_model ?? '']}
                    onOptionSelect={(_, d) => {
                      setSettings(prev => ({
                        ...prev,
                        translation: {
                          ...prev.translation,
                          remote_model: d.optionValue || null,
                        },
                      }))
                    }}
                  >
                    <OpptrixOption value="">未选择</OpptrixOption>
                    {providerModels.map(model => (
                      <OpptrixOption key={model} value={model}>{model}</OpptrixOption>
                    ))}
                  </OpptrixSelect>
                ) : (
                  <SettingsTextField
                    value={settings.translation.remote_model ?? ''}
                    onChange={value => {
                      setSettings(prev => ({
                        ...prev,
                        translation: {
                          ...prev.translation,
                          remote_model: value.trim() || null,
                        },
                      }))
                    }}
                    placeholder="例如 deepseek-chat"
                  />
                )}
                last
              />
            </>
          )}
        </SettingsGroup>
      </div>
    </>
  )
}
