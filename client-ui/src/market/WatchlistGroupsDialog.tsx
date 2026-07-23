import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type MouseEvent } from 'react'
import {
  Checkbox,
  Dialog,
  DialogBody,
  DialogContent,
  DialogSurface,
  DialogTitle,
  Input,
  Text,
  makeStyles,
  mergeClasses,
} from '@fluentui/react-components'
import {
  AddRegular,
  ArrowDownRegular,
  ArrowUpRegular,
  CheckmarkRegular,
  DeleteRegular,
  DismissRegular,
  EditRegular,
} from '@fluentui/react-icons'
import OpptrixButton from '../components/opptrix/OpptrixButton'
import { OpptrixDialogAlert } from '../components/opptrix/OpptrixDialogAlert'
import { opptrixCssVars, opptrixTokens } from '../theme/tokens'
import { ghostInteractive, nativeIconInteractive } from '../theme/mixins'
import type { WatchlistGroup, WatchlistGroupsDocument, WatchlistItem } from '../types/market'
import { resolveDisplayStockName } from './format'
import { watchlistItemKey } from './instrument'

const useStyles = makeStyles({
  body: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    flex: 1,
    minHeight: 0,
    height: '100%',
    overflow: 'hidden',
  },
  columns: {
    display: 'flex',
    gap: '16px',
    minHeight: 0,
    flex: 1,
    '@media (max-width: 640px)': {
      flexDirection: 'column',
    },
  },
  column: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    minHeight: 0,
    minWidth: 0,
  },
  columnLeft: {
    flex: '0 0 240px',
    '@media (max-width: 640px)': {
      flex: '0 0 auto',
      maxHeight: '200px',
    },
  },
  columnRight: {
    flex: 1,
    minHeight: 0,
  },
  sectionTitle: {
    fontSize: 'var(--opptrix-font-sm)',
    fontWeight: 600,
    color: opptrixCssVars.textSecondary,
  },
  groupList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    flex: 1,
    minHeight: 0,
    overflowY: 'auto',
  },
  groupRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    minHeight: '32px',
    padding: '2px 4px',
    borderRadius: opptrixTokens.radiusMd,
    cursor: 'pointer',
    border: 'none',
    backgroundColor: 'transparent',
    width: '100%',
    boxSizing: 'border-box',
    ':hover': {
      backgroundColor: opptrixCssVars.surfaceHover,
    },
  },
  groupRowSelected: {
    backgroundColor: opptrixCssVars.accentSoft,
    ':hover': {
      backgroundColor: opptrixCssVars.accentSoft,
    },
  },
  groupRowEditing: {
    backgroundColor: opptrixCssVars.surfaceHover,
    cursor: 'default',
  },
  groupTitle: {
    flex: 1,
    minWidth: 0,
    fontSize: 'var(--opptrix-font-base)',
    fontWeight: 500,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    textAlign: 'left',
  },
  inlineInput: {
    flex: 1,
    minWidth: 0,
    height: '28px',
    minHeight: '28px',
  },
  rowActions: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '2px',
    flexShrink: 0,
  },
  iconBtn: {
    ...nativeIconInteractive,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '28px',
    height: '28px',
    lineHeight: 0,
    borderRadius: opptrixTokens.radiusMd,
    color: opptrixCssVars.textSecondary,
    border: 'none',
    backgroundColor: 'transparent',
    cursor: 'pointer',
    ':hover': {
      backgroundColor: opptrixCssVars.surfaceHover,
      color: opptrixCssVars.textPrimary,
    },
    ':disabled': {
      opacity: 0.35,
      cursor: 'default',
    },
  },
  iconBtnDanger: {
    ':hover': {
      backgroundColor: opptrixCssVars.errorSoft,
      color: opptrixCssVars.error,
    },
  },
  addBtn: {
    ...ghostInteractive,
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    alignSelf: 'flex-start',
    padding: '4px 8px',
    border: 'none',
    borderRadius: opptrixTokens.radiusMd,
    backgroundColor: 'transparent',
    color: opptrixCssVars.textSecondary,
    fontSize: 'var(--opptrix-font-base)',
    cursor: 'pointer',
    ':hover': {
      backgroundColor: opptrixCssVars.surfaceHover,
      color: opptrixCssVars.textPrimary,
    },
  },
  batchToolbar: {
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
    alignItems: 'stretch',
  },
  batchToolbarRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flexWrap: 'wrap',
  },
  batchPrimary: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
    flexShrink: 0,
  },
  batchToolbarSep: {
    width: '1px',
    height: '16px',
    backgroundColor: opptrixCssVars.separator,
    flexShrink: 0,
    margin: '0 4px',
  },
  batchSelect: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '0',
    marginLeft: 'auto',
  },
  batchSelectBtn: {
    fontSize: 'var(--opptrix-font-sm)',
    fontWeight: 400,
    color: opptrixCssVars.textTertiary,
    minHeight: '28px',
    paddingLeft: '6px',
    paddingRight: '6px',
  },
  batchMeta: {
    color: opptrixCssVars.textTertiary,
    fontSize: 'var(--opptrix-font-sm)',
  },
  itemList: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    flex: 1,
    minHeight: 0,
    overflowY: 'auto',
    borderTop: `1px solid ${opptrixCssVars.separator}`,
    paddingTop: '6px',
  },
  itemRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    height: '36px',
    minHeight: '36px',
    maxHeight: '36px',
    padding: '0 6px',
    borderRadius: opptrixTokens.radiusMd,
    cursor: 'pointer',
    border: 'none',
    backgroundColor: 'transparent',
    width: '100%',
    textAlign: 'left',
    boxSizing: 'border-box',
    overflow: 'hidden',
    ':hover': {
      backgroundColor: opptrixCssVars.surfaceHover,
    },
  },
  itemRowSelected: {
    backgroundColor: opptrixCssVars.accentSoft,
    ':hover': {
      backgroundColor: opptrixCssVars.accentSoft,
    },
  },
  itemCheckbox: {
    flexShrink: 0,
  },
  itemMeta: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    gap: '8px',
    overflow: 'hidden',
  },
  itemIdentity: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    gap: '6px',
    overflow: 'hidden',
  },
  itemName: {
    minWidth: 0,
    flex: '1 1 auto',
    fontSize: 'var(--opptrix-font-base)',
    fontWeight: 500,
    color: opptrixCssVars.textPrimary,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  itemCode: {
    flexShrink: 0,
    fontSize: 'var(--opptrix-font-xs)',
    color: opptrixCssVars.textTertiary,
    whiteSpace: 'nowrap',
  },
  itemTags: {
    display: 'flex',
    flexWrap: 'nowrap',
    alignItems: 'center',
    gap: '4px',
    flexShrink: 0,
    maxWidth: '42%',
    overflow: 'hidden',
  },
  itemTag: {
    display: 'inline-flex',
    alignItems: 'center',
    height: '18px',
    maxWidth: '72px',
    padding: '0 6px',
    borderRadius: opptrixTokens.radiusFull,
    backgroundColor: opptrixCssVars.accentSoft,
    color: opptrixCssVars.accent,
    fontSize: 'var(--opptrix-font-xs)',
    lineHeight: 1,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  itemTagMore: {
    display: 'inline-flex',
    alignItems: 'center',
    height: '18px',
    padding: '0 6px',
    borderRadius: opptrixTokens.radiusFull,
    backgroundColor: opptrixCssVars.surfaceHover,
    color: opptrixCssVars.textTertiary,
    fontSize: 'var(--opptrix-font-xs)',
    lineHeight: 1,
    flexShrink: 0,
    whiteSpace: 'nowrap',
  },
  emptyHint: {
    fontSize: 'var(--opptrix-font-md)',
    color: opptrixCssVars.textTertiary,
    lineHeight: 1.45,
    padding: '8px 4px',
  },
  deleteConfirm: {
    fontSize: 'var(--opptrix-font-base)',
    color: opptrixCssVars.textSecondary,
    lineHeight: 1.45,
  },
})

