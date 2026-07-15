import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Switch,
  Text,
  makeStyles,
  mergeClasses,
} from '@fluentui/react-components'
import {
  AddRegular,
  ArrowSyncRegular,
  ChevronDownRegular,
  ChevronRightRegular,
  DeleteRegular,
  DocumentArrowDownRegular,
  DocumentArrowUpRegular,
  EditRegular,
  FolderRegular,
} from '@fluentui/react-icons'
import { news } from '../../api/client'
import type { FeedSubscription, FeedGroup, NewsSettings } from '../../types/schemas'
import OpptrixButton from '../../components/opptrix/OpptrixButton'
import OpptrixField from '../../components/opptrix/OpptrixField'
import OpptrixInput from '../../components/opptrix/OpptrixInput'
import OpptrixSelect, { OpptrixOption } from '../../components/opptrix/OpptrixSelect'
import {
  SettingsGroup,
  SettingsRow,
} from './SettingsPrimitives'
import { useSettingsToast } from './SettingsToast'
import { useOpptrixDialogAlert } from '../../components/opptrix/OpptrixDialogAlert'
import { useDebouncedEffect } from '../../hooks/useDebouncedEffect'
import { SettingsListPanelSkeleton } from './SettingsListPanelSkeleton'
import { opptrixTokens, opptrixCssVars } from '../../theme/tokens'
import { findDuplicateSubscription, formatSubscriptionUrlShort } from '../news/newsUtils'
import {
  buildSubscriptionExportFile,
  downloadSubscriptionExportFile,
  parseSubscriptionExportJson,
  type NewsSubscriptionExportFile,
} from '../news/subscriptionTransfer'

const REFRESH_INTERVAL_OPTIONS = [5, 10, 15, 30, 60] as const
const RETENTION_YEAR_OPTIONS = [0, 1, 2, 3, 5, 10, 20] as const
const MAX_ARTICLE_OPTIONS = [
  { value: '__unlimited__', label: '不限制' },
  { value: '5000', label: '5,000 篇' },
  { value: '10000', label: '1 万篇' },
  { value: '50000', label: '5 万篇' },
  { value: '100000', label: '10 万篇' },
] as const
const SETTINGS_SAVE_MS = 500

const useStyles = makeStyles({
  listPanel: {
    border: opptrixCssVars.settingsPanelBorder,
    borderRadius: opptrixTokens.radiusLg,
    backgroundColor: opptrixCssVars.canvas,
    overflow: 'hidden',
    height: '360px',
    display: 'flex',
    flexDirection: 'column',
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
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
  },
  listScroll: {
    flex: 1,
    minHeight: 0,
    overflowY: 'auto',
    overscrollBehavior: 'contain',
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
  },
  listRowControls: {
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  groupSelect: {
    minWidth: '88px',
    maxWidth: '108px',
  },
  sectionBlock: {
    marginTop: '20px',
  },
  tabPanel: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  sectionLabel: {
    fontSize: '11px',
    fontWeight: 600,
    color: opptrixCssVars.textTertiary,
    textTransform: 'uppercase',
    letterSpacing: '0.04em',
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
  emptyBlock: {
    flex: 1,
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '20px 18px',
    textAlign: 'center',
  },
  emptyTitle: {
    fontSize: '13px',
    fontWeight: 650,
    color: opptrixCssVars.textPrimary,
    marginBottom: '6px',
  },
  emptyDesc: {
    fontSize: '12px',
    color: opptrixCssVars.textSecondary,
    lineHeight: 1.5,
  },
  dialogBody: {
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
    paddingTop: '4px',
  },
  dialogHint: {
    fontSize: '12px',
    color: opptrixCssVars.textSecondary,
    lineHeight: 1.5,
  },
  preview: {
    fontSize: '12px',
    color: opptrixCssVars.textPrimary,
    padding: '10px 12px',
    borderRadius: opptrixTokens.radiusMd,
    backgroundColor: opptrixCssVars.canvasAlt,
    lineHeight: 1.45,
  },
  dialogActions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '8px',
    marginTop: '4px',
  },
  intervalSelect: {
    minWidth: '120px',
  },
  updateControl: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: '10px',
    flexWrap: 'wrap',
  },
  updateTime: {
    fontSize: '12px',
    color: opptrixCssVars.textSecondary,
    whiteSpace: 'nowrap',
  },
  subMeta: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  subError: {
    fontSize: '11px',
    color: opptrixCssVars.error,
    lineHeight: 1.4,
  },
  urlToggle: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '3px',
    padding: 0,
    border: 'none',
    background: 'none',
    fontSize: '11px',
    color: opptrixCssVars.textTertiary,
    cursor: 'pointer',
    textAlign: 'left',
    lineHeight: 1.45,
    maxWidth: '100%',
    ':hover': {
      color: opptrixCssVars.textSecondary,
    },
  },
  urlToggleLabel: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  urlFull: {
    fontSize: '11px',
    color: opptrixCssVars.textSecondary,
    lineHeight: 1.4,
    wordBreak: 'break-all',
    userSelect: 'text',
  },
  importSummary: {
    fontSize: '13px',
    color: opptrixCssVars.textPrimary,
    lineHeight: 1.55,
  },
  importHint: {
    fontSize: '12px',
    color: opptrixCssVars.textSecondary,
    lineHeight: 1.5,
  },
  modeRow: {
    display: 'flex',
    gap: '4px',
    padding: '3px',
    backgroundColor: opptrixCssVars.canvasAlt,
    borderRadius: opptrixTokens.radiusFull,
    width: 'fit-content',
    marginBottom: '12px',
  },
  modeTab: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    border: 'none',
    background: 'transparent',
    borderRadius: opptrixTokens.radiusFull,
    padding: '5px 14px',
    fontSize: '12px',
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
})

