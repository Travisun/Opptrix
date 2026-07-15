import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Spinner,
  Text,
  makeStyles,
  mergeClasses,
} from '@fluentui/react-components'
import {
  CheckmarkCircleRegular,
} from '@fluentui/react-icons'
import { getConfig, news, type PublicProvider } from '../../api/client'
import type {
  MultimodalStatusResponse,
  NewsEnrichmentSettings,
  NewsSettings,
} from '../../types/schemas'
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

const SETTINGS_SAVE_MS = 500

const DEFAULT_ENRICHMENT: NewsEnrichmentSettings = {
  enabled: false,
  processing_mode: 'on_demand',
  extract_images: true,
  extract_audio: true,
  extract_video: true,
  service_mode: 'remote',
  offline_vision_model: '__auto__',
  offline_whisper_model: 'tiny',
  remote_provider_id: null,
  remote_model: null,
}

type SaveState = 'idle' | 'pending' | 'saved' | 'error'
type ViewMode = 'enrichment' | 'translation' | 'vision' | 'speech'

const useStyles = makeStyles({
  hint: {
    fontSize: 'var(--opptrix-font-md)',
    color: opptrixCssVars.textSecondary,
    lineHeight: 1.55,
    padding: '0 2px',
  },
  modeRow: {
    display: 'flex',
    gap: '4px',
    padding: '3px',
    backgroundColor: opptrixCssVars.canvasAlt,
    borderRadius: opptrixTokens.radiusFull,
    width: 'fit-content',
    marginBottom: '12px',
    flexWrap: 'wrap',
  },
  modeTab: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    border: 'none',
    background: 'transparent',
    borderRadius: opptrixTokens.radiusFull,
    padding: '5px 14px',
    fontSize: 'var(--opptrix-font-md)',
    fontWeight: 500,
    cursor: 'pointer',
    color: opptrixCssVars.textTertiary,
    transition: 'background-color 140ms ease, color 140ms ease',
  },
  modeTabActive: {
    backgroundColor: opptrixCssVars.surface,
    color: opptrixCssVars.textPrimary,
    boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)',
  },
  tabPanel: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  tabSectionBlock: {
    marginTop: 0,
  },
  sectionBlock: { marginTop: '20px' },
  sectionLabel: {
    fontSize: 'var(--opptrix-font-sm)',
    fontWeight: 600,
    color: opptrixCssVars.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
    flexShrink: 0,
  },
  sectionLabelSpaced: { padding: '0 2px 8px' },
  saveHint: {
    fontSize: 'var(--opptrix-font-sm)',
    color: opptrixCssVars.textTertiary,
    padding: '4px 2px 0',
    minHeight: '16px',
  },
  saveHintActive: { color: opptrixCssVars.textSecondary },
  listPanel: {
    border: opptrixCssVars.settingsPanelBorder,
    borderRadius: opptrixTokens.radiusLg,
    backgroundColor: opptrixCssVars.canvas,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
  },
  listScroll: {
    maxHeight: '220px',
    overflowY: 'auto',
    overscrollBehavior: 'contain',
  },
  listRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '10px',
    padding: '8px 14px',
    minHeight: '38px',
    borderBottom: `1px solid ${opptrixCssVars.separator}`,
    ':last-child': { borderBottom: 'none' },
  },
  listRowMain: { flex: 1, minWidth: 0 },
  listRowTitle: {
    fontSize: 'var(--opptrix-font-base)',
    fontWeight: 600,
    color: opptrixCssVars.textPrimary,
    lineHeight: 1.35,
  },
  listRowMeta: {
    fontSize: 'var(--opptrix-font-sm)',
    color: opptrixCssVars.textTertiary,
    lineHeight: 1.4,
    marginTop: '2px',
  },
  statusBadge: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    fontSize: 'var(--opptrix-font-sm)',
    color: opptrixCssVars.textSecondary,
    whiteSpace: 'nowrap',
    flexShrink: 0,
  },
  statusReady: { color: opptrixCssVars.success },
  statusWarn: { color: opptrixCssVars.warning },
  intervalSelect: { minWidth: '160px' },
  remoteModelSelect: { minWidth: '220px' },
  panelFooter: {
    fontSize: 'var(--opptrix-font-sm)',
    color: opptrixCssVars.textTertiary,
    lineHeight: 1.5,
    padding: '8px 2px 0',
  },
  panelFooterDir: {...ghostInteractive,
    display: 'block',
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    fontSize: 'var(--opptrix-font-sm)',
    color: opptrixCssVars.accent,
    wordBreak: 'break-all',
    marginTop: '4px',
    padding: 0,
    border: 'none',
    background: 'transparent',
    cursor: 'pointer',
    textAlign: 'left',
    textDecoration: 'underline',
  },
})