interface Props {
  open: boolean
  items: WatchlistItem[]
  doc: WatchlistGroupsDocument
  onClose: () => void
  onSave: (doc: WatchlistGroupsDocument) => Promise<void>
}

function sortGroups(groups: WatchlistGroup[]): WatchlistGroup[] {
  return groups.slice().sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title, 'zh-CN'))
}

export default function WatchlistGroupsDialog({ open, items, doc, onClose, onSave }: Props) {
  const s = useStyles()
  const [draft, setDraft] = useState<WatchlistGroupsDocument>(doc)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editTitle, setEditTitle] = useState('')
  const [creating, setCreating] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [selectedItemKeys, setSelectedItemKeys] = useState<Set<string>>(new Set())
  /** 左侧当前编辑分组：加入/移出作用于此 */
  const [activeGroupId, setActiveGroupId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<WatchlistGroup | null>(null)
  const prevOpenRef = useRef(false)
  const docRef = useRef(doc)
  docRef.current = doc
  const draftRef = useRef(draft)
  draftRef.current = draft

  // 仅在关→开时用最新 doc 初始化；open 期间 doc 变化（含即时 onSave 回写）不得冲掉 draft / 勾选
  useEffect(() => {
    const justOpened = open && !prevOpenRef.current
    prevOpenRef.current = open
    if (!justOpened) return
    const latest = docRef.current
    const nextDraft = {
      groups: sortGroups(latest.groups),
      membership: { ...latest.membership },
    }
    draftRef.current = nextDraft
    setDraft(nextDraft)
    setEditingId(null)
    setCreating(false)
    setNewTitle('')
    setSelectedItemKeys(new Set())
    setActiveGroupId(latest.groups[0]?.id ?? null)
    setDeleteTarget(null)
  }, [open])

  const sortedGroups = useMemo(() => sortGroups(draft.groups), [draft.groups])
  const activeGroup = useMemo(
    () => sortedGroups.find(g => g.id === activeGroupId) ?? null,
    [activeGroupId, sortedGroups],
  )
  const canBatchMembership = Boolean(activeGroupId) && selectedItemKeys.size > 0

  const toPersistableDoc = useCallback((next: WatchlistGroupsDocument): WatchlistGroupsDocument => ({
    groups: sortGroups(next.groups).map((g, i) => ({ ...g, sortOrder: i })),
    membership: next.membership,
  }), [])

  const setItemSelected = useCallback((key: string, selected: boolean) => {
    setSelectedItemKeys(prev => {
      const has = prev.has(key)
      if (selected === has) return prev
      const next = new Set(prev)
      if (selected) next.add(key)
      else next.delete(key)
      return next
    })
  }, [])

  const toggleItem = useCallback((key: string) => {
    setSelectedItemKeys(prev => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  const selectAllItems = useCallback(() => {
    setSelectedItemKeys(new Set(items.map(item => watchlistItemKey(item))))
  }, [items])

  const clearSelectedItems = useCallback(() => {
    setSelectedItemKeys(new Set())
  }, [])

  const startEdit = useCallback((group: WatchlistGroup) => {
    setEditingId(group.id)
    setEditTitle(group.title)
    setCreating(false)
  }, [])

  const commitEdit = useCallback(async () => {
    if (!editingId) return
    const trimmed = editTitle.trim()
    if (!trimmed) return
    const id = editingId
    setEditingId(null)
    setEditTitle('')
    const prev = draftRef.current
    const nextDoc: WatchlistGroupsDocument = {
      ...prev,
      groups: prev.groups.map(g => g.id === id ? { ...g, title: trimmed } : g),
    }
    draftRef.current = nextDoc
    setDraft(nextDoc)
    await onSave(toPersistableDoc(nextDoc))
  }, [editTitle, editingId, onSave, toPersistableDoc])

  const cancelEdit = useCallback(() => {
    setEditingId(null)
    setEditTitle('')
  }, [])

  const addGroup = useCallback(async () => {
    const trimmed = newTitle.trim()
    if (!trimmed) return
    const prev = draftRef.current
    const group: WatchlistGroup = {
      id: crypto.randomUUID(),
      title: trimmed,
      sortOrder: prev.groups.length,
      createdAt: new Date().toISOString(),
    }
    const nextDoc: WatchlistGroupsDocument = {
      ...prev,
      groups: [...prev.groups, group],
    }
    draftRef.current = nextDoc
    setDraft(nextDoc)
    setActiveGroupId(group.id)
    setCreating(false)
    setNewTitle('')
    await onSave(toPersistableDoc(nextDoc))
  }, [newTitle, onSave, toPersistableDoc])

  const moveGroup = useCallback(async (id: string, direction: 'up' | 'down') => {
    const prev = draftRef.current
    const sorted = sortGroups(prev.groups)
    const index = sorted.findIndex(g => g.id === id)
    if (index < 0) return
    const nextIndex = direction === 'up' ? index - 1 : index + 1
    if (nextIndex < 0 || nextIndex >= sorted.length) return
    const copy = sorted.slice()
    const [row] = copy.splice(index, 1)
    if (!row) return
    copy.splice(nextIndex, 0, row)
    const nextDoc: WatchlistGroupsDocument = {
      ...prev,
      groups: copy.map((g, i) => ({ ...g, sortOrder: i })),
    }
    draftRef.current = nextDoc
    setDraft(nextDoc)
    await onSave(toPersistableDoc(nextDoc))
  }, [onSave, toPersistableDoc])

  const confirmDeleteGroup = useCallback(async () => {
    if (!deleteTarget) return
    const id = deleteTarget.id
    const prev = draftRef.current
    const nextMembership: Record<string, string[]> = {}
    for (const [itemKey, groupIds] of Object.entries(prev.membership)) {
      const filtered = groupIds.filter(gid => gid !== id)
      if (filtered.length) nextMembership[itemKey] = filtered
    }
    const nextDoc: WatchlistGroupsDocument = {
      groups: prev.groups.filter(g => g.id !== id),
      membership: nextMembership,
    }
    draftRef.current = nextDoc
    setDraft(nextDoc)
    if (activeGroupId === id) {
      setActiveGroupId(nextDoc.groups[0]?.id ?? null)
    }
    setDeleteTarget(null)
    await onSave(toPersistableDoc(nextDoc))
  }, [activeGroupId, deleteTarget, onSave, toPersistableDoc])

  const batchAddToGroup = useCallback(async () => {
    if (!activeGroupId || selectedItemKeys.size === 0) return
    const prev = draftRef.current
    const nextMembership = { ...prev.membership }
    for (const itemKey of selectedItemKeys) {
      const current = nextMembership[itemKey] ?? []
      if (!current.includes(activeGroupId)) {
        nextMembership[itemKey] = [...current, activeGroupId]
      }
    }
    const nextDoc: WatchlistGroupsDocument = { ...prev, membership: nextMembership }
    draftRef.current = nextDoc
    setDraft(nextDoc)
    await onSave(toPersistableDoc(nextDoc))
  }, [activeGroupId, onSave, selectedItemKeys, toPersistableDoc])

  const batchRemoveFromGroup = useCallback(async () => {
    if (!activeGroupId || selectedItemKeys.size === 0) return
    const prev = draftRef.current
    const nextMembership = { ...prev.membership }
    for (const itemKey of selectedItemKeys) {
      const current = nextMembership[itemKey]
      if (!current?.includes(activeGroupId)) continue
      const filtered = current.filter(gid => gid !== activeGroupId)
      if (filtered.length) nextMembership[itemKey] = filtered
      else delete nextMembership[itemKey]
    }
    const nextDoc: WatchlistGroupsDocument = { ...prev, membership: nextMembership }
    draftRef.current = nextDoc
    setDraft(nextDoc)
    await onSave(toPersistableDoc(nextDoc))
  }, [activeGroupId, onSave, selectedItemKeys, toPersistableDoc])
  const onItemRowKeyDown = useCallback((e: KeyboardEvent<HTMLDivElement>, key: string) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      toggleItem(key)
    }
  }, [toggleItem])

  const onCheckboxClick = useCallback((e: MouseEvent) => {
    // 避免与整行 onClick 双触发
    e.stopPropagation()
  }, [])

  const stopRowClick = useCallback((e: MouseEvent) => {
    e.stopPropagation()
  }, [])

  const batchMetaText = !activeGroup
    ? '先在左侧选择分组'
    : selectedItemKeys.size === 0
      ? `当前：${activeGroup.title} · 勾选关注后加入或移出`
      : `当前：${activeGroup.title} · 已选 ${selectedItemKeys.size} 项`

  return (
    <>
      <Dialog
        open={open}
        modalType="modal"
        onOpenChange={(_, data) => {
          if (!data.open) onClose()
        }}
      >
        <DialogSurface className="opptrix-glass-dialog-surface opptrix-watchlist-groups-dialog">
          <DialogBody>
            <DialogTitle>管理关注分组</DialogTitle>
            <DialogContent className={s.body}>
              <div className={s.columns}>
                <div className={mergeClasses(s.column, s.columnLeft)}>
                  <Text className={s.sectionTitle}>我的分组</Text>
                  <div className={mergeClasses(s.groupList, 'opptrix-scroll')}>
                    {sortedGroups.length === 0 && !creating && (
                      <Text className={s.emptyHint} block>
                        还没有自定义分组{'\n'}新建分组后，可把已有关注加入其中
                      </Text>
                    )}
                    {sortedGroups.map((group, index) => (
                      <div
                        key={group.id}
                        className={mergeClasses(
                          s.groupRow,
                          editingId === group.id && s.groupRowEditing,
                          editingId !== group.id && activeGroupId === group.id && s.groupRowSelected,
                        )}
                        role={editingId === group.id ? undefined : 'button'}
                        tabIndex={editingId === group.id ? undefined : 0}
                        aria-pressed={editingId === group.id ? undefined : activeGroupId === group.id}
                        onClick={() => {
                          if (editingId === group.id) return
                          setActiveGroupId(group.id)
                        }}
                        onKeyDown={e => {
                          if (editingId === group.id) return
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            setActiveGroupId(group.id)
                          }
                        }}
                      >
                        {editingId === group.id ? (
                          <>
                            <Input
                              className={s.inlineInput}
                              size="small"
                              appearance="filled-darker"
                              value={editTitle}
                              onChange={(_, data) => setEditTitle(data.value)}
                              onClick={stopRowClick}
                              onKeyDown={e => {
                                e.stopPropagation()
                                if (e.key === 'Enter') void commitEdit()
                                if (e.key === 'Escape') cancelEdit()
                              }}
                              autoFocus
                            />
                            <div className={s.rowActions} onClick={stopRowClick}>
                              <button type="button" className={s.iconBtn} aria-label="保存名称" onClick={() => { void commitEdit() }}>
                                <CheckmarkRegular fontSize={14} />
                              </button>
                              <button type="button" className={s.iconBtn} aria-label="取消编辑" onClick={cancelEdit}>
                                <DismissRegular fontSize={14} />
                              </button>
                            </div>
                          </>
                        ) : (
                          <>
                            <span className={s.groupTitle}>{group.title}</span>
                            <div className={s.rowActions} onClick={stopRowClick}>
                              <button
                                type="button"
                                className={s.iconBtn}
                                aria-label="上移"
                                disabled={index === 0}
                                onClick={() => { void moveGroup(group.id, 'up') }}
                              >
                                <ArrowUpRegular fontSize={14} />
                              </button>
                              <button
                                type="button"
                                className={s.iconBtn}
                                aria-label="下移"
                                disabled={index === sortedGroups.length - 1}
                                onClick={() => { void moveGroup(group.id, 'down') }}
                              >
                                <ArrowDownRegular fontSize={14} />
                              </button>
                              <button
                                type="button"
                                className={s.iconBtn}
                                aria-label="重命名"
                                onClick={() => startEdit(group)}
                              >
                                <EditRegular fontSize={14} />
                              </button>
                              <button
                                type="button"
                                className={mergeClasses(s.iconBtn, s.iconBtnDanger)}
                                aria-label="删除分组"
                                onClick={() => setDeleteTarget(group)}
                              >
                                <DeleteRegular fontSize={14} />
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    ))}
                    {creating && (
                      <div className={mergeClasses(s.groupRow, s.groupRowEditing)}>
                        <Input
                          className={s.inlineInput}
                          size="small"
                          appearance="filled-darker"
                          placeholder="分组名称"
                          value={newTitle}
                          onChange={(_, data) => setNewTitle(data.value)}
                          onKeyDown={e => {
                            if (e.key === 'Enter') void addGroup()
                            if (e.key === 'Escape') { setCreating(false); setNewTitle('') }
                          }}
                          autoFocus
                        />
                        <div className={s.rowActions}>
                          <button type="button" className={s.iconBtn} aria-label="创建分组" onClick={() => { void addGroup() }}>
                            <CheckmarkRegular fontSize={14} />
                          </button>
                          <button
                            type="button"
                            className={s.iconBtn}
                            aria-label="取消"
                            onClick={() => { setCreating(false); setNewTitle('') }}
                          >
                            <DismissRegular fontSize={14} />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                  {!creating && (
                    <button type="button" className={s.addBtn} onClick={() => setCreating(true)}>
                      <AddRegular fontSize={14} />
                      新建分组
                    </button>
                  )}
                </div>

                <div className={mergeClasses(s.column, s.columnRight)}>
                  <Text className={s.sectionTitle}>关注列表</Text>
                  {sortedGroups.length === 0 ? (
                    <Text className={s.emptyHint} block>
                      先创建分组，再勾选关注并加入
                    </Text>
                  ) : (
                    <>
                      <div className={s.batchToolbar}>
                        <div className={s.batchToolbarRow}>
                          <div className={s.batchPrimary}>
                            <OpptrixButton
                              variant="primary"
                              size="small"
                              disabled={!canBatchMembership}
                              onClick={() => { void batchAddToGroup() }}
                            >
                              加入此分组
                            </OpptrixButton>
                            <OpptrixButton
                              variant="secondary"
                              size="small"
                              disabled={!canBatchMembership}
                              onClick={() => { void batchRemoveFromGroup() }}
                            >
                              移出此分组
                            </OpptrixButton>
                          </div>
                          <div className={s.batchToolbarSep} aria-hidden />
                          <div className={s.batchSelect}>
                            <OpptrixButton
                              variant="ghost"
                              size="small"
                              className={s.batchSelectBtn}
                              onClick={selectAllItems}
                            >
                              全选
                            </OpptrixButton>
                            <OpptrixButton
                              variant="ghost"
                              size="small"
                              className={s.batchSelectBtn}
                              onClick={clearSelectedItems}
                            >
                              取消选择
                            </OpptrixButton>
                          </div>
                        </div>
                        <span className={s.batchMeta}>{batchMetaText}</span>
                      </div>
                      <div className={mergeClasses(s.itemList, 'opptrix-scroll')}>
                        {items.length === 0 ? (
                          <Text className={s.emptyHint} block>
                            还没有关注的标的{'\n'}添加关注后，可在这里批量归入分组
                          </Text>
                        ) : items.map(item => {
                          const key = watchlistItemKey(item)
                          const checked = selectedItemKeys.has(key)
                          const groupTags = (draft.membership[key] ?? [])
                            .map(id => {
                              const title = sortedGroups.find(g => g.id === id)?.title
                              return title ? { id, title } : null
                            })
                            .filter((tag): tag is { id: string; title: string } => tag != null)
                          const visibleTags = groupTags.slice(0, 2)
                          const extraTagCount = groupTags.length - visibleTags.length
                          const tagsTitle = groupTags.length > 0
                            ? groupTags.map(tag => tag.title).join('、')
                            : undefined
                          return (
                            <div
                              key={key}
                              className={mergeClasses(s.itemRow, checked && s.itemRowSelected)}
                              role="checkbox"
                              aria-checked={checked}
                              tabIndex={0}
                              title={tagsTitle}
                              onClick={() => toggleItem(key)}
                              onKeyDown={e => onItemRowKeyDown(e, key)}
                            >
                              <Checkbox
                                className={mergeClasses(s.itemCheckbox, 'opptrix-watchlist-groups-checkbox')}
                                checked={checked}
                                onClick={onCheckboxClick}
                                onChange={(_, data) => setItemSelected(key, !!data.checked)}
                              />
                              <div className={s.itemMeta}>
                                <div className={s.itemIdentity}>
                                  <span className={s.itemName}>
                                    {resolveDisplayStockName(item.code, undefined, undefined, item.name)}
                                  </span>
                                  <span className={s.itemCode}>{item.code}</span>
                                </div>
                                {groupTags.length > 0 && (
                                  <div className={s.itemTags}>
                                    {visibleTags.map(tag => (
                                      <span key={tag.id} className={s.itemTag}>{tag.title}</span>
                                    ))}
                                    {extraTagCount > 0 && (
                                      <span className={s.itemTagMore}>+{extraTagCount}</span>
                                    )}
                                  </div>
                                )}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </>
                  )}
                </div>
              </div>
            </DialogContent>
          </DialogBody>
        </DialogSurface>
      </Dialog>

      {deleteTarget && (
        <OpptrixDialogAlert
          open
          title="删除这个分组？"
          message={(
            <span className={s.deleteConfirm}>
              分组「{deleteTarget.title}」将被删除，其中的关注仍会保留在「全部」列表。
            </span>
          )}
          confirmLabel="删除分组"
          confirmTone="danger"
          onConfirm={() => { void confirmDeleteGroup() }}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </>
  )
}
