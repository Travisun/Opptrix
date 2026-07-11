import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import {
  Switch,
  Tab,
  TabList,
  Text,
  makeStyles,
  mergeClasses,
} from '@fluentui/react-components'
import {
  ChevronDownRegular,
  ChevronRightRegular,
  ChevronUpRegular,
} from '@fluentui/react-icons'
import type { InstalledProviderSummary, ProviderCatalogGroup, ProviderCatalogResponse, PublicProviderRuntime } from '../../types/provider'
import {
  getProviderCatalog,
  listInstalledProviders,
  rescanProviders,
  reloadInstalledProvider,
  saveProviderConfig,
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
    fontSize: '12px',
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
    fontSize: '11px',
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
    fontSize: '13px',
    fontWeight: 600,
    color: opptrixCssVars.textPrimary,
    lineHeight: 1.35,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  dragMeta: {
    fontSize: '11px',
    color: opptrixCssVars.textTertiary,
    lineHeight: 1.4,
  },
  rankBadge: {
    flexShrink: 0,
    fontSize: '11px',
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
    fontSize: '11px',
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
    void refresh()
  }, [refresh])

  return { catalog, loading, refresh, setCatalog }
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
    void refresh()
  }, [refresh])

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
}: {
  provider: PublicProviderRuntime
  marketLabel: string
  onSaved: () => void
  settingsMode?: 'full' | 'toggle-only'
}) {
  const s = useListStyles()
  const toast = useSettingsToast()
  const [expanded, setExpanded] = useState(false)
  const [toggling, setToggling] = useState(false)

  const hasSettings = settingsMode === 'full' && provider.settingsFields.some(isExpandableSettingsField)

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
    <div className={mergeClasses(s.listRow, expanded && hasSettings && s.listRowExpanded)}>
      <div className={s.listRowTop}>
        <div className={s.listRowMain}>
          <Text className={s.listRowTitle} block title={provider.title}>{provider.title}</Text>
          <Text className={s.listRowMeta} block>
            {providerStatusMeta(provider, marketLabel)}
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
  showInstalled = true,
  settingsMode = 'full',
  panelHeight = '360px',
}: {
  catalog: ProviderCatalogResponse
  onSaved: () => void
  showInstalled?: boolean
  settingsMode?: 'full' | 'toggle-only'
  panelHeight?: string | number
}) {
  const s = useListStyles()
  const allProviders = catalog.groups.flatMap(g =>
    g.providers.map(p => ({ provider: p, marketLabel: g.label })),
  )
  const enabledCount = allProviders.filter(item => item.provider.enabled).length

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
                ? `已启用 ${enabledCount} / ${allProviders.length} 个数据源`
                : '配置连接信息并启用数据源，即可获取对应市场行情')}
          </Text>
        </div>
        <div className={mergeClasses(s.listScroll, 'opptrix-scroll', 'opptrix-scroll-hover')}>
          {allProviders.map(({ provider, marketLabel }) => (
            <ProviderListRow
              key={provider.providerId}
              provider={provider}
              marketLabel={marketLabel}
              onSaved={onSaved}
              settingsMode={settingsMode}
            />
          ))}
        </div>
      </div>
    </>
  )
}

function MarketPriorityPanel({
  group,
}: {
  group: ProviderCatalogGroup
}) {
  const listS = useListStyles()
  const priorityS = usePriorityStyles()
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)

  const providerMap = useMemo(
    () => new Map(group.providers.map(p => [p.providerId, p])),
    [group.providers],
  )

  const headerMeta = (() => {
    const enabledCount = group.providers.filter(p => p.enabled).length
    return `${group.providers.length} 个数据源 · ${enabledCount} 个已启用 · 按响应速度自动排序`
  })()

  return (
    <>
      <div className={listS.listPanel}>
        <div className={listS.listHeader}>
          <Text className={listS.listHeaderMeta} block>
            {headerMeta}
          </Text>
          <Text className={priorityS.saveHint} block>
            数据来源按响应速度自动排序 · 速度越快越优先
          </Text>
        </div>
        <div
          className={mergeClasses(listS.listScroll, priorityS.dragList, 'opptrix-scroll', 'opptrix-scroll-hover')}
        >
          {group.providers.map((provider, index) => (
            <div
              key={provider.providerId}
              className={mergeClasses(
                priorityS.dragRow,
                hoverIndex === index && priorityS.dragRowHover,
                !provider.enabled && priorityS.dragRowDisabled,
              )}
              onMouseEnter={() => setHoverIndex(index)}
              onMouseLeave={() => setHoverIndex(prev => (prev === index ? null : prev))}
            >
              <span className={priorityS.rankBadge}>{index + 1}</span>
              <div className={priorityS.dragMain}>
                <Text className={priorityS.dragTitle} block title={provider.title}>
                  {provider.title}
                </Text>
                <Text className={priorityS.dragMeta} block>
                  {provider.enabled
                    ? `生效优先级 ${provider.effectivePriority}`
                    : '已停用 · 不参与回退'}
                </Text>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  )
}

export function ProviderPriorityPanels({
  catalog,
}: {
  catalog: ProviderCatalogResponse
}) {
  const listS = useListStyles()
  const priorityS = usePriorityStyles()
  const [marketTab, setMarketTab] = useState(catalog.groups[0]?.marketGroup ?? '')

  useEffect(() => {
    if (!catalog.groups.some(g => g.marketGroup === marketTab)) {
      setMarketTab(catalog.groups[0]?.marketGroup ?? '')
    }
  }, [catalog.groups, marketTab])

  const activeGroup = useMemo(
    () => catalog.groups.find(g => g.marketGroup === marketTab) ?? null,
    [catalog.groups, marketTab],
  )

  if (!catalog.groups.length) {
    return (
      <div className={listS.listPanel}>
        <div className={listS.emptyBlock}>
          <Text className={listS.emptyTitle} block>暂无可用的数据源</Text>
          <Text className={listS.emptyDesc} block>请先在「提供商」中启用数据源。</Text>
        </div>
      </div>
    )
  }

  return (
    <div className={priorityS.priorityRoot}>
      <div className={priorityS.subTabBar}>
        <TabList
          className={priorityS.subTabList}
          size="small"
          selectedValue={marketTab}
          onTabSelect={(_, data) => setMarketTab(String(data.value))}
        >
          {catalog.groups.map(group => (
            <Tab key={group.marketGroup} value={group.marketGroup}>
              {group.label}
            </Tab>
          ))}
        </TabList>
      </div>
      {activeGroup && (
        <MarketPriorityPanel
          key={activeGroup.marketGroup}
          group={activeGroup}
        />
      )}
    </div>
  )
}

export function ProviderCatalogLoading() {
  return <SettingsListPanelSkeleton aria-label="加载数据源…" />
}
