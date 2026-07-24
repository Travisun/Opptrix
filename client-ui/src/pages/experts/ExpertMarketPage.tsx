import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  Input,
  Spinner,
  Text,
  makeStyles,
  mergeClasses,
} from '@fluentui/react-components'
import {
  AddRegular,
  ArrowSyncRegular,
  DeleteRegular,
  EditRegular,
  MoreHorizontalRegular,
  SearchRegular,
} from '@fluentui/react-icons'
import { electronPlatform } from '../../platform/detect'
import { opptrixTokens, opptrixCssVars } from '../../theme/tokens'
import { OPPTRIX_GLASS_PANEL_CLASS } from '../../theme/mixins'
import {
  DESKTOP_SIDEBAR_TOOL_ICON_PADDING,
  DESKTOP_SIDEBAR_TOOL_ICON_SIZE,
  DESKTOP_TITLEBAR_HEIGHT,
} from '../../desktop/constants'
import ChromeToolButton from '../../desktop/ChromeToolButton'
import OpptrixButton from '../../components/opptrix/OpptrixButton'
import OpptrixSegmentedControl from '../../components/opptrix/OpptrixSegmentedControl'
import { useOpptrixDialogAlert } from '../../components/opptrix/OpptrixDialogAlert'
import { deleteExpert, listExperts } from '../../api/client'
import type { ExpertCatalogEntry, ExpertDefinition } from '../../types/chat'
import ExpertIconTile from './ExpertIconTile'
import CreateExpertDialog from './CreateExpertDialog'

