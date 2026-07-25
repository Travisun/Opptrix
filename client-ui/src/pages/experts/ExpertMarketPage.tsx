import { useCallback, useEffect, useState } from 'react'
import {
  Spinner,
  Text,
  makeStyles,
  mergeClasses,
} from '@fluentui/react-components'
import {
  AddRegular,
  ArrowSyncRegular,
  DismissRegular,
  SearchRegular,
} from '@fluentui/react-icons'
import { electronPlatform } from '../../platform/detect'
import { opptrixTokens, opptrixCssVars } from '../../theme/tokens'
import { inputShellInteractive, nativeIconInteractive } from '../../theme/mixins'
import {
  DESKTOP_SIDEBAR_TOOL_ICON_PADDING,
  DESKTOP_SIDEBAR_TOOL_ICON_SIZE,
  DESKTOP_TITLEBAR_HEIGHT,
} from '../../desktop/constants'
import ChromeToolButton from '../../desktop/ChromeToolButton'
import OpptrixButton from '../../components/opptrix/OpptrixButton'
import OpptrixInput from '../../components/opptrix/OpptrixInput'
import { useOpptrixDialogAlert } from '../../components/opptrix/OpptrixDialogAlert'
import { deleteExpert, listExperts } from '../../api/client'
import type { ExpertCatalogEntry, ExpertDefinition } from '../../types/chat'
import ExpertIconTile from './ExpertIconTile'
import CreateExpertDialog from './CreateExpertDialog'
import ExpertDetailDialog from './ExpertDetailDialog'

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
    position: 'relative',
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
  contentColumn: {
    width: opptrixTokens.settingsContentWidth,
    maxWidth: opptrixTokens.expertsContentMaxWidth,
    minWidth: 0,
    marginLeft: 'auto',
    marginRight: 'auto',
    boxSizing: 'border-box',
    paddingTop: '20px',
    paddingBottom: '32px',
    paddingLeft: 'clamp(12px, 3.5vw, 32px)',
    paddingRight: 'clamp(12px, 3.5vw, 32px)',
    display: 'flex',
    flexDirection: 'column',
    gap: '18px',
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
  searchShell: {
    ...inputShellInteractive,
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    width: '100%',
    minHeight: '36px',
    paddingLeft: '10px',
    paddingRight: '6px',
    boxSizing: 'border-box',
    '& .fui-Input': {
      flex: 1,
      minWidth: 0,
      backgroundColor: 'transparent',
      border: 'none',
      boxShadow: 'none',
      padding: 0,
    },
    '& .fui-Input__input': {
      backgroundColor: 'transparent',
      padding: '0',
      minWidth: 0,
    },
    '& .fui-Input:hover, & .fui-Input:focus-within, & .fui-Input::after': {
      backgroundColor: 'transparent',
      border: 'none',
      boxShadow: 'none',
    },
  },
  searchShellFilled: {
    backgroundColor: opptrixCssVars.inputBgHover,
    ':hover': {
      backgroundColor: opptrixCssVars.inputBgFocus,
    },
    ':focus-within': {
      backgroundColor: opptrixCssVars.inputBgFocus,
      border: `1px solid ${opptrixCssVars.borderStrong}`,
    },
  },
  searchInput: {
    flex: 1,
    minWidth: 0,
    width: '100%',
  },
  searchClear: {
    ...nativeIconInteractive,
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '24px',
    height: '24px',
    border: 'none',
    borderRadius: opptrixTokens.radiusSm,
    background: 'transparent',
    color: opptrixCssVars.textTertiary,
    cursor: 'pointer',
    flexShrink: 0,
    padding: 0,
    ':hover': {
      color: opptrixCssVars.textSecondary,
      backgroundColor: opptrixCssVars.gray100,
    },
  },
  sectionTitle: {
    fontSize: 'var(--opptrix-font-sm)',
    fontWeight: 600,
    color: opptrixCssVars.textSecondary,
    letterSpacing: '0.01em',
  },
  list: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
    gap: '8px 12px',
    '@media (max-width: 560px)': {
      gridTemplateColumns: '1fr',
    },
  },
  card: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    minWidth: 0,
    padding: '10px 8px',
    border: 'none',
    borderRadius: opptrixTokens.radiusMd,
    backgroundColor: 'transparent',
    cursor: 'pointer',
    textAlign: 'left',
    transitionProperty: 'background-color',
    transitionDuration: '120ms',
    ':hover': {
      backgroundColor: opptrixCssVars.gray100,
    },
  },
  cardMain: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  cardTitle: {
    fontSize: 'var(--opptrix-font-base)',
    fontWeight: 600,
    color: opptrixCssVars.textPrimary,
    overflow: 'hidden',
    whiteSpace: 'nowrap',
    textOverflow: 'ellipsis',
  },
  cardSummary: {
    fontSize: 'var(--opptrix-font-sm)',
    color: opptrixCssVars.textSecondary,
    lineHeight: 1.45,
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
  },
  cardChat: {
    flexShrink: 0,
  },
  empty: {
    padding: '40px 16px',
    textAlign: 'center',
    color: opptrixCssVars.textTertiary,
    lineHeight: 1.7,
    whiteSpace: 'pre-line',
    fontSize: 'var(--opptrix-font-sm)',
  },
  loading: {
    padding: '40px 16px',
    display: 'flex',
    justifyContent: 'center',
  },
  error: {
    color: opptrixCssVars.error,
    fontSize: 'var(--opptrix-font-sm)',
  },
})