export default function MultimodalSettingsSection() {
  const s = useStyles()
  const toast = useSettingsToast()
  const [loading, setLoading] = useState(true)
  const [settings, setSettings] = useState<NewsSettings>({
    refresh_interval_min: 15,
    retention_years: 3,
    max_articles: null,
    translation: {
      service_mode: 'remote',
      offline_model: '__auto__',
      remote_provider_id: null,
      remote_model: null,
    },
    enrichment: DEFAULT_ENRICHMENT,
  })
  const [providers, setProviders] = useState<PublicProvider[]>([])
  const [mmStatus, setMmStatus] = useState<MultimodalStatusResponse | null>(null)
  const [whisperEnsuring, setWhisperEnsuring] = useState(false)
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [viewMode, setViewMode] = useState<ViewMode>('enrichment')
  const skipSettingsSave = useRef(true)
  const settingsBaseline = useRef<{ enrichment: NewsEnrichmentSettings; translation: NewsSettings['translation'] } | null>(null)

  const refreshStatus = useCallback(async () => {
    const status = await news.getMultimodalStatus()
    setMmStatus(status)
  }, [])

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [st, cfg] = await Promise.all([
        news.getSettings(),
        getConfig().catch(() => null),
      ])
      setSettings(st.settings)
      settingsBaseline.current = {
        enrichment: st.settings.enrichment,
        translation: st.settings.translation,
      }
      skipSettingsSave.current = true
      setProviders(cfg?.providers ?? [])
      await refreshStatus()
    } catch (e) {
      toast.showError(e instanceof Error ? e.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }, [refreshStatus, toast])

  useEffect(() => { void load() }, [load])

  useDebouncedEffect(() => {
    if (loading || skipSettingsSave.current) {
      skipSettingsSave.current = false
      return
    }
    const baseline = settingsBaseline.current
    if (!baseline) return
    const nextEnrichment = settings.enrichment
    const nextTranslation = settings.translation
    if (
      JSON.stringify(baseline.enrichment) === JSON.stringify(nextEnrichment)
      && JSON.stringify(baseline.translation) === JSON.stringify(nextTranslation)
    ) return

    setSaveState('pending')
    news.saveSettings({ enrichment: nextEnrichment, translation: nextTranslation })
      .then(resp => {
        setSettings(resp.settings)
        settingsBaseline.current = {
          enrichment: resp.settings.enrichment,
          translation: resp.settings.translation,
        }
        setSaveState('saved')
        toast.showSuccess('已保存')
        void refreshStatus()
        window.setTimeout(() => setSaveState('idle'), 2000)
      })
      .catch((e: unknown) => {
        setSaveState('error')
        toast.showError(e instanceof Error ? e.message : '保存失败')
        window.setTimeout(() => setSaveState('idle'), 2000)
      })
  }, [settings.enrichment, settings.translation, loading, refreshStatus, toast], SETTINGS_SAVE_MS)

  const selectedProvider = providers.find(p => p.id === settings.enrichment.remote_provider_id) ?? null
  const providerModels = selectedProvider?.models ?? []
  const runtime = mmStatus?.runtime

  const speechExtractionEnabled = settings.enrichment.enabled
    && (settings.enrichment.extract_audio || settings.enrichment.extract_video)

  const handleEnsureWhisper = async () => {
    if (!speechExtractionEnabled) {
      toast.showError('请先开启媒体提取并勾选音视频')
      return
    }
    setWhisperEnsuring(true)
    try {
      await news.ensureWhisperModel()
      toast.showSuccess('语音模型已下载完成')
      await refreshStatus()
    } catch (e) {
      toast.showError(e instanceof Error ? e.message : '语音模型准备失败')
    } finally {
      setWhisperEnsuring(false)
    }
  }

  const saveHintText = (() => {
    switch (saveState) {
      case 'pending': return '保存中…'
      case 'saved': return '已保存'
      case 'error': return '保存失败，请重试'
      default: return ''
    }
  })()

  const engineHint = (() => {
    if (!settings.enrichment.enabled) {
      return '多模态提取已关闭，阅读器与 Agent 将只使用文章正文 HTML。'
    }
    const parts: string[] = []
    if (settings.enrichment.extract_images) {
      parts.push(mmStatus?.canEnrichImages
        ? `图片：远程视觉模型（${mmStatus.remoteProviderName ?? '已配置'}）`
        : '图片：未配置远程视觉模型，将跳过图片（请在下方选择 GPT-4o / Qwen-VL 等）')
    }
    if (settings.enrichment.extract_audio || settings.enrichment.extract_video) {
      parts.push(mmStatus?.canEnrichSpeech
        ? '音视频：本机 ffmpeg + Whisper 转写'
        : '音视频：ffmpeg 未就绪，请检查服务端依赖')
    }
    return parts.join(' · ') || '请在下方配置提取能力'
  })()

  const translationBadge = (() => {
    if (settings.translation.service_mode === 'remote') return '未启用'
    if (mmStatus?.translation?.downloading) return '下载中…'
    if (mmStatus?.translation?.modelInstalled) return '模型已就绪'
    return '待下载 HY-MT'
  })()

  const visionBadge = mmStatus?.canEnrichImages ? '已配置' : '未配置'

  if (loading) return <Spinner size="tiny" label="加载多模态设置…" />

  return (
    <>
      <Text className={s.hint} block>{engineHint}</Text>

      <div className={s.modeRow}>
        <OpptrixButton
          variant="ghost"
          className={mergeClasses(s.modeTab, viewMode === 'enrichment' && s.modeTabActive)}
          onClick={() => setViewMode('enrichment')}
        >
          媒体处理
        </OpptrixButton>
        <OpptrixButton
          variant="ghost"
          className={mergeClasses(s.modeTab, viewMode === 'translation' && s.modeTabActive)}
          onClick={() => setViewMode('translation')}
        >
          离线翻译
          <span className={mergeClasses(
            s.statusBadge,
            settings.translation.service_mode !== 'remote' && mmStatus?.translation?.modelInstalled && s.statusReady,
          )}>
            {translationBadge}
          </span>
        </OpptrixButton>
        <OpptrixButton
          variant="ghost"
          className={mergeClasses(s.modeTab, viewMode === 'vision' && s.modeTabActive)}
          onClick={() => setViewMode('vision')}
        >
          图片理解
          <span className={mergeClasses(s.statusBadge, mmStatus?.canEnrichImages && s.statusReady)}>
            {visionBadge}
          </span>
        </OpptrixButton>
        <OpptrixButton
          variant="ghost"
          className={mergeClasses(s.modeTab, viewMode === 'speech' && s.modeTabActive)}
          onClick={() => setViewMode('speech')}
        >
          音视频转写
          <span className={mergeClasses(s.statusBadge, runtime?.ffmpeg.ready && s.statusReady)}>
            {runtime?.ffmpeg.ready ? 'ffmpeg 就绪' : '待配置'}
          </span>
        </OpptrixButton>
      </div>

      {viewMode === 'enrichment' && (
      <div className={s.tabPanel}>
        <div className={mergeClasses(s.sectionBlock, s.tabSectionBlock)}>
          <SettingsGroup>
            <SettingsRow
              title="启用媒体提取"
              desc="从文章中的图片、音频、视频提取可读文字，供阅读与 Agent 使用"
              control={(
                <OpptrixSelect
                  className={s.intervalSelect}
                  size="small"
                  selectedOptions={[settings.enrichment.enabled ? 'on' : 'off']}
                  onOptionSelect={(_, d) => {
                    setSettings(prev => ({
                      ...prev,
                      enrichment: { ...prev.enrichment, enabled: d.optionValue === 'on' },
                    }))
                  }}
                >
                  <OpptrixOption value="on">开启</OpptrixOption>
                  <OpptrixOption value="off">关闭</OpptrixOption>
                </OpptrixSelect>
              )}
            />
            <SettingsRow
              title="处理时机"
              desc="按需：首次由 Agent 读取或阅读器手动触发；后台：RSS 更新后自动排队全量处理"
              control={(
                <OpptrixSelect
                  className={s.intervalSelect}
                  size="small"
                  selectedOptions={[settings.enrichment.processing_mode]}
                  onOptionSelect={(_, d) => {
                    const mode = d.optionValue === 'background' ? 'background' : 'on_demand'
                    setSettings(prev => ({
                      ...prev,
                      enrichment: { ...prev.enrichment, processing_mode: mode },
                    }))
                  }}
                >
                  <OpptrixOption value="on_demand">按需处理（默认）</OpptrixOption>
                  <OpptrixOption value="background">后台全量自动</OpptrixOption>
                </OpptrixSelect>
              )}
            />
            <SettingsRow
              title="提取范围"
              desc="图片需配置下方远程视觉模型；音视频在本机转写"
              control={(
                <OpptrixSelect
                  className={s.intervalSelect}
                  size="small"
                  selectedOptions={[
                    [
                      settings.enrichment.extract_images && 'img',
                      settings.enrichment.extract_audio && 'aud',
                      settings.enrichment.extract_video && 'vid',
                    ].filter(Boolean).join(',') || 'none',
                  ]}
                  onOptionSelect={(_, d) => {
                    const val = d.optionValue ?? ''
                    setSettings(prev => ({
                      ...prev,
                      enrichment: {
                        ...prev.enrichment,
                        extract_images: val.includes('img') || val === 'all',
                        extract_audio: val.includes('aud') || val === 'all',
                        extract_video: val.includes('vid') || val === 'all',
                      },
                    }))
                  }}
                >
                  <OpptrixOption value="img,aud,vid">图片 + 音频 + 视频</OpptrixOption>
                  <OpptrixOption value="img">仅图片</OpptrixOption>
                  <OpptrixOption value="aud,vid">仅音视频</OpptrixOption>
                  <OpptrixOption value="img,aud">图片 + 音频</OpptrixOption>
                </OpptrixSelect>
              )}
              last
            />
          </SettingsGroup>
          <Text className={mergeClasses(s.saveHint, saveState !== 'idle' && s.saveHintActive)} block>
            {saveHintText}
          </Text>
        </div>
      </div>
      )}

      {viewMode === 'translation' && (
      <div className={s.tabPanel}>
        <div className={mergeClasses(s.sectionBlock, s.tabSectionBlock)}>
          <SettingsGroup>
            <SettingsRow
              title="启用离线翻译"
              desc="开启后后台检测并自动下载 HY-MT 模型（约 1.1 GB）；关闭则使用远程大模型翻译"
              control={(
                <OpptrixSelect
                  className={s.intervalSelect}
                  size="small"
                  selectedOptions={[settings.translation.service_mode === 'offline' ? 'on' : 'off']}
                  onOptionSelect={(_, d) => {
                    const offline = d.optionValue === 'on'
                    setSettings(prev => ({
                      ...prev,
                      translation: {
                        ...prev.translation,
                        service_mode: offline ? 'offline' : 'remote',
                      },
                    }))
                  }}
                >
                  <OpptrixOption value="off">关闭（默认）</OpptrixOption>
                  <OpptrixOption value="on">开启</OpptrixOption>
                </OpptrixSelect>
              )}
              last
            />
          </SettingsGroup>
          {settings.translation.service_mode === 'offline' && (
            <Text className={s.panelFooter} block>
              {mmStatus?.translation?.modelInstalled
                ? `当前模型：${mmStatus.translation.modelName ?? 'HY-MT'}`
                : '保存后后台将自动下载推荐模型 HY-MT1.5 Q4_K_M；也可在「翻译」页手动选择版本'}
            </Text>
          )}
        </div>
      </div>
      )}

      {viewMode === 'vision' && (
      <div className={s.tabPanel}>
        <div className={mergeClasses(s.sectionBlock, s.tabSectionBlock)}>
          <SettingsGroup>
            {providers.length === 0 ? (
              <SettingsStaticBlock>
                <Text block style={{ fontSize: 'var(--opptrix-font-base)', color: opptrixCssVars.textSecondary, lineHeight: 1.55 }}>
                  图片仅支持远程多模态大模型。请先在「模型」页添加 OpenAI 兼容接口，再选择支持图片的模型（如 GPT-4o、Qwen-VL、GLM-4V）。
                </Text>
              </SettingsStaticBlock>
            ) : (
              <>
                <SettingsRow
                  title="提供商"
                  desc="用于概括文章配图内容"
                  control={(
                    <OpptrixSelect
                      className={s.remoteModelSelect}
                      size="small"
                      selectedOptions={[settings.enrichment.remote_provider_id ?? '']}
                      onOptionSelect={(_, d) => {
                        const providerId = d.optionValue || null
                        const provider = providers.find(p => p.id === providerId)
                        setSettings(prev => ({
                          ...prev,
                          enrichment: {
                            ...prev.enrichment,
                            remote_provider_id: providerId,
                            remote_model: provider?.models[0] ?? null,
                            service_mode: 'remote',
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
                  title="视觉模型"
                  desc="须支持 image_url 输入"
                  stack
                  control={providerModels.length > 0 ? (
                    <OpptrixSelect
                      className={s.remoteModelSelect}
                      size="small"
                      selectedOptions={[settings.enrichment.remote_model ?? '']}
                      onOptionSelect={(_, d) => {
                        setSettings(prev => ({
                          ...prev,
                          enrichment: {
                            ...prev.enrichment,
                            remote_model: d.optionValue || null,
                            service_mode: 'remote',
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
                      value={settings.enrichment.remote_model ?? ''}
                      onChange={value => {
                        setSettings(prev => ({
                          ...prev,
                          enrichment: {
                            ...prev.enrichment,
                            remote_model: value.trim() || null,
                            service_mode: 'remote',
                          },
                        }))
                      }}
                      placeholder="输入视觉模型名称"
                    />
                  )}
                  last
                />
              </>
            )}
          </SettingsGroup>
        </div>
      </div>
      )}

      {viewMode === 'speech' && (
      <div className={s.tabPanel}>
        {speechExtractionEnabled ? (
        <div className={mergeClasses(s.sectionBlock, s.tabSectionBlock)}>
          <div className={s.listPanel}>
            <div className={s.listRow}>
              <div className={s.listRowMain}>
                <Text className={s.listRowTitle} block>媒体下载</Text>
                <Text className={s.listRowMeta} block>
                  处理时从文章链接下载音视频到本机缓存（~/.opptrix/media-cache）
                </Text>
              </div>
              <span className={mergeClasses(s.statusBadge, s.statusReady)}>已启用</span>
            </div>
            <div className={s.listRow}>
              <div className={s.listRowMain}>
                <Text className={s.listRowTitle} block>ffmpeg（解码）</Text>
                <Text className={s.listRowMeta} block>
                  {runtime?.ffmpeg.ready ? '服务端已内置' : '未找到，请检查安装'}
                </Text>
              </div>
              <span className={mergeClasses(s.statusBadge, runtime?.ffmpeg.ready && s.statusReady)}>
                {runtime?.ffmpeg.ready ? '已就绪' : '不可用'}
              </span>
            </div>
            <div className={s.listRow}>
              <div className={s.listRowMain}>
                <Text className={s.listRowTitle} block>
                  Whisper {settings.enrichment.offline_whisper_model}
                </Text>
                <Text className={s.listRowMeta} block>
                  {runtime?.whisper.ready
                    ? '模型已缓存，可直接转写'
                    : '开启媒体提取后后台将自动检测并下载（约 75 MB），也可点击下方预下载'}
                </Text>
              </div>
              {!runtime?.whisper.ready ? (
                <OpptrixButton
                  variant="secondary"
                  size="small"
                  disabled={whisperEnsuring}
                  onClick={() => { void handleEnsureWhisper() }}
                >
                  {whisperEnsuring ? '下载中…' : '预下载'}
                </OpptrixButton>
              ) : (
                <span className={mergeClasses(s.statusBadge, s.statusReady)}>已就绪</span>
              )}
            </div>
          </div>
          {runtime?.whisper.modelsDir && (
            <Text className={s.panelFooter} block>
              语音模型目录：{runtime.whisper.modelsDir}
            </Text>
          )}
        </div>
        ) : (
        <div className={mergeClasses(s.sectionBlock, s.tabSectionBlock)}>
          <Text className={s.panelFooter} block>
            音视频转写需先开启「启用媒体提取」并在提取范围中勾选音频或视频。
          </Text>
        </div>
        )}
      </div>
      )}
    </>
  )
}
