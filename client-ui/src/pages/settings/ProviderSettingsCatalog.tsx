import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import {
  Spinner,
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
  ReOrderRegular,
} from '@fluentui/react-icons'
import type { ProviderCatalogGroup, ProviderCatalogResponse, PublicProviderRuntime } from '../../types/provider'
import {
  getProviderCatalog,
  reorderProviderCatalog,
  saveProviderConfig,
  testProviderConfig,
} from '../../api/client'
import { SettingsCredentialRow } from './SettingsPrimitives'
import { useSettingsToast } from './SettingsToast'
import { opptrixTokens, opptrixCssVars } from '../../theme/tokens'
import { motion } from '../../theme/mixins'

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

function reorderIds(ids: string[], from: number, to: number): string[] {
  if (from === to || from < 0 || to < 0 || from >= ids.length || to >= ids.length) return ids
  const next = [...ids]
  const [moved] = next.splice(from, 1)
  if (!moved) return ids
  next.splice(to, 0, moved)
  return next
}

function resolveDropIndex(listEl: HTMLElement, clientY: number): number {
  const rows = listEl.querySelectorAll<HTMLElement>('[data-sort-row="1"]')
  if (!rows.length) return 0
  for (const row of rows) {
    const index = Number(row.dataset.sortIndex)
    if (Number.isNaN(index)) continue
    const rect = row.getBoundingClientRect()
    if (clientY < rect.top + rect.height / 2) return index
  }
  const last = rows[rows.length - 1]!
  const lastIndex = Number(last.dataset.sortIndex)
  return Number.isNaN(lastIndex) ? rows.length - 1 : lastIndex
}

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
  const secretField = provider.settingsFields.find(f => f.type === 'secret')
  if (secretField) {
    parts.push(provider.secretsConfigured[secretField.key] ? '密钥已配置' : '尚未配置密钥')
  }
  return parts.join(' · ')
}

function ProviderCredentialExpand({
  provider,
  onSaved,
}: {
  provider: PublicProviderRuntime
  onSaved: () => void
}) {
  const toast = useSettingsToast()
  const [token, setToken] = useState('')
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)

  const tokenField = provider.settingsFields.find(f => f.type === 'secret')
  if (!tokenField) return null

  const tokenConfigured = provider.secretsConfigured[tokenField.key]

  const buildExtra = () => {
    const trimmed = token.trim()
    if (!trimmed) return undefined
    return { [tokenField.key]: trimmed }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await saveProviderConfig(provider.providerId, { extra: buildExtra() })
      toast.showSuccess('密钥已保存')
      setToken('')
      onSaved()
    } catch (e) {
      toast.showError(e instanceof Error ? e.message : '保存失败')
    } finally {
      setSaving(false)
    }
  }

  const handleTest = async () => {
    if (!provider.supportsTest) return
    setTesting(true)
    try {
      const resp = await testProviderConfig(provider.providerId, buildExtra())
      const result = resp.data
      if (result?.ok) toast.showSuccess(result.message)
      else toast.showError(`测试失败：${result?.message ?? '未知错误'}`)
    } catch (e) {
      toast.showError(e instanceof Error ? e.message : '测试连接失败')
    } finally {
      setTesting(false)
    }
  }

  return (
    <SettingsCredentialRow
      value={token}
      onChange={setToken}
      placeholder={tokenField.placeholder ?? '粘贴 API Key 或 Token'}
      testing={testing}
      saving={saving}
      testDisabled={!provider.supportsTest}
      saveDisabled={!token.trim() && !tokenConfigured}
      onTest={() => { void handleTest() }}
      onSave={() => { void handleSave() }}
    />
  )
}