const SHADOW_CARD = '0 1px 2px rgba(26, 26, 26, 0.04), 0 4px 12px rgba(26, 26, 26, 0.06)'

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
    minWidth: 0,
    minHeight: 0,
    height: '100%',
    backgroundColor: opptrixCssVars.canvas,
    overflow: 'hidden',
  },
  electronTitleBar: {
    flexShrink: 0,
    height: `${DESKTOP_TITLEBAR_HEIGHT}px`,
    boxSizing: 'border-box',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    paddingLeft: '12px',
    borderBottom: `1px solid ${opptrixCssVars.separatorStrong}`,
    backgroundColor: opptrixCssVars.canvas,
  },
  electronTitleBarMac: { paddingRight: '12px' },
  electronTitleBarWin: { paddingRight: '132px' },
  titleBarSpacer: { flex: 1, minWidth: 0 },
  titleBarPageTitle: {
    fontSize: 'var(--opptrix-font-base)',
    fontWeight: 500,
    letterSpacing: '-0.01em',
    color: opptrixCssVars.textPrimary,
    flexShrink: 0,
    whiteSpace: 'nowrap',
  },
  titleBarActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    flexShrink: 0,
  },
  webHead: {
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '10px 16px',
    borderBottom: `1px solid ${opptrixCssVars.separatorStrong}`,
  },
  webTitle: {
    fontSize: 'var(--opptrix-font-xl)',
    fontWeight: 650,
    color: opptrixCssVars.textPrimary,
    flex: 1,
  },
  webActions: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    flexShrink: 0,
  },
  scrollBody: {
    flex: 1,
    minHeight: 0,
    overflowY: 'auto',
  },
  content: {
    maxWidth: '920px',
    marginLeft: 'auto',
    marginRight: 'auto',
    padding: '20px 24px 32px',
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
  },
  pageHeader: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  pageTitle: {
    fontSize: 'var(--opptrix-font-2xl)',
    fontWeight: 700,
    letterSpacing: '-0.02em',
    color: opptrixCssVars.textPrimary,
  },
  pageSubtitle: {
    fontSize: 'var(--opptrix-font-sm)',
    color: opptrixCssVars.textSecondary,
    lineHeight: 1.6,
  },
  toolRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  searchField: {
    flex: 1,
    minWidth: 0,
  },
  searchInput: {
    width: '100%',
  },
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  sectionTitle: {
    fontSize: 'var(--opptrix-font-sm)',
    fontWeight: 600,
    color: opptrixCssVars.textSecondary,
    letterSpacing: '0.01em',
  },
  myExpertsRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    overflowX: 'auto',
    paddingBottom: '4px',
  },
  myExpertItem: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '6px',
    minWidth: '72px',
    maxWidth: '88px',
    padding: 0,
    border: 'none',
    background: 'transparent',
    cursor: 'pointer',
    textAlign: 'center',
  },
  myExpertLabel: {
    fontSize: 'var(--opptrix-font-xs)',
    color: opptrixCssVars.textSecondary,
    lineHeight: 1.35,
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
  },
  addTile: {
    width: '56px',
    height: '56px',
    borderRadius: '14px',
    border: `1px dashed ${opptrixCssVars.separatorStrong}`,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: opptrixCssVars.textTertiary,
    backgroundColor: opptrixCssVars.surfaceMuted,
    flexShrink: 0,
  },
  myEmpty: {
    fontSize: 'var(--opptrix-font-sm)',
    color: opptrixCssVars.textTertiary,
    lineHeight: 1.6,
  },
  tabRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
  },
  list: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(340px, 1fr))',
    gap: '12px',
    '@media (max-width: 720px)': {
      gridTemplateColumns: '1fr',
    },
  },
  card: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    padding: '16px',
    borderRadius: opptrixTokens.radiusLg,
    border: `1px solid ${opptrixCssVars.separator}`,
    backgroundColor: opptrixCssVars.surface,
    boxShadow: SHADOW_CARD,
    textAlign: 'left',
    transitionProperty: 'background-color, box-shadow',
    transitionDuration: '150ms',
    transitionTimingFunction: 'ease',
    ':hover': {
      backgroundColor: opptrixCssVars.surfaceMuted,
    },
  },
  cardHead: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '12px',
    minWidth: 0,
  },
  cardMain: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '4px',
  },
  cardTitle: {
    fontSize: 'var(--opptrix-font-base)',
    fontWeight: 600,
    color: opptrixCssVars.textPrimary,
  },
  cardSummary: {
    fontSize: 'var(--opptrix-font-sm)',
    color: opptrixCssVars.textSecondary,
    lineHeight: 1.55,
    display: '-webkit-box',
    WebkitLineClamp: 3,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
  },
  cardTags: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '6px',
  },
  tag: {
    fontSize: 'var(--opptrix-font-xs)',
    color: opptrixCssVars.textTertiary,
    backgroundColor: opptrixCssVars.surfaceMuted,
    borderRadius: opptrixTokens.radiusSm,
    padding: '2px 8px',
  },
  cardActions: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '8px',
    marginTop: 'auto',
  },
  menuBtn: {
    width: '32px',
    height: '32px',
    border: 'none',
    borderRadius: opptrixTokens.radiusSm,
    background: 'transparent',
    color: opptrixCssVars.textSecondary,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: 'pointer',
    flexShrink: 0,
    ':hover': {
      backgroundColor: opptrixCssVars.surfaceHover,
    },
  },
  menuPanel: {
    position: 'fixed',
    zIndex: 10000,
    minWidth: '140px',
    padding: '6px',
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  menuItem: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 10px',
    border: 'none',
    borderRadius: opptrixTokens.radiusSm,
    background: 'transparent',
    color: opptrixCssVars.textPrimary,
    fontSize: 'var(--opptrix-font-sm)',
    cursor: 'pointer',
    textAlign: 'left',
    ':hover': {
      backgroundColor: opptrixCssVars.surfaceHover,
    },
  },
  menuItemDanger: {
    color: opptrixCssVars.error,
  },
  empty: {
    padding: '48px 24px',
    textAlign: 'center',
    color: opptrixCssVars.textTertiary,
    lineHeight: 1.7,
    whiteSpace: 'pre-line',
    fontSize: 'var(--opptrix-font-sm)',
  },
  loading: {
    padding: '48px 24px',
    display: 'flex',
    justifyContent: 'center',
  },
  error: {
    color: opptrixCssVars.error,
    fontSize: 'var(--opptrix-font-sm)',
  },
})

type ScopeTab = 'public' | 'personal'

interface Props {
  electronChrome?: boolean
  onSelectExpert: (expertId: string) => void | Promise<void>
}

