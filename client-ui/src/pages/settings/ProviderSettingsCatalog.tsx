import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import {
  Switch,
  Text,
  makeStyles,
  mergeClasses,
} from '@fluentui/react-components'
import {
  ChevronDownRegular,
  ChevronRightRegular,
  ChevronUpRegular,
} from '@fluentui/react-icons'
import type { InstalledProviderSummary, ProviderCatalogResponse, PublicProviderRuntime } from '../../types/provider'
import {
  getProviderCatalog,
  listInstalledProviders,
  rescanProviders,
  reloadInstalledProvider,
  saveProviderConfig,
  saveProviderOrder,
  uninstallInstalledProvider,
} from '../../api/client'
import { ProviderSettingsForm, isExpandableSettingsField } from './ProviderSettingsForm'
import { useSettingsToast } from './SettingsToast'
import OpptrixButton from '../../components/opptrix/OpptrixButton'
import { opptrixTokens, opptrixCssVars } from '../../theme/tokens'
import { motion } from '../../theme/mixins'
import { SettingsListPanelSkeleton } from './SettingsListPanelSkeleton'

const useListStyles = makeStyles({
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
    fontSize: 'var(--opptrix-font-md)',
    color: opptrixCssVars.textTertiary,
    lineHeight: 1.45,
    flex: 1,
    minWidth: 0,
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
  listRowExpanded: {
    flexDirection: 'column',
    alignItems: 'stretch',
    paddingBottom: '8px',
  },
  listRowTop: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '10px',
    width: '100%',
  },
  listRowMain: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '1px',
  },
  listRowTitle: {
    fontSize: 'var(--opptrix-font-base)',
    fontWeight: 600,
    color: opptrixCssVars.textPrimary,
    lineHeight: 1.35,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  listRowMeta: {
    fontSize: 'var(--opptrix-font-sm)',
    color: opptrixCssVars.textTertiary,
    lineHeight: 1.4,
  },
  listRowControls: {
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  credentialExpand: {
    width: '100%',
    padding: '0 2px 2px',
  },
  urlToggle: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    padding: 0,
    border: 'none',
    background: 'transparent',
    cursor: 'pointer',
    fontSize: 'var(--opptrix-font-sm)',
    color: opptrixCssVars.textTertiary,
    ':hover': {
      color: opptrixCssVars.textSecondary,
    },
  },
  sectionBlock: {
    marginTop: '12px',
    ':first-of-type': {
      marginTop: 0,
    },
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
    fontSize: 'var(--opptrix-font-base)',
    fontWeight: 650,
    color: opptrixCssVars.textPrimary,
    marginBottom: '6px',
  },
  emptyDesc: {
    fontSize: 'var(--opptrix-font-md)',
    color: opptrixCssVars.textSecondary,
    lineHeight: 1.5,
  },
  installedRow: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '10px',
    padding: '6px 12px',
    minHeight: '36px',
    borderBottom: `1px solid ${opptrixCssVars.separator}`,
    ':last-child': {
      borderBottom: 'none',
    },
  },
  installedActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    flexShrink: 0,
  },
  groupBlock: {
    ':not(:first-of-type)': {
      borderTop: `1px solid ${opptrixCssVars.separator}`,
    },
  },
  groupHeader: {
    display: 'flex',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: '10px',
    padding: '8px 12px 4px',
    position: 'sticky',
    top: 0,
    zIndex: 2,
    backgroundColor: opptrixCssVars.canvas,
    borderBottom: `1px solid ${opptrixCssVars.separator}`,
  },
  groupTitle: {
    fontSize: 'var(--opptrix-font-md)',
    fontWeight: 650,
    color: opptrixCssVars.textPrimary,
    lineHeight: 1.35,
  },
  groupMeta: {
    fontSize: 'var(--opptrix-font-sm)',
    color: opptrixCssVars.textTertiary,
    lineHeight: 1.4,
    flexShrink: 0,
  },
})