function ProviderListRow({
  provider,
  marketLabel,
  onSaved,
}: {
  provider: PublicProviderRuntime
  marketLabel: string
  onSaved: () => void
}) {
  const s = useListStyles()
  const toast = useSettingsToast()
  const [expanded, setExpanded] = useState(false)
  const [toggling, setToggling] = useState(false)

  const secretField = provider.settingsFields.find(f => f.type === 'secret')
  const hasCredential = secretField != null

  const handleToggleEnabled = async (checked: boolean) => {
    if (checked && !provider.canEnable) {
      toast.showError('请先配置 API Key 后再启用')
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
    <div className={mergeClasses(s.listRow, expanded && hasCredential && s.listRowExpanded)}>
      <div className={s.listRowTop}>
        <div className={s.listRowMain}>
          <Text className={s.listRowTitle} block title={provider.title}>{provider.title}</Text>
          <Text className={s.listRowMeta} block>
            {providerStatusMeta(provider, marketLabel)}
          </Text>
          {hasCredential && (
            <button
              type="button"
              className={mergeClasses(s.urlToggle, 'opptrix-focusable')}
              aria-expanded={expanded}
              onClick={() => setExpanded(v => !v)}
            >
              {expanded
                ? <ChevronDownRegular fontSize={11} />
                : <ChevronRightRegular fontSize={11} />}
              <span>{expanded ? '收起密钥设置' : '配置 API Key'}</span>
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
      {expanded && hasCredential && (
        <div className={s.credentialExpand}>
          <ProviderCredentialExpand provider={provider} onSaved={onSaved} />
        </div>
      )}
    </div>
  )
}

export function ProviderCatalogListPanel({
  catalog,
  onSaved,
}: {
  catalog: ProviderCatalogResponse
  onSaved: () => void
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
    <div className={s.listPanel}>
      <div className={s.listHeader}>
        <Text className={s.listHeaderMeta} block>
          {enabledCount > 0
            ? `已启用 ${enabledCount} / ${allProviders.length} 个数据源`
            : '配置 API Key 并启用数据源，即可获取对应市场行情'}
        </Text>
      </div>
      <div className={mergeClasses(s.listScroll, 'opptrix-scroll', 'opptrix-scroll-hover')}>
        {allProviders.map(({ provider, marketLabel }) => (
          <ProviderListRow
            key={provider.providerId}
            provider={provider}
            marketLabel={marketLabel}
            onSaved={onSaved}
          />
        ))}
      </div>
    </div>
  )
}

type SaveState = 'idle' | 'saving' | 'saved'

function MarketPriorityPanel({
  group,
  onReordered,
}: {
  group: ProviderCatalogGroup
  onReordered: (catalog: ProviderCatalogResponse) => void
}) {
  const listS = useListStyles()
  const priorityS = usePriorityStyles()
  const toast = useSettingsToast()
  const listRef = useRef<HTMLDivElement>(null)
  const [order, setOrder] = useState<string[]>(() => group.providers.map(p => p.providerId))
  const [saveState, setSaveState] = useState<SaveState>('idle')
  const [hoverIndex, setHoverIndex] = useState<number | null>(null)
  const [dragging, setDragging] = useState<{
    providerId: string
    fromIndex: number
    offsetX: number
    offsetY: number
    x: number
    y: number
    width: number
  } | null>(null)
  const [dropIndex, setDropIndex] = useState<number | null>(null)
  const [dropLineTop, setDropLineTop] = useState<number | null>(null)

  const saving = saveState === 'saving'
  const providerMap = useMemo(
    () => new Map(group.providers.map(p => [p.providerId, p])),
    [group.providers],
  )

  useEffect(() => {
    setOrder(group.providers.map(p => p.providerId))
  }, [group.providers])

  useEffect(() => {
    if (saveState !== 'saved') return
    const timer = window.setTimeout(() => setSaveState('idle'), 1800)
    return () => window.clearTimeout(timer)
  }, [saveState])

  const updateDropIndicator = useCallback((clientY: number) => {
    const listEl = listRef.current
    if (!listEl) return
    const rows = listEl.querySelectorAll<HTMLElement>('[data-sort-row="1"]')
    const listRect = listEl.getBoundingClientRect()
    if (!rows.length) return

    for (const row of rows) {
      const index = Number(row.dataset.sortIndex)
      if (Number.isNaN(index)) continue
      const rect = row.getBoundingClientRect()
      const mid = rect.top + rect.height / 2
      if (clientY < mid) {
        setDropIndex(index)
        setDropLineTop(rect.top - listRect.top - 1)
        return
      }
    }

    const last = rows[rows.length - 1]!
    const lastIndex = Number(last.dataset.sortIndex)
    const lastRect = last.getBoundingClientRect()
    setDropIndex(Number.isNaN(lastIndex) ? rows.length - 1 : lastIndex)
    setDropLineTop(lastRect.bottom - listRect.top)
  }, [])

  const commitOrder = useCallback(async (nextOrder: string[]) => {
    setSaveState('saving')
    try {
      const catalog = await reorderProviderCatalog(group.marketGroup, nextOrder)
      onReordered(catalog)
      setSaveState('saved')
    } catch (e) {
      toast.showError(e instanceof Error ? e.message : '保存优先级失败')
      setOrder(group.providers.map(p => p.providerId))
      setSaveState('idle')
    }
  }, [group.marketGroup, group.providers, onReordered, toast])

  const orderRef = useRef(order)
  orderRef.current = order

  useEffect(() => {
    if (!dragging) return

    const fromIndex = dragging.fromIndex

    const handleMove = (e: PointerEvent) => {
      setDragging(prev => prev ? { ...prev, x: e.clientX, y: e.clientY } : prev)
      updateDropIndicator(e.clientY)
    }

    const handleUp = (e: PointerEvent) => {
      const listEl = listRef.current
      const nextDrop = listEl ? resolveDropIndex(listEl, e.clientY) : fromIndex
      setDragging(null)
      setDropIndex(null)
      setDropLineTop(null)
      if (nextDrop !== fromIndex) {
        const next = reorderIds(orderRef.current, fromIndex, nextDrop)
        setOrder(next)
        void commitOrder(next)
      }
    }

    window.addEventListener('pointermove', handleMove)
    window.addEventListener('pointerup', handleUp)
    window.addEventListener('pointercancel', handleUp)
    return () => {
      window.removeEventListener('pointermove', handleMove)
      window.removeEventListener('pointerup', handleUp)
      window.removeEventListener('pointercancel', handleUp)
    }
  }, [dragging, commitOrder, updateDropIndicator])

  const handleMoveBy = (index: number, direction: -1 | 1) => {
    const target = index + direction
    if (target < 0 || target >= order.length || saving || dragging) return
    const next = reorderIds(order, index, target)
    setOrder(next)
    void commitOrder(next)
  }

  const handleDragStart = (index: number, providerId: string, e: ReactPointerEvent<HTMLSpanElement>) => {
    if (saving) return
    const row = (e.currentTarget as HTMLElement).closest('[data-sort-row]') as HTMLElement | null
    if (!row) return
    const rect = row.getBoundingClientRect()
    e.currentTarget.setPointerCapture(e.pointerId)
    e.preventDefault()
    setDragging({
      providerId,
      fromIndex: index,
      offsetX: e.clientX - rect.left,
      offsetY: e.clientY - rect.top,
      x: e.clientX,
      y: e.clientY,
      width: rect.width,
    })
    setDropIndex(index)
    setDropLineTop(null)
  }

  const headerMeta = (() => {
    const enabledCount = group.providers.filter(p => p.enabled).length
    const base = `${group.providers.length} 个数据源 · ${enabledCount} 个已启用 · 越靠上越优先`
    if (saveState === 'saving') return `${base} · 保存中…`
    if (saveState === 'saved') return `${base} · 已保存`
    return base
  })()

  const draggedProvider = dragging ? providerMap.get(dragging.providerId) : null
  const showDropLine = dragging != null && dropIndex != null && dropIndex !== dragging.fromIndex && dropLineTop != null

  return (
    <>
      <div className={listS.listPanel}>
        <div className={listS.listHeader}>
          <Text className={listS.listHeaderMeta} block>
            {headerMeta}
          </Text>
          <Text
            className={mergeClasses(priorityS.saveHint, saveState !== 'idle' && priorityS.saveHintActive)}
            block
          >
            拖动手柄或使用箭头调整顺序
          </Text>
        </div>
        <div
          ref={listRef}
          className={mergeClasses(listS.listScroll, priorityS.dragList, 'opptrix-scroll', 'opptrix-scroll-hover')}
        >
          {showDropLine && (
            <div className={priorityS.dropLine} style={{ top: dropLineTop }} aria-hidden />
          )}
          {order.map((providerId, index) => {
            const provider = providerMap.get(providerId)
            if (!provider) return null
            const isDraggingRow = dragging?.fromIndex === index
            if (isDraggingRow) {
              return (
                <div
                  key={`${providerId}-placeholder`}
                  className={priorityS.dragRowPlaceholder}
                  data-sort-row="0"
                  data-sort-index={String(index)}
                  aria-hidden
                />
              )
            }
            return (
              <div
                key={providerId}
                data-sort-row="1"
                data-sort-index={String(index)}
                data-provider-id={providerId}
                className={mergeClasses(
                  priorityS.dragRow,
                  hoverIndex === index && priorityS.dragRowHover,
                  !provider.enabled && priorityS.dragRowDisabled,
                )}
                onMouseEnter={() => setHoverIndex(index)}
                onMouseLeave={() => setHoverIndex(prev => (prev === index ? null : prev))}
              >
                <span
                  className={mergeClasses(priorityS.dragHandle, 'opptrix-focusable')}
                  role="button"
                  tabIndex={0}
                  aria-label={`拖动 ${provider.title} 调整顺序`}
                  onPointerDown={e => handleDragStart(index, providerId, e)}
                >
                  <ReOrderRegular fontSize={16} />
                </span>
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
                <div className={priorityS.moveControls}>
                  <button
                    type="button"
                    className={mergeClasses(priorityS.moveBtn, 'opptrix-focusable')}
                    aria-label={`上移 ${provider.title}`}
                    disabled={index === 0 || saving || dragging != null}
                    onClick={() => handleMoveBy(index, -1)}
                  >
                    <ChevronUpRegular fontSize={12} />
                  </button>
                  <button
                    type="button"
                    className={mergeClasses(priorityS.moveBtn, 'opptrix-focusable')}
                    aria-label={`下移 ${provider.title}`}
                    disabled={index >= order.length - 1 || saving || dragging != null}
                    onClick={() => handleMoveBy(index, 1)}
                  >
                    <ChevronDownRegular fontSize={12} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {dragging && draggedProvider && (
        <div
          className={priorityS.floatPreview}
          style={{
            left: dragging.x - dragging.offsetX,
            top: dragging.y - dragging.offsetY,
            width: dragging.width,
          }}
          aria-hidden
        >
          <span className={priorityS.dragHandle}>
            <ReOrderRegular fontSize={16} />
          </span>
          <span className={priorityS.rankBadge}>{dragging.fromIndex + 1}</span>
          <div className={priorityS.dragMain}>
            <Text className={priorityS.dragTitle} block>{draggedProvider.title}</Text>
            <Text className={priorityS.dragMeta} block>
              {draggedProvider.enabled ? '拖动至目标位置后松开' : '已停用'}
            </Text>
          </div>
        </div>
      )}
    </>
  )
}

export function ProviderPriorityPanels({
  catalog,
  onReordered,
}: {
  catalog: ProviderCatalogResponse
  onReordered: (catalog: ProviderCatalogResponse) => void
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
          <Text className={listS.emptyTitle} block>暂无可排序的数据源</Text>
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
          onReordered={onReordered}
        />
      )}
    </div>
  )
}

export function ProviderCatalogLoading() {
  return <Spinner size="tiny" label="加载数据源…" />
}