export default function ExpertMarketPage({ electronChrome = false, onSelectExpert }: Props) {
  const s = useStyles()
  const { confirm } = useOpptrixDialogAlert()
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [scopeTab, setScopeTab] = useState<ScopeTab>('public')
  const [publicExperts, setPublicExperts] = useState<ExpertCatalogEntry[]>([])
  const [personalExperts, setPersonalExperts] = useState<ExpertCatalogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [dialogOpen, setDialogOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [menuExpertId, setMenuExpertId] = useState<string | null>(null)
  const [menuPos, setMenuPos] = useState<{ top: number; left: number } | null>(null)
  const menuRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), 250)
    return () => clearTimeout(timer)
  }, [query])

  const loadExperts = useCallback(async (q: string) => {
    setLoading(true)
    setError('')
    try {
      const searchOpts = q ? { q } : undefined
      const [pub, personal] = await Promise.all([
        listExperts({ ...searchOpts, scope: 'public' }),
        listExperts({ ...searchOpts, scope: 'personal' }),
      ])
      setPublicExperts(pub.experts)
      setPersonalExperts(personal.experts)
    } catch (e) {
      setPublicExperts([])
      setPersonalExperts([])
      setError(e instanceof Error ? e.message : '暂时无法加载专家列表')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadExperts(debouncedQuery)
  }, [debouncedQuery, loadExperts])

  useEffect(() => {
    if (!menuExpertId) return
    const close = (e: MouseEvent) => {
      const target = e.target as Node
      if (menuRef.current?.contains(target)) return
      setMenuExpertId(null)
      setMenuPos(null)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [menuExpertId])

  const visibleExperts = scopeTab === 'public' ? publicExperts : personalExperts

  const openCreate = () => {
    setEditingId(null)
    setDialogOpen(true)
  }

  const openEdit = (id: string) => {
    setMenuExpertId(null)
    setMenuPos(null)
    setEditingId(id)
    setDialogOpen(true)
  }

  const handleDelete = async (expert: ExpertCatalogEntry) => {
    setMenuExpertId(null)
    setMenuPos(null)
    const ok = await confirm({
      title: '删除后将无法恢复，确定继续？',
      message: `将删除「${expert.title}」，已有对话不会受影响。`,
      confirmLabel: '删除专家',
      confirmTone: 'danger',
    })
    if (!ok) return
    try {
      await deleteExpert(expert.id)
      await loadExperts(debouncedQuery)
    } catch (e) {
      setError(e instanceof Error ? e.message : '删除失败，请稍后重试')
    }
  }

  const handleSaved = async (expert: ExpertDefinition, startChat?: boolean) => {
    await loadExperts(debouncedQuery)
    if (startChat) {
      await onSelectExpert(expert.id)
    }
  }

  const openMenu = (expertId: string, anchor: HTMLElement) => {
    const rect = anchor.getBoundingClientRect()
    setMenuExpertId(expertId)
    setMenuPos({ top: rect.bottom + 4, left: Math.max(8, rect.right - 140) })
  }

  const electronWin = electronChrome && electronPlatform() !== 'darwin'

  const refreshAction = electronChrome ? (
    <ChromeToolButton
      label="刷新列表"
      iconPadding={DESKTOP_SIDEBAR_TOOL_ICON_PADDING}
      disabled={loading}
      onClick={() => { void loadExperts(debouncedQuery) }}
    >
      <ArrowSyncRegular fontSize={DESKTOP_SIDEBAR_TOOL_ICON_SIZE} />
    </ChromeToolButton>
  ) : (
    <OpptrixButton
      variant="secondary"
      icon={<ArrowSyncRegular />}
      disabled={loading}
      onClick={() => { void loadExperts(debouncedQuery) }}
    >
      刷新
    </OpptrixButton>
  )

  return (
    <div className={s.root}>
      {electronChrome ? (
        <div
          className={mergeClasses(
            s.electronTitleBar,
            electronWin ? s.electronTitleBarWin : s.electronTitleBarMac,
          )}
        >
          <Text className={s.titleBarPageTitle}>专家</Text>
          <div className={s.titleBarSpacer} aria-hidden />
          <div className={s.titleBarActions}>{refreshAction}</div>
        </div>
      ) : (
        <div className={s.webHead}>
          <Text className={s.webTitle}>专家</Text>
          <div className={s.webActions}>{refreshAction}</div>
        </div>
      )}

      <div className={mergeClasses(s.scrollBody, 'opptrix-scroll', 'opptrix-scroll-hover')}>
        <div className={s.content}>
          <div className={s.pageHeader}>
            {electronChrome && (
              <Text className={s.pageTitle} block>专家</Text>
            )}
            <Text className={s.pageSubtitle} block>
              挑选擅长领域的助手，开始更聚焦的投研对话
            </Text>
          </div>

          <div className={s.toolRow}>
            <div className={s.searchField}>
              <Input
                className={s.searchInput}
                value={query}
                onChange={(_e, data) => setQuery(data.value)}
                placeholder="搜索专家"
                contentBefore={<SearchRegular />}
                aria-label="搜索专家"
              />
            </div>
            <OpptrixButton variant="primary" icon={<AddRegular />} onClick={openCreate}>
              创建
            </OpptrixButton>
          </div>

          <div className={s.section}>
            <Text className={s.sectionTitle}>我的专家</Text>
            {personalExperts.length === 0 ? (
              <Text className={s.myEmpty}>
                还没有自建专家，点搜索框旁的「创建」开始定制
              </Text>
            ) : (
              <div className={mergeClasses(s.myExpertsRow, 'opptrix-scroll', 'opptrix-scroll-hover')}>
                {personalExperts.map(expert => (
                  <button
                    key={expert.id}
                    type="button"
                    className={mergeClasses(s.myExpertItem, 'opptrix-focusable')}
                    onClick={() => { void onSelectExpert(expert.id) }}
                    title={expert.title}
                  >
                    <ExpertIconTile expertId={expert.id} size="lg" />
                    <span className={s.myExpertLabel}>{expert.title}</span>
                  </button>
                ))}
                <button
                  type="button"
                  className={mergeClasses(s.myExpertItem, 'opptrix-focusable')}
                  onClick={openCreate}
                  aria-label="创建专家"
                >
                  <span className={s.addTile}><AddRegular fontSize={22} /></span>
                  <span className={s.myExpertLabel}>创建</span>
                </button>
              </div>
            )}
            {personalExperts.length === 0 && (
              <div className={mergeClasses(s.myExpertsRow, 'opptrix-scroll')}>
                <button
                  type="button"
                  className={mergeClasses(s.myExpertItem, 'opptrix-focusable')}
                  onClick={openCreate}
                  aria-label="创建专家"
                >
                  <span className={s.addTile}><AddRegular fontSize={22} /></span>
                  <span className={s.myExpertLabel}>创建</span>
                </button>
              </div>
            )}
          </div>

          <div className={s.tabRow}>
            <OpptrixSegmentedControl<ScopeTab>
              value={scopeTab}
              onChange={setScopeTab}
              options={[
                { value: 'public', label: '公开' },
                { value: 'personal', label: '个人' },
              ]}
            />
          </div>

          {error && <div className={s.error}>{error}</div>}

          {loading ? (
            <div className={s.loading}>
              <Spinner size="medium" label="正在加载专家…" />
            </div>
          ) : visibleExperts.length === 0 ? (
            <div className={s.empty}>
              {debouncedQuery
                ? '没有找到匹配的专家\n试试换个关键词，或清空搜索查看全部'
                : scopeTab === 'personal'
                  ? '还没有个人专家\n点搜索框旁的「创建」定制你的投研助手'
                  : '暂时没有公开专家\n稍后再试，或先创建个人专家'}
            </div>
          ) : (
            <div className={s.list}>
              {visibleExperts.map(expert => (
                <div key={expert.id} className={s.card}>
                  <div className={s.cardHead}>
                    <ExpertIconTile expertId={expert.id} size="md" />
                    <div className={s.cardMain}>
                      <Text className={s.cardTitle} block>{expert.title}</Text>
                      <Text className={s.cardSummary} block>{expert.summary}</Text>
                    </div>
                    {expert.source === 'local' && (
                      <button
                        type="button"
                        className={mergeClasses(s.menuBtn, 'opptrix-focusable')}
                        aria-label={`${expert.title} 更多操作`}
                        onClick={e => openMenu(expert.id, e.currentTarget)}
                      >
                        <MoreHorizontalRegular fontSize={18} />
                      </button>
                    )}
                  </div>
                  {expert.tags.length > 0 && (
                    <div className={s.cardTags}>
                      {expert.tags.map(tag => (
                        <span key={tag} className={s.tag}>{tag}</span>
                      ))}
                    </div>
                  )}
                  <div className={s.cardActions}>
                    <OpptrixButton
                      variant="primary"
                      onClick={() => { void onSelectExpert(expert.id) }}
                    >
                      开始对话
                    </OpptrixButton>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <CreateExpertDialog
        open={dialogOpen}
        editingId={editingId}
        onOpenChange={setDialogOpen}
        onSaved={handleSaved}
      />

      {menuExpertId && menuPos && createPortal(
        <div
          ref={menuRef}
          className={mergeClasses(s.menuPanel, OPPTRIX_GLASS_PANEL_CLASS)}
          style={{ top: menuPos.top, left: menuPos.left }}
          role="menu"
        >
          <button
            type="button"
            className={mergeClasses(s.menuItem, 'opptrix-focusable')}
            onClick={() => openEdit(menuExpertId)}
          >
            <EditRegular fontSize={16} />
            <span>编辑</span>
          </button>
          <button
            type="button"
            className={mergeClasses(s.menuItem, s.menuItemDanger, 'opptrix-focusable')}
            onClick={() => {
              const expert = personalExperts.find(e => e.id === menuExpertId)
              if (expert) void handleDelete(expert)
            }}
          >
            <DeleteRegular fontSize={16} />
            <span>删除</span>
          </button>
        </div>,
        document.body,
      )}
    </div>
  )
}