const usePriorityStyles = makeStyles({
  priorityRoot: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  subTabBar: {
    flexShrink: 0,
  },
  subTabList: {
    minHeight: '32px',
    gap: '2px',
  },
  dragList: {
    position: 'relative',
    flex: 1,
    minHeight: 0,
  },
  dropLine: {
    position: 'absolute',
    left: '10px',
    right: '10px',
    height: '2px',
    borderRadius: '1px',
    backgroundColor: opptrixCssVars.inputBorderFocus,
    pointerEvents: 'none',
    zIndex: 3,
    transitionProperty: 'top, opacity',
    transitionDuration: motion.fast,
    transitionTimingFunction: motion.ease,
  },
  dragRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '7px 12px',
    minHeight: '40px',
    borderBottom: `1px solid ${opptrixCssVars.separator}`,
    backgroundColor: opptrixCssVars.canvas,
    transitionProperty: 'transform, opacity, background-color, box-shadow',
    transitionDuration: motion.fast,
    transitionTimingFunction: motion.ease,
    ':last-child': {
      borderBottom: 'none',
    },
  },
  dragRowHover: {
    backgroundColor: opptrixCssVars.gray100,
  },
  dragRowDisabled: {
    opacity: 0.72,
  },
  dragRowPlaceholder: {
    minHeight: '40px',
    margin: '0 10px',
    borderRadius: opptrixTokens.radiusMd,
    border: `1px dashed ${opptrixCssVars.separator}`,
    backgroundColor: opptrixCssVars.gray100,
    opacity: 0.65,
  },
  dragHandle: {
    flexShrink: 0,
    color: opptrixCssVars.textTertiary,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '24px',
    height: '24px',
    borderRadius: opptrixTokens.radiusSm,
    cursor: 'grab',
    touchAction: 'none',
    transitionProperty: 'background-color, color',
    transitionDuration: motion.fast,
    ':hover': {
      backgroundColor: opptrixCssVars.gray100,
      color: opptrixCssVars.textSecondary,
    },
    ':active': {
      cursor: 'grabbing',
    },
  },
  dragMain: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '1px',
  },
  dragTitle: {
    fontSize: 'var(--opptrix-font-base)',
    fontWeight: 600,
    color: opptrixCssVars.textPrimary,
    lineHeight: 1.35,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  dragMeta: {
    fontSize: 'var(--opptrix-font-sm)',
    color: opptrixCssVars.textTertiary,
    lineHeight: 1.4,
  },
  rankBadge: {
    flexShrink: 0,
    fontSize: 'var(--opptrix-font-sm)',
    fontWeight: 650,
    color: opptrixCssVars.textSecondary,
    minWidth: '20px',
    height: '20px',
    lineHeight: '20px',
    textAlign: 'center',
    borderRadius: opptrixTokens.radiusSm,
    backgroundColor: opptrixCssVars.gray100,
  },
  moveControls: {
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '1px',
  },
  moveBtn: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '22px',
    height: '18px',
    padding: 0,
    border: 'none',
    borderRadius: opptrixTokens.radiusSm,
    backgroundColor: 'transparent',
    color: opptrixCssVars.textTertiary,
    cursor: 'pointer',
    transitionProperty: 'background-color, color',
    transitionDuration: motion.fast,
    ':hover': {
      backgroundColor: opptrixCssVars.gray100,
      color: opptrixCssVars.textSecondary,
    },
    ':disabled': {
      opacity: 0.35,
      cursor: 'default',
    },
  },
  floatPreview: {
    position: 'fixed',
    zIndex: 1200,
    pointerEvents: 'none',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '7px 12px',
    minHeight: '40px',
    minWidth: '220px',
    maxWidth: '360px',
    borderRadius: opptrixTokens.radiusMd,
    border: opptrixCssVars.settingsPanelBorder,
    backgroundColor: opptrixCssVars.canvas,
    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.12), 0 2px 6px rgba(0, 0, 0, 0.06)',
    transform: 'scale(1.02)',
  },
  saveHint: {
    fontSize: 'var(--opptrix-font-sm)',
    color: opptrixCssVars.textTertiary,
    flexShrink: 0,
  },
  saveHintActive: {
    color: opptrixCssVars.textSecondary,
  },
})

export function useProviderCatalog() {
  const toast = useSettingsToast()
  const [catalog, setCatalog] = useState<ProviderCatalogResponse | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const data = await getProviderCatalog()
      setCatalog(data)
      return data
    } catch (e) {
      toast.showError(e instanceof Error ? e.message : '无法读取数据源列表')
      return null
    } finally {
      setLoading(false)
    }
  }, [toast])

  useEffect(() => {
    let active = true
    getProviderCatalog()
      .then((data) => {
        if (!active) return
        setLoading(false)
        setCatalog(data)
      })
      .catch((e) => {
        if (active) {
          setLoading(false)
          toast.showError(e instanceof Error ? e.message : '无法读取数据源列表')
        }
      })
    return () => { active = false }
  }, [toast])

  return { catalog, loading, refresh, setCatalog }
}