type SaveState = 'idle' | 'pending' | 'saved' | 'error'

const DEFAULT_TRANSLATION: NewsSettings['translation'] = {
  service_mode: 'remote',
  offline_model: '__auto__',
  remote_provider_id: null,
  remote_model: null,
}

const DEFAULT_ENRICHMENT: NewsSettings['enrichment'] = {
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

export default function NewsFeedSettingsSection() {
  const s = useStyles()
  const toast = useSettingsToast()
  const { confirm } = useOpptrixDialogAlert()
  const [loading, setLoading] = useState(true)
  const [settings, setSettings] = useState<NewsSettings>({
    refresh_interval_min: 15,
    retention_years: 3,
    max_articles: null,
    translation: DEFAULT_TRANSLATION,
    enrichment: DEFAULT_ENRICHMENT,
  })
  const [subs, setSubs] = useState<FeedSubscription[]>([])
  const [groups, setGroups] = useState<FeedGroup[]>([])
  const [viewMode, setViewMode] = useState<'subscriptions' | 'groups' | 'storage' | 'update'>('subscriptions')
  const [groupDialogOpen, setGroupDialogOpen] = useState(false)
  const [editingGroup, setEditingGroup] = useState<FeedGroup | null>(null)
  const [groupTitle, setGroupTitle] = useState('')
  const [addGroupId, setAddGroupId] = useState<string>('')
  const [refreshedAt, setRefreshedAt] = useState<string | null>(null)
  const [refreshing, setRefreshing] = useState(false)
  const [dialogOpen, setDialogOpen] = useState(false)
  const [addUrl, setAddUrl] = useState('')
  const [addTitle, setAddTitle] = useState('')
  const [validating, setValidating] = useState(false)
  const [preview, setPreview] = useState<{ title: string; item_count: number } | null>(null)
  const [expandedSubIds, setExpandedSubIds] = useState<Record<string, boolean>>({})
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [importDialogOpen, setImportDialogOpen] = useState(false)
  const [pendingImport, setPendingImport] = useState<NewsSubscriptionExportFile | null>(null)
  const [importing, setImporting] = useState(false)
  const [exporting, setExporting] = useState(false)
  const skipSettingsSave = useRef(true)
  const settingsBaseline = useRef<NewsSettings | null>(null)
  const importInputRef = useRef<HTMLInputElement>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [st, subResp] = await Promise.all([
        news.getSettings(),
        news.listSubscriptions(),
      ])
      setSettings(st.settings)
      settingsBaseline.current = st.settings
      skipSettingsSave.current = true
      setSubs(subResp.subscriptions)
      setGroups(subResp.groups)
      try {
        const feed = await news.getFeed({ limit: 1 })
        setRefreshedAt(feed.refreshed_at)
      } catch {
        setRefreshedAt(null)
      }
    } catch (e) {
      toast.showError(e instanceof Error ? e.message : '加载失败')
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => { void load() }, [load])

  useDebouncedEffect(() => {
    if (loading || skipSettingsSave.current) {
      skipSettingsSave.current = false
      return
    }
    const baseline = settingsBaseline.current
    if (!baseline) return
    if (
      baseline.refresh_interval_min === settings.refresh_interval_min
      && baseline.retention_years === settings.retention_years
      && baseline.max_articles === settings.max_articles
    ) return

    setSaveState('pending')
    news.saveSettings(settings)
      .then(resp => {
        setSettings(resp.settings)
        settingsBaseline.current = resp.settings
        setSaveState('saved')
        toast.showSuccess('已保存')
        window.setTimeout(() => setSaveState('idle'), 2000)
      })
      .catch((e: unknown) => {
        setSaveState('error')
        toast.showError(e instanceof Error ? e.message : '保存失败')
        window.setTimeout(() => setSaveState('idle'), 2000)
      })
  }, [settings.refresh_interval_min, settings.retention_years, settings.max_articles, loading], SETTINGS_SAVE_MS)

  const resetDialog = () => {
    setAddUrl('')
    setAddTitle('')
    setAddGroupId('')
    setPreview(null)
  }

  const openDialog = () => {
    resetDialog()
    setDialogOpen(true)
  }

  const handleMoveGroup = async (subId: string, groupId: string) => {
    try {
      const resp = await news.moveSubscriptionToGroup(subId, groupId || null)
      setSubs(resp.subscriptions)
    } catch (e) {
      toast.showError(e instanceof Error ? e.message : '移动失败')
    }
  }

  const openGroupDialog = (group?: FeedGroup) => {
    setEditingGroup(group ?? null)
    setGroupTitle(group?.title ?? '')
    setGroupDialogOpen(true)
  }

  const handleSaveGroup = async () => {
    const title = groupTitle.trim()
    if (!title) return
    try {
      if (editingGroup) {
        const resp = await news.updateGroup(editingGroup.id, { title })
        setGroups(resp.groups)
      } else {
        const resp = await news.createGroup(title)
        setGroups(resp.groups)
      }
      setGroupDialogOpen(false)
      toast.showSuccess(editingGroup ? '已更新分组' : '已创建分组')
    } catch (e) {
      toast.showError(e instanceof Error ? e.message : '保存分组失败')
    }
  }

  const handleDeleteGroup = async (id: string) => {
    const ok = await confirm({
      title: '确定删除此分组？',
      message: '删除后，其中订阅将移至未分组。',
      confirmLabel: '删除',
      confirmTone: 'danger',
    })
    if (!ok) return
    try {
      const resp = await news.deleteGroup(id)
      setGroups(resp.groups)
      setSubs(resp.subscriptions)
    } catch (e) {
      toast.showError(e instanceof Error ? e.message : '删除分组失败')
    }
  }

  const handleRefresh = async () => {
    setRefreshing(true)
    try {
      const resp = await news.refresh()
      setSubs(await news.listSubscriptions().then(r => r.subscriptions))
      setRefreshedAt(new Date().toISOString())
      if (resp.errors.length) {
        toast.showError(`${resp.errors.length} 个源拉取失败，请检查订阅地址`)
      } else {
        toast.showSuccess(`已更新 ${resp.refreshed} 个订阅源`)
      }
    } catch (e) {
      toast.showError(e instanceof Error ? e.message : '刷新失败')
    } finally {
      setRefreshing(false)
    }
  }

  const toggleSubUrl = (id: string) => {
    setExpandedSubIds(prev => ({ ...prev, [id]: !prev[id] }))
  }

  const checkDuplicateUrl = (url: string): FeedSubscription | undefined => {
    return findDuplicateSubscription(subs, url)
  }

  const handleValidate = async () => {
    const url = addUrl.trim()
    if (!url) return
    const duplicate = checkDuplicateUrl(url)
    if (duplicate) {
      toast.showError(`该订阅地址已添加（${duplicate.title}）`)
      return
    }
    setValidating(true)
    setPreview(null)
    try {
      const v = await news.validate(url, addTitle.trim() || undefined)
      if (!v.result.ok) {
        toast.showError(v.result.error || '订阅源无效')
        return
      }
      setPreview({ title: v.result.title, item_count: v.result.item_count })
      if (!addTitle.trim()) setAddTitle(v.result.title)
      toast.showSuccess(`验证通过，共 ${v.result.item_count} 条`)
    } catch (e) {
      toast.showError(e instanceof Error ? e.message : '验证失败')
    } finally {
      setValidating(false)
    }
  }

  const handleAdd = async () => {
    const url = addUrl.trim()
    if (!url) return
    const duplicate = checkDuplicateUrl(url)
    if (duplicate) {
      toast.showError(`该订阅地址已添加（${duplicate.title}）`)
      return
    }
    setValidating(true)
    try {
      const resp = await news.addSubscription({
        url,
        title: addTitle.trim() || undefined,
        group_id: addGroupId || null,
      })
      setSubs(resp.subscriptions)
      setDialogOpen(false)
      resetDialog()
      toast.showSuccess('已添加订阅')
    } catch (e) {
      toast.showError(e instanceof Error ? e.message : '添加失败')
    } finally {
      setValidating(false)
    }
  }

  const handleDelete = async (id: string) => {
    const sub = subs.find(s => s.id === id)
    const label = sub?.title?.trim() || '该订阅源'
    const ok = await confirm({
      title: `确定删除「${label}」？`,
      message: '删除后，该来源关联的历史文章将同步清除，无法恢复。',
      confirmLabel: '删除',
      confirmTone: 'danger',
    })
    if (!ok) return
    try {
      const resp = await news.deleteSubscription(id)
      setSubs(resp.subscriptions)
      toast.showSuccess('已删除订阅')
    } catch (e) {
      toast.showError(e instanceof Error ? e.message : '删除失败')
    }
  }

  const toggleEnabled = async (sub: FeedSubscription, enabled: boolean) => {
    const next = subs.map(item => (item.id === sub.id ? { ...item, enabled } : item))
    setSubs(next)
    try {
      const resp = await news.saveSubscriptions(next)
      setSubs(resp.subscriptions)
    } catch {
      setSubs(subs)
      toast.showError('更新失败')
    }
  }

  const handleExport = () => {
    if (!subs.length) {
      toast.showWarning('还没有可导出的订阅')
      return
    }
    setExporting(true)
    try {
      const file = buildSubscriptionExportFile(subs)
      downloadSubscriptionExportFile(file)
      toast.showSuccess(`已导出 ${file.subscriptions.length} 个订阅`)
    } finally {
      setExporting(false)
    }
  }

  const resetImportDialog = () => {
    setImportDialogOpen(false)
    setPendingImport(null)
    setImporting(false)
  }

  const handleImportPick = () => {
    importInputRef.current?.click()
  }

  const handleImportFile = async (file: File | null) => {
    if (!file) return
    try {
      const text = await file.text()
      const parsed = parseSubscriptionExportJson(text)
      if (!parsed.ok) {
        toast.showError(parsed.error)
        return
      }
      setPendingImport(parsed.data)
      setImportDialogOpen(true)
    } catch (e) {
      toast.showError(e instanceof Error ? e.message : '读取文件失败')
    } finally {
      if (importInputRef.current) importInputRef.current.value = ''
    }
  }

  const handleConfirmImport = async () => {
    if (!pendingImport) return
    setImporting(true)
    try {
      const resp = await news.importSubscriptions(pendingImport)
      setSubs(resp.subscriptions)
      resetImportDialog()
      const parts = [`新增 ${resp.added} 个`]
      if (resp.skipped > 0) parts.push(`跳过重复 ${resp.skipped} 个`)
      if (resp.errors.length > 0) parts.push(`${resp.errors.length} 个失败`)
      toast.showSuccess(`导入完成：${parts.join('，')}`)
      if (resp.errors.length > 0) {
        const sample = resp.errors.slice(0, 2).map(e => e.error).join('；')
        toast.showError(resp.errors.length > 2 ? `${sample}…` : sample)
      }
    } catch (e) {
      toast.showError(e instanceof Error ? e.message : '导入失败')
    } finally {
      setImporting(false)
    }
  }

  const importPreviewText = (() => {
    if (!pendingImport) return ''
    const duplicateCount = pendingImport.subscriptions.filter(
      item => findDuplicateSubscription(subs, item.url),
    ).length
    const newCount = pendingImport.subscriptions.length - duplicateCount
    return `共 ${pendingImport.subscriptions.length} 个订阅，预计新增 ${newCount} 个，跳过重复 ${duplicateCount} 个。`
  })()

  const saveHintText = (() => {
    switch (saveState) {
      case 'pending': return '保存中…'
      case 'saved': return '已保存'
      case 'error': return '保存失败，请重试'
      default: return ''
    }
  })()

  return (
    <>
      <input
        ref={importInputRef}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={e => { void handleImportFile(e.target.files?.[0] ?? null) }}
      />

      {loading ? (
        <SettingsListPanelSkeleton
          showHeaderActions
          headerActionCount={3}
          aria-label="加载订阅…"
        />
      ) : (<>
        <div className={s.modeRow}>
          <button
            type="button"
            className={mergeClasses(s.modeTab, viewMode === 'subscriptions' && s.modeTabActive)}
            onClick={() => setViewMode('subscriptions')}
          >
            订阅源
          </button>
          <button
            type="button"
            className={mergeClasses(s.modeTab, viewMode === 'groups' && s.modeTabActive)}
            onClick={() => setViewMode('groups')}
          >
            分组管理
          </button>
          <button
            type="button"
            className={mergeClasses(s.modeTab, viewMode === 'storage' && s.modeTabActive)}
            onClick={() => setViewMode('storage')}
          >
            本地存储
          </button>
          <button
            type="button"
            className={mergeClasses(s.modeTab, viewMode === 'update' && s.modeTabActive)}
            onClick={() => setViewMode('update')}
          >
            更新
          </button>
        </div>

      {viewMode === 'subscriptions' && (
      <div className={s.tabPanel}>
      <div className={s.listPanel}>
        <div className={s.listHeader}>
          <Text className={s.listHeaderMeta} block>
            {subs.length > 0
              ? `已添加 ${subs.length} 个订阅源`
              : '添加订阅后，资讯将按时间聚合到新闻中心'}
          </Text>
          <div className={s.listHeaderActions}>
            <OpptrixButton
              variant="secondary"
              icon={<DocumentArrowDownRegular />}
              disabled={exporting || subs.length === 0}
              onClick={handleExport}
            >
              导出
            </OpptrixButton>
            <OpptrixButton
              variant="secondary"
              icon={<DocumentArrowUpRegular />}
              onClick={handleImportPick}
            >
              导入
            </OpptrixButton>
            <OpptrixButton variant="primary" icon={<AddRegular />} onClick={openDialog}>
              添加订阅
            </OpptrixButton>
          </div>
        </div>

        {subs.length === 0 ? (
          <div className={s.emptyBlock}>
            <Text className={s.emptyTitle} block>还没有订阅源</Text>
            <Text className={s.emptyDesc} block>
              点击「添加订阅」，粘贴 RSS、Atom 或 RSSHub 的完整订阅链接即可。
            </Text>
          </div>
        ) : (
          <div className={mergeClasses(s.listScroll, 'opptrix-scroll', 'opptrix-scroll-hover')}>
            {subs.map(sub => (
              <div key={sub.id} className={s.listRow}>
                <div className={s.listRowMain}>
                  <Text className={s.listRowTitle} block title={sub.title}>{sub.title}</Text>
                  <div className={s.subMeta}>
                    {sub.last_error && (
                      <Text className={s.subError} block>拉取失败：{sub.last_error}</Text>
                    )}
                    <button
                      type="button"
                      className={s.urlToggle}
                      aria-expanded={!!expandedSubIds[sub.id]}
                      onClick={() => toggleSubUrl(sub.id)}
                    >
                      {expandedSubIds[sub.id]
                        ? <ChevronDownRegular fontSize={11} />
                        : <ChevronRightRegular fontSize={11} />}
                      <span className={s.urlToggleLabel}>
                        {expandedSubIds[sub.id] ? '收起订阅地址' : formatSubscriptionUrlShort(sub.url)}
                      </span>
                    </button>
                    {expandedSubIds[sub.id] && (
                      <Text className={s.urlFull} block>
                        {sub.url}
                      </Text>
                    )}
                  </div>
                </div>
                <div className={s.listRowControls}>
                  <OpptrixSelect
                    className={s.groupSelect}
                    size="small"
                    selectedOptions={[sub.group_id ?? '']}
                    onOptionSelect={(_, d) => {
                      void handleMoveGroup(sub.id, d.optionValue ?? '')
                    }}
                  >
                    <OpptrixOption value="">未分组</OpptrixOption>
                    {groups.map(g => (
                      <OpptrixOption key={g.id} value={g.id}>{g.title}</OpptrixOption>
                    ))}
                  </OpptrixSelect>
                  <Switch
                    checked={sub.enabled}
                    onChange={(_, d) => { void toggleEnabled(sub, d.checked) }}
                  />
                  <OpptrixButton
                    variant="icon"
                    icon={<DeleteRegular />}
                    aria-label="删除"
                    onClick={() => { void handleDelete(sub.id) }}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
        </div>
      </div>
      )}

      {viewMode === 'groups' && (
      <div className={s.tabPanel}>
      <div className={s.sectionBlock}>
        <div className={s.listPanel}>
          <div className={s.listHeader}>
            <Text className={s.listHeaderMeta} block>
              {groups.length > 0
                ? `已创建 ${groups.length} 个分组`
                : '创建文件夹，将订阅源归类整理'}
            </Text>
            <div className={s.listHeaderActions}>
              <OpptrixButton variant="primary" icon={<FolderRegular />} onClick={() => openGroupDialog()}>
                新建分组
              </OpptrixButton>
            </div>
          </div>

          {groups.length === 0 ? (
            <div className={s.emptyBlock}>
              <Text className={s.emptyTitle} block>还没有分组</Text>
              <Text className={s.emptyDesc} block>
                点击「新建分组」，例如「财经资讯」「科技动态」，便于在新闻中心按类浏览。
              </Text>
            </div>
          ) : (
            <div className={mergeClasses(s.listScroll, 'opptrix-scroll', 'opptrix-scroll-hover')}>
              {groups.map(g => {
                const count = subs.filter(sub => sub.group_id === g.id).length
                return (
                  <div key={g.id} className={s.listRow}>
                    <div className={s.listRowMain}>
                      <Text className={s.listRowTitle} block title={g.title}>{g.title}</Text>
                      <Text className={s.listRowMeta} block>{count} 个订阅源</Text>
                    </div>
                    <div className={s.listRowControls}>
                      <OpptrixButton
                        variant="icon"
                        icon={<EditRegular />}
                        aria-label={`重命名 ${g.title}`}
                        onClick={() => openGroupDialog(g)}
                      />
                      <OpptrixButton
                        variant="icon"
                        icon={<DeleteRegular />}
                        aria-label={`删除 ${g.title}`}
                        onClick={() => { void handleDeleteGroup(g.id) }}
                      />
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
        </div>
      </div>
      )}

      {viewMode === 'storage' && (
      <div className={s.tabPanel}>
      <div className={s.sectionBlock}>
        <Text className={s.sectionLabel} block>本地存储</Text>
        <SettingsGroup>
          <SettingsRow
            title="保留年限"
            desc="默认保留 3 年内发布的文章，便于历史回溯分析"
            control={(
              <OpptrixSelect
                className={s.intervalSelect}
                size="small"
                selectedOptions={[String(settings.retention_years)]}
                onOptionSelect={(_, d) => {
                  const n = Number(d.optionValue)
                  if (RETENTION_YEAR_OPTIONS.includes(n as typeof RETENTION_YEAR_OPTIONS[number])) {
                    setSettings(prev => ({ ...prev, retention_years: n }))
                  }
                }}
              >
                {RETENTION_YEAR_OPTIONS.map(y => (
                  <OpptrixOption key={y} value={String(y)}>
                    {y === 0 ? '不限制' : `${y} 年`}
                  </OpptrixOption>
                ))}
              </OpptrixSelect>
            )}
          />
          <SettingsRow
            title="文章数量上限"
            desc="超出上限时，按发布时间从旧到新自动清理"
            control={(
              <OpptrixSelect
                className={s.intervalSelect}
                size="small"
                selectedOptions={[settings.max_articles == null ? '__unlimited__' : String(settings.max_articles)]}
                onOptionSelect={(_, d) => {
                  const v = d.optionValue ?? '__unlimited__'
                  setSettings(prev => ({
                    ...prev,
                    max_articles: v === '__unlimited__' ? null : Number(v),
                  }))
                }}
              >
                {MAX_ARTICLE_OPTIONS.map(opt => (
                  <OpptrixOption key={opt.value} value={opt.value}>{opt.label}</OpptrixOption>
                ))}
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

      {viewMode === 'update' && (
      <div className={s.tabPanel}>
      <div className={s.sectionBlock}>
        <Text className={s.sectionLabel} block>更新</Text>
        <SettingsGroup>
          <SettingsRow
            title="自动刷新间隔"
            desc="打开新闻中心时，超过该时间将自动在后台拉取最新资讯"
            control={(
              <OpptrixSelect
                className={s.intervalSelect}
                size="small"
                selectedOptions={[String(settings.refresh_interval_min)]}
                onOptionSelect={(_, d) => {
                  const n = Number(d.optionValue)
                  if (REFRESH_INTERVAL_OPTIONS.includes(n as typeof REFRESH_INTERVAL_OPTIONS[number])) {
                    setSettings(prev => ({ ...prev, refresh_interval_min: n }))
                  }
                }}
              >
                {REFRESH_INTERVAL_OPTIONS.map(min => (
                  <OpptrixOption key={min} value={String(min)} text={`${min} 分钟`}>{min} 分钟</OpptrixOption>
                ))}
              </OpptrixSelect>
            )}
          />
          <SettingsRow
            title="上次更新"
            desc="全部订阅源最近一次成功拉取的时间"
            control={(
              <div className={s.updateControl}>
                <Text className={s.updateTime}>
                  {refreshedAt
                    ? new Date(refreshedAt).toLocaleString('zh-CN')
                    : '尚未拉取'}
                </Text>
                <OpptrixButton
                  variant="secondary"
                  size="small"
                  icon={<ArrowSyncRegular />}
                  onClick={() => { void handleRefresh() }}
                  disabled={refreshing || subs.length === 0}
                >
                  {refreshing ? '刷新中…' : '立即刷新'}
                </OpptrixButton>
              </div>
            )}
            last
          />
        </SettingsGroup>
        </div>
      </div>
      )}
      </>)}

      <Dialog open={importDialogOpen} onOpenChange={(_, d) => { if (!d.open) resetImportDialog() }}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>导入订阅</DialogTitle>
            <DialogContent className={s.dialogBody}>
              <Text className={s.importSummary} block>{importPreviewText}</Text>
              <Text className={s.importHint} block>
                导入文件仅包含订阅地址与名称，不含分组信息；重复地址将自动跳过。新订阅会验证源是否可用，可能需要一点时间。
              </Text>
              <div className={s.dialogActions}>
                <OpptrixButton variant="ghost" disabled={importing} onClick={resetImportDialog}>
                  取消
                </OpptrixButton>
                <OpptrixButton
                  variant="primary"
                  disabled={importing || !pendingImport}
                  onClick={() => { void handleConfirmImport() }}
                >
                  {importing ? '导入中…' : '开始导入'}
                </OpptrixButton>
              </div>
            </DialogContent>
          </DialogBody>
        </DialogSurface>
      </Dialog>

      <Dialog open={dialogOpen} onOpenChange={(_, d) => { setDialogOpen(d.open); if (!d.open) resetDialog() }}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>添加订阅</DialogTitle>
            <DialogContent className={s.dialogBody}>
              <Text className={s.dialogHint} block>
                支持 RSS 2.0、Atom 等标准格式。RSSHub 同样输出标准订阅文件，直接粘贴完整链接即可。
              </Text>
              <OpptrixField label="订阅地址">
                <OpptrixInput
                  value={addUrl}
                  onChange={(_, d) => { setAddUrl(d.value); setPreview(null) }}
                  placeholder="https://…"
                />
              </OpptrixField>
              <OpptrixField label="显示名称（可选）">
                <OpptrixInput
                  value={addTitle}
                  onChange={(_, d) => setAddTitle(d.value)}
                  placeholder="验证后自动填充"
                />
              </OpptrixField>

              <OpptrixField label="所属分组（可选）">
                <OpptrixSelect
                  selectedOptions={[addGroupId]}
                  onOptionSelect={(_, d) => setAddGroupId(d.optionValue ?? '')}
                >
                  <OpptrixOption value="">未分组</OpptrixOption>
                  {groups.map(g => (
                    <OpptrixOption key={g.id} value={g.id}>{g.title}</OpptrixOption>
                  ))}
                </OpptrixSelect>
              </OpptrixField>

              {preview && (
                <div className={s.preview}>
                  验证通过：{preview.title}（{preview.item_count} 条）
                </div>
              )}

              <div className={s.dialogActions}>
                <OpptrixButton variant="ghost" onClick={() => setDialogOpen(false)}>
                  取消
                </OpptrixButton>
                <OpptrixButton
                  variant="secondary"
                  disabled={validating || !addUrl.trim()}
                  onClick={() => { void handleValidate() }}
                >
                  {validating ? '验证中…' : '验证'}
                </OpptrixButton>
                <OpptrixButton
                  variant="primary"
                  disabled={validating || !addUrl.trim()}
                  onClick={() => { void handleAdd() }}
                >
                  {validating ? '添加中…' : '添加'}
                </OpptrixButton>
              </div>
            </DialogContent>
          </DialogBody>
        </DialogSurface>
      </Dialog>

      <Dialog open={groupDialogOpen} onOpenChange={(_, d) => setGroupDialogOpen(d.open)}>
        <DialogSurface>
          <DialogBody>
            <DialogTitle>{editingGroup ? '重命名分组' : '新建分组'}</DialogTitle>
            <DialogContent className={s.dialogBody}>
              <OpptrixField label="分组名称">
                <OpptrixInput
                  value={groupTitle}
                  onChange={(_, d) => setGroupTitle(d.value)}
                  placeholder="例如：财经资讯"
                />
              </OpptrixField>
              <div className={s.dialogActions}>
                <OpptrixButton variant="ghost" onClick={() => setGroupDialogOpen(false)}>取消</OpptrixButton>
                <OpptrixButton variant="primary" disabled={!groupTitle.trim()} onClick={() => { void handleSaveGroup() }}>
                  保存
                </OpptrixButton>
              </div>
            </DialogContent>
          </DialogBody>
        </DialogSurface>
      </Dialog>
    </>
  )
}