function isPersonalExpert(expert: ExpertCatalogEntry) {
  return expert.source === 'local'
}

interface Props {
  electronChrome?: boolean
  onSelectExpert: (expertId: string) => void | Promise<void>
}

export default function ExpertMarketPage({ electronChrome = false, onSelectExpert }: Props) {
  const s = useStyles()
  const { confirm } = useOpptrixDialogAlert()
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [experts, setExperts] = useState<ExpertCatalogEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [createOpen, setCreateOpen] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [detailExpert, setDetailExpert] = useState<ExpertCatalogEntry | null>(null)

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query.trim()), 250)
    return () => clearTimeout(timer)
  }, [query])

  const loadExperts = useCallback(async (q: string) => {
    setLoading(true)
    setError('')
    try {
      const result = await listExperts({
        ...(q ? { q } : {}),
        scope: 'all',
      })
      const sorted = [...result.experts].sort((a, b) => {
        const ap = isPersonalExpert(a) ? 0 : 1
        const bp = isPersonalExpert(b) ? 0 : 1
        if (ap !== bp) return ap - bp
        return a.title.localeCompare(b.title, 'zh')
      })
      setExperts(sorted)
    } catch (e) {
      setExperts([])
      setError(e instanceof Error ? e.message : '暂时无法加载，请稍后重试')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadExperts(debouncedQuery)
  }, [debouncedQuery, loadExperts])

  const openCreate = () => {
    setEditingId(null)
    setCreateOpen(true)
  }

  const openEdit = (id: string) => {
    setDetailExpert(null)
    setEditingId(id)
    setCreateOpen(true)
  }

  const handleDelete = async (expert: ExpertCatalogEntry) => {
    const ok = await confirm({
      title: '删除后将无法恢复，确定继续？',
      message: `将删除「${expert.title}」。你和他的聊天记录还会留着，不受影响。`,
      confirmLabel: '删除',
      confirmTone: 'danger',
    })
    if (!ok) return
    try {
      await deleteExpert(expert.id)
      setDetailExpert(null)
      await loadExperts(debouncedQuery)
    } catch (e) {
      setError(e instanceof Error ? e.message : '删除失败，请稍后重试')
    }
  }

  const handleSaved = async (_expert: ExpertDefinition) => {
    await loadExperts(debouncedQuery)
  }

  const electronWin = electronChrome && electronPlatform() !== 'darwin'

  const refreshAction = electronChrome ? (
    <ChromeToolButton
      label="刷新"
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
            'opptrix-experts-title-bar',
            electronWin ? s.electronTitleBarWin : s.electronTitleBarMac,
          )}
        >
          <Text className={mergeClasses(s.titleBarPageTitle, 'opptrix-panel-title-no-drag')} block>
            专家
          </Text>
          <div
            className={mergeClasses(s.titleBarSpacer, 'opptrix-experts-title-drag')}
            aria-hidden
          />
          <div className={mergeClasses(s.titleBarActions, 'opptrix-panel-title-no-drag')}>
            {refreshAction}
          </div>
        </div>
      ) : (
        <div className={s.webHead}>
          <Text className={s.webTitle}>专家</Text>
          <div className={s.webActions}>{refreshAction}</div>
        </div>
      )}

      <div className={mergeClasses(s.scrollBody, 'opptrix-scroll', 'opptrix-scroll-hover')}>
        <div className={s.contentColumn}>
          <div className={s.pageHeader}>
            {electronChrome && (
              <Text className={s.pageTitle} block>专家</Text>
            )}
            <Text className={s.pageSubtitle} block>
              选一位助手聊聊行情与想法；也可以自己创建一个更合口味的。
            </Text>
          </div>

          <div className={s.toolRow}>
            <div className={s.searchField}>
              <div
                className={mergeClasses(
                  s.searchShell,
                  'opptrix-input-shell',
                  query.trim() && s.searchShellFilled,
                )}
              >
                <SearchRegular fontSize={14} color={opptrixCssVars.textTertiary} />
                <OpptrixInput
                  className={mergeClasses(s.searchInput, 'opptrix-experts-search')}
                  value={query}
                  onChange={(_e, data) => setQuery(data.value)}
                  placeholder="搜索名称或擅长领域"
                  contentBefore={null}
                  aria-label="搜索专家"
                />
                {query.trim() ? (
                  <button
                    type="button"
                    className={mergeClasses(s.searchClear, 'opptrix-focusable')}
                    aria-label="清空搜索"
                    onClick={() => setQuery('')}
                  >
                    <DismissRegular fontSize={14} />
                  </button>
                ) : null}
              </div>
            </div>
            <OpptrixButton variant="primary" icon={<AddRegular />} onClick={openCreate}>
              创建
            </OpptrixButton>
          </div>

          <Text className={s.sectionTitle} block>全部专家</Text>
          {error && <div className={s.error}>{error}</div>}

          {loading ? (
            <div className={s.loading}>
              <Spinner size="medium" label="正在加载…" />
            </div>
          ) : experts.length === 0 ? (
            <div className={s.empty}>
              {debouncedQuery
                ? '没有找到相关助手\n换个词试试，或清空搜索看看全部'
                : '暂时还没有可用的助手\n点「创建」定制一位，或稍后再来看看'}
            </div>
          ) : (
            <div className={s.list}>
              {experts.map(expert => {
                const personal = isPersonalExpert(expert)
                return (
                  <div
                    key={expert.id}
                    className={mergeClasses(s.card, 'opptrix-focusable')}
                    role="button"
                    tabIndex={0}
                    onClick={() => setDetailExpert(expert)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault()
                        setDetailExpert(expert)
                      }
                    }}
                    aria-label={`查看${expert.title}详情`}
                  >
                    <ExpertIconTile expertId={expert.id} size="md" personal={personal} />
                    <div className={s.cardMain}>
                      <span className={s.cardTitle}>{expert.title}</span>
                      <span className={s.cardSummary}>{expert.summary}</span>
                    </div>
                    <div className={s.cardChat}>
                      <OpptrixButton
                        variant="outline"
                        size="small"
                        onClick={e => {
                          e.stopPropagation()
                          void onSelectExpert(expert.id)
                        }}
                      >
                        聊天
                      </OpptrixButton>
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>

      <CreateExpertDialog
        open={createOpen}
        editingId={editingId}
        onOpenChange={setCreateOpen}
        onSaved={handleSaved}
      />

      <ExpertDetailDialog
        open={Boolean(detailExpert)}
        expert={detailExpert}
        onOpenChange={open => {
          if (!open) setDetailExpert(null)
        }}
        onChat={id => { void onSelectExpert(id) }}
        onEdit={openEdit}
        onDelete={expert => { void handleDelete(expert) }}
      />
    </div>
  )
}