function providerOrderStatusMeta(provider: PublicProviderRuntime): string {
  const parts: string[] = []
  if (provider.subtitle?.trim()) parts.push(provider.subtitle.trim())

  if (provider.priorityEligible) {
    parts.push('已启用，按此顺序参与行情回退')
    return parts.join(' · ')
  }
  if (!provider.enabled) {
    parts.push('已关闭，不会使用此数据源')
    return parts.join(' · ')
  }
  if (provider.requiresApiKey) {
    parts.push('请填写密钥并打开开关')
    return parts.join(' · ')
  }
  parts.push('请打开开关后生效')
  return parts.join(' · ')
}

function providerStatusMeta(provider: PublicProviderRuntime, marketLabel: string) {
  const parts: string[] = []
  if (marketLabel) parts.push(marketLabel)
  if (provider.subtitle?.trim()) parts.push(provider.subtitle.trim())

  const requiredSecrets = provider.settingsFields.filter(f => f.type === 'secret' && f.required)
  if (requiredSecrets.length) {
    const configured = requiredSecrets.filter(f => provider.secretsConfigured[f.key]).length
    parts.push(configured === requiredSecrets.length
      ? '密钥已配置'
      : `密钥 ${configured}/${requiredSecrets.length}`)
  } else if (provider.settingsFields.some(f => f.type === 'secret')) {
    const anySecret = provider.settingsFields.some(
      f => f.type === 'secret' && provider.secretsConfigured[f.key],
    )
    parts.push(anySecret ? '密钥已配置' : '尚未配置密钥')
  }

  const expandableCount = provider.settingsFields.filter(isExpandableSettingsField).length
  if (expandableCount > 0) {
    parts.push(`${expandableCount} 项可配置`)
  }

  return parts.join(' · ')
}

function InstalledProvidersSection({ onChanged }: { onChanged: () => void }) {
  const s = useListStyles()
  const toast = useSettingsToast()
  const [items, setItems] = useState<InstalledProviderSummary[]>([])
  const [providersDir, setProvidersDir] = useState('')
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [scanning, setScanning] = useState(false)

  const refresh = useCallback(async () => {
    try {
      const data = await listInstalledProviders()
      setItems(data.providers)
      setProvidersDir(data.providersDir ?? '')
    } catch {
      setItems([])
      setProvidersDir('')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let active = true
    listInstalledProviders()
      .then((data) => {
        if (!active) return
        setLoading(false)
        setItems(data.providers)
        setProvidersDir(data.providersDir ?? '')
      })
      .catch(() => {
        if (active) {
          setLoading(false)
          setItems([])
          setProvidersDir('')
        }
      })
    return () => { active = false }
  }, [])

  const handleRescan = async () => {
    setScanning(true)
    try {
      const resp = await rescanProviders()
      const data = resp.data
      if (data?.providers) {
        setItems(data.providers)
        setProvidersDir(data.providersDir ?? providersDir)
      }
      toast.showSuccess(resp.message ?? '已重新扫描')
      onChanged()
    } catch (e) {
      toast.showError(e instanceof Error ? e.message : '扫描失败')
    } finally {
      setScanning(false)
    }
  }

  if (loading) return null

  const handleReload = async (providerId: string) => {
    setBusyId(providerId)
    try {
      await reloadInstalledProvider(providerId)
      toast.showSuccess('已重新加载')
      await refresh()
      onChanged()
    } catch (e) {
      toast.showError(e instanceof Error ? e.message : '重新加载失败')
    } finally {
      setBusyId(null)
    }
  }

  const handleUninstall = async (providerId: string, title: string) => {
    setBusyId(providerId)
    try {
      await uninstallInstalledProvider(providerId)
      toast.showSuccess(`已移除「${title}」`)
      await refresh()
      onChanged()
    } catch (e) {
      toast.showError(e instanceof Error ? e.message : '卸载失败')
    } finally {
      setBusyId(null)
    }
  }

  return (
    <div className={s.sectionBlock}>
      <div className={s.listPanel} style={{ height: 'auto', maxHeight: items.length ? '220px' : 'none' }}>
        <div className={s.listHeader}>
          <Text className={s.listHeaderMeta} block>
            {providersDir
              ? `扩展数据源：将插件文件夹放入 ${providersDir}，保存后会自动扫描（约 1 秒内）`
              : '扩展数据源：将插件文件夹放入用户数据目录下的 providers 文件夹'}
          </Text>
          <OpptrixButton variant="ghost" disabled={scanning} onClick={() => { void handleRescan() }}>
            {scanning ? '扫描中…' : '重新扫描'}
          </OpptrixButton>
        </div>
        {items.length > 0 && (
        <div className={mergeClasses(s.listScroll, 'opptrix-scroll', 'opptrix-scroll-hover')}>
          {items.map(item => (
            <div key={item.providerId} className={s.installedRow}>
              <div className={s.listRowMain}>
                <Text className={s.listRowTitle} block title={item.title}>{item.title}</Text>
                <Text className={s.listRowMeta} block>
                  v{item.version}
                  {item.loaded ? ' · 已加载' : ' · 未加载'}
                </Text>
              </div>
              <div className={s.installedActions}>
                <OpptrixButton
                  variant="ghost"
                  disabled={busyId === item.providerId}
                  onClick={() => { void handleReload(item.providerId) }}
                >
                  重新加载
                </OpptrixButton>
                <OpptrixButton
                  variant="ghost"
                  disabled={busyId === item.providerId}
                  onClick={() => { void handleUninstall(item.providerId, item.title) }}
                >
                  移除
                </OpptrixButton>
              </div>
            </div>
          ))}
        </div>
        )}
      </div>
    </div>
  )
}

function ProviderListRow({
  provider,
  marketLabel,
  onSaved,
  settingsMode = 'full',
  sortable = false,
  saving = false,
  onDragHandlePointerDown,
  onMoveUp,
  onMoveDown,
  moveUpDisabled = false,
  moveDownDisabled = false,
  dragging = false,
}: {
  provider: PublicProviderRuntime
  marketLabel: string
  onSaved: () => void
  settingsMode?: 'full' | 'toggle-only'
  sortable?: boolean
  saving?: boolean
  onDragHandlePointerDown?: (e: ReactPointerEvent<HTMLSpanElement>) => void
  onMoveUp?: () => void
  onMoveDown?: () => void
  moveUpDisabled?: boolean
  moveDownDisabled?: boolean
  dragging?: boolean
}) {
  const s = useListStyles()
  const priorityS = usePriorityStyles()
  const toast = useSettingsToast()
  const [expanded, setExpanded] = useState(false)
  const [toggling, setToggling] = useState(false)

  const hasSettings = settingsMode === 'full' && provider.settingsFields.some(isExpandableSettingsField)
  const statusMeta = sortable
    ? providerOrderStatusMeta(provider)
    : providerStatusMeta(provider, marketLabel)

  const handleToggleEnabled = async (checked: boolean) => {
    if (checked && !provider.canEnable) {
      toast.showError('请先完成必填配置后再启用')
      return
    }
    setToggling(true)
    try {
      await saveProviderConfig(provider.providerId, { enabled: checked })
      toast.showSuccess(checked ? '已启用' : '已停用')
      onSaved()
    } catch (e) {
      toast.showError(e instanceof Error ? e.message : '更新失败')
    } finally {
      setToggling(false)
    }
  }

  return (
    <div className={mergeClasses(
      s.listRow,
      expanded && hasSettings && s.listRowExpanded,
      sortable && dragging && priorityS.dragRowDisabled,
      sortable && !provider.priorityEligible && priorityS.dragRowDisabled,
    )}>
      <div className={s.listRowTop}>
        {sortable && (
          <span
            className={priorityS.dragHandle}
            aria-label={`拖动 ${provider.title}`}
            onPointerDown={onDragHandlePointerDown}
          >
            ≡
          </span>
        )}
        <div className={s.listRowMain}>
          <Text className={s.listRowTitle} block title={provider.title}>
            {provider.title}
          </Text>
          <Text className={s.listRowMeta} block>
            {statusMeta}
          </Text>
          {hasSettings && (
            <button
              type="button"
              className={mergeClasses(s.urlToggle, 'opptrix-focusable')}
              aria-expanded={expanded}
              onClick={() => setExpanded(v => !v)}
            >
              {expanded
                ? <ChevronDownRegular fontSize={11} />
                : <ChevronRightRegular fontSize={11} />}
              <span>{expanded ? '收起设置' : '配置连接'}</span>
            </button>
          )}
        </div>
        <div className={s.listRowControls}>
          {sortable && (
            <div className={priorityS.moveControls}>
              <button
                type="button"
                className={mergeClasses(priorityS.moveBtn, 'opptrix-focusable')}
                disabled={moveUpDisabled || saving}
                aria-label={`上移 ${provider.title}`}
                onClick={onMoveUp}
              >
                <ChevronUpRegular fontSize={12} />
              </button>
              <button
                type="button"
                className={mergeClasses(priorityS.moveBtn, 'opptrix-focusable')}
                disabled={moveDownDisabled || saving}
                aria-label={`下移 ${provider.title}`}
                onClick={onMoveDown}
              >
                <ChevronDownRegular fontSize={12} />
              </button>
            </div>
          )}
          <Switch
            checked={provider.enabled}
            disabled={toggling}
            onChange={(_, d) => { void handleToggleEnabled(!!d.checked) }}
            aria-label={`${provider.enabled ? '停用' : '启用'} ${provider.title}`}
          />
        </div>
      </div>
      {expanded && hasSettings && (
        <div className={s.credentialExpand}>
          <ProviderSettingsForm provider={provider} onSaved={onSaved} />
        </div>
      )}
    </div>
  )
}

export function ProviderCatalogListPanel({
  catalog,
  onSaved,
  onOrderSaved,
  showInstalled = true,
  settingsMode = 'full',
  panelHeight = '420px',
}: {
  catalog: ProviderCatalogResponse
  onSaved: () => void
  onOrderSaved?: (catalog: ProviderCatalogResponse) => void
  showInstalled?: boolean
  settingsMode?: 'full' | 'toggle-only'
  panelHeight?: string | number
}) {
  const s = useListStyles()
  const priorityS = usePriorityStyles()
  const allProviders = catalog.providers?.length
    ? catalog.providers
    : catalog.groups.flatMap(g => g.providers)
  const enabledCount = allProviders.filter(p => p.enabled).length
  const sortable = settingsMode === 'full' && !!onOrderSaved

  if (!allProviders.length) {
    return (
      <div className={s.listPanel}>
        <div className={s.emptyBlock}>
          <Text className={s.emptyTitle} block>暂无数据源</Text>
          <Text className={s.emptyDesc} block>当前没有可配置的市场数据提供商。</Text>
        </div>
      </div>
    )
  }

  return (
    <>
      {showInstalled && <InstalledProvidersSection onChanged={onSaved} />}
      <div className={s.listPanel} style={{ height: panelHeight }}>
        <div className={s.listHeader}>
          <Text className={s.listHeaderMeta} block>
            {settingsMode === 'toggle-only'
              ? (enabledCount > 0
                ? `已启用 ${enabledCount} / ${allProviders.length} 个数据源`
                : '以下为内置数据源；付费源需填写密钥后可在设置中启用')
              : (enabledCount > 0
                ? `已启用 ${enabledCount} / ${allProviders.length} 个数据源 · 拖拽调整回退顺序`
                : '配置连接并启用数据源；拖拽列表可调整行情回退顺序')}
          </Text>
        </div>
        <div className={mergeClasses(s.listScroll, sortable && priorityS.dragList, 'opptrix-scroll', 'opptrix-scroll-hover')}>
          {sortable
            ? (
              <ProviderOrderList
                providers={allProviders}
                onSaved={onSaved}
                onOrderSaved={onOrderSaved!}
              />
            )
            : allProviders.map(provider => (
              <ProviderListRow
                key={provider.providerId}
                provider={provider}
                marketLabel=""
                onSaved={onSaved}
                settingsMode={settingsMode}
              />
            ))}
        </div>
      </div>
    </>
  )
}

function reorderList<T>(items: T[], from: number, to: number): T[] {
  if (from === to || from < 0 || to < 0 || from >= items.length || to >= items.length) {
    return items
  }
  const next = items.slice()
  const [moved] = next.splice(from, 1)
  next.splice(to, 0, moved!)
  return next
}

function ProviderOrderList({
  providers,
  onSaved,
  onOrderSaved,
}: {
  providers: PublicProviderRuntime[]
  onSaved: () => void
  onOrderSaved: (catalog: ProviderCatalogResponse) => void
}) {
  const priorityS = usePriorityStyles()
  const toast = useSettingsToast()
  const [ordered, setOrdered] = useState(providers)
  const [saving, setSaving] = useState(false)
  const [draggingIndex, setDraggingIndex] = useState<number | null>(null)
  const [dropIndex, setDropIndex] = useState<number | null>(null)
  const [floatPos, setFloatPos] = useState<{ x: number; y: number } | null>(null)
  const rowRefs = useRef<Array<HTMLDivElement | null>>([])
  const listRef = useRef<HTMLDivElement | null>(null)
  const dragRef = useRef<{ index: number; pointerId: number; offsetY: number } | null>(null)

  useEffect(() => {
    setOrdered(providers)
    setDraggingIndex(null)
    setDropIndex(null)
    setFloatPos(null)
    dragRef.current = null
  }, [providers])

  const persistOrder = async (next: PublicProviderRuntime[]) => {
    setSaving(true)
    try {
      const catalog = await saveProviderOrder({
        provider_ids: next.map(p => p.providerId),
      })
      toast.showSuccess('顺序已保存')
      onOrderSaved(catalog)
    } catch (e) {
      toast.showError(e instanceof Error ? e.message : '保存排序失败')
      setOrdered(providers)
    } finally {
      setSaving(false)
    }
  }

  const applyReorder = (from: number, to: number) => {
    if (saving || from === to || from < 0 || to < 0 || from >= ordered.length || to >= ordered.length) {
      return
    }
    const next = reorderList(ordered, from, to)
    setOrdered(next)
    void persistOrder(next)
  }

  const resolveDropIndex = (clientY: number): number => {
    const rows = rowRefs.current
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      if (!row) continue
      const rect = row.getBoundingClientRect()
      const mid = rect.top + rect.height / 2
      if (clientY < mid) return i
    }
    return Math.max(0, rows.length - 1)
  }

  const endDrag = (pointerId: number) => {
    const drag = dragRef.current
    if (drag && dropIndex != null && dropIndex !== drag.index) {
      applyReorder(drag.index, dropIndex)
    } else {
      setOrdered(providers)
    }
    dragRef.current = null
    setDraggingIndex(null)
    setDropIndex(null)
    setFloatPos(null)
    try {
      listRef.current?.releasePointerCapture(pointerId)
    } catch { /* ignore */ }
  }

  const onHandlePointerDown = (index: number, e: ReactPointerEvent<HTMLSpanElement>) => {
    if (saving) return
    e.preventDefault()
    e.stopPropagation()
    const row = rowRefs.current[index]
    if (!row) return
    const rect = row.getBoundingClientRect()
    dragRef.current = {
      index,
      pointerId: e.pointerId,
      offsetY: e.clientY - rect.top,
    }
    setDraggingIndex(index)
    setDropIndex(index)
    setFloatPos({ x: e.clientX, y: e.clientY })
    listRef.current?.setPointerCapture(e.pointerId)
  }

  const onListPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return
    setFloatPos({ x: e.clientX, y: e.clientY })
    setDropIndex(resolveDropIndex(e.clientY))
  }

  const onListPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragRef.current) return
    endDrag(e.pointerId)
  }

  const draggedProvider = draggingIndex != null ? ordered[draggingIndex] : null

  return (
    <>
      <div
        ref={listRef}
        className={priorityS.dragList}
        onPointerMove={onListPointerMove}
        onPointerUp={onListPointerUp}
        onPointerCancel={onListPointerUp}
      >
        {dropIndex != null && draggingIndex != null && (
          <div
            className={priorityS.dropLine}
            style={{
              top: `${(rowRefs.current[dropIndex]?.offsetTop ?? dropIndex * 40) + (dropIndex > draggingIndex ? 38 : 0)}px`,
              opacity: dropIndex === draggingIndex ? 0 : 1,
            }}
          />
        )}
        {ordered.map((provider, index) => (
          <div
            key={provider.providerId}
            ref={(el) => { rowRefs.current[index] = el }}
          >
            <ProviderListRow
              provider={provider}
              marketLabel=""
              onSaved={onSaved}
              sortable
              saving={saving}
              dragging={draggingIndex === index}
              onDragHandlePointerDown={(e) => { onHandlePointerDown(index, e) }}
              onMoveUp={() => { applyReorder(index, index - 1) }}
              onMoveDown={() => { applyReorder(index, index + 1) }}
              moveUpDisabled={index === 0}
              moveDownDisabled={index === ordered.length - 1}
            />
          </div>
        ))}
      </div>
      {draggedProvider && floatPos && (
        <div
          className={priorityS.floatPreview}
          style={{
            left: `${floatPos.x + 12}px`,
            top: `${floatPos.y - (dragRef.current?.offsetY ?? 20)}px`,
          }}
        >
          <Text className={priorityS.dragTitle} block>{draggedProvider.title}</Text>
        </div>
      )}
    </>
  )
}

export function ProviderCatalogLoading() {
  return <SettingsListPanelSkeleton aria-label="加载数据源…" />
}
