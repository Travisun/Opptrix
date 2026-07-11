import { useCallback, useEffect, useRef, useState } from 'react'
import {
  Dialog, DialogSurface, DialogBody, Input, Spinner,
  makeStyles, mergeClasses,
} from '@fluentui/react-components'
import {
  ArchiveRegular, ChartMultipleRegular, ChatRegular, ChevronDownRegular, ChevronRightRegular,
  NewsRegular, SearchRegular,
} from '@fluentui/react-icons'
import { browseWorkspaceSearch, searchWorkspace, type SearchHit } from '../api/client'
import type { SessionMeta } from '../types/chat'
import { opptrixTokens, opptrixCssVars } from '../theme/tokens'
import { ghostInteractive, inputShellInteractive } from '../theme/mixins'
import { useDebouncedEffect } from '../hooks/useDebouncedEffect'

const ICON = 15

const useStyles = makeStyles({
  surface: {
    maxWidth: '620px',
    width: 'min(92vw, 620px)',
    padding: 0,
    borderRadius: opptrixTokens.radiusLg,
    overflow: 'hidden',
  },
  body: {
    display: 'flex',
    flexDirection: 'column',
    maxHeight: 'min(75vh, 600px)',
  },
  searchRow: {
    flexShrink: 0,
    padding: '15px 10px 10px',
    borderBottom: `1px solid ${opptrixCssVars.separator}`,
  },
  searchShell: {...inputShellInteractive,
display: 'flex',
    alignItems: 'center',
    gap: '8px',
    minHeight: '32px',
    padding: '0 10px',
  },
  scroll: {
    flex: 1,
    minHeight: 0,
    overflowY: 'auto',
    padding: '15px 0 10px',
  },
  sectionLabel: {
    display: 'block',
    fontSize: '11px',
    fontWeight: 600,
    color: opptrixCssVars.textTertiary,
    padding: '0 10px 4px',
    ':not(:first-child)': {
      marginTop: '12px',
    },
  },
  resultItem: {...ghostInteractive,
display: 'flex',
    alignItems: 'center',
    gap: '9px',
    width: '100%',
    padding: '6px 10px',
    borderRadius: opptrixTokens.radiusMd,
    textAlign: 'left',
    border: 'none',
    cursor: 'pointer',
  },
  resultIcon: {
    color: opptrixCssVars.textSecondary,
    flexShrink: 0,
    lineHeight: 0,
  },
  resultMain: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  resultTitle: {
    fontSize: '13px',
    fontWeight: 500,
    color: opptrixCssVars.textPrimary,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    lineHeight: 1.35,
  },
  resultMeta: {
    fontSize: '11px',
    color: opptrixCssVars.textTertiary,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    lineHeight: 1.3,
  },
  folderHead: {...ghostInteractive,
display: 'flex',
    alignItems: 'center',
    gap: '6px',
    width: '100%',
    padding: '5px 10px',
    borderRadius: opptrixTokens.radiusMd,
    border: 'none',
    fontSize: '12px',
    fontWeight: 600,
    color: opptrixCssVars.textSecondary,
    cursor: 'pointer',
    textAlign: 'left',
  },
  folderCount: {
    marginLeft: 'auto',
    fontWeight: 400,
    fontSize: '11px',
    color: opptrixCssVars.textTertiary,
  },
  folderSessions: {
    paddingLeft: '12px',
    display: 'flex',
    flexDirection: 'column',
  },
  status: {
    padding: '16px 10px',
    textAlign: 'center',
    fontSize: '12px',
    color: opptrixCssVars.textTertiary,
    lineHeight: 1.45,
  },
  loading: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '16px 10px',
  },
})

export type WorkspaceSearchAction =
  | { type: 'session'; sessionId: string }
  | { type: 'stock'; code: string; name: string }
  | { type: 'news'; articleId: string }

interface Props {
  open: boolean
  onClose: () => void
  onAction: (action: WorkspaceSearchAction) => void
}

function HitIcon({ hit }: { hit: SearchHit }) {
  if (hit.kind === 'session') {
    return hit.archived
      ? <ArchiveRegular fontSize={ICON} />
      : <ChatRegular fontSize={ICON} />
  }
  if (hit.kind === 'stock') return <ChartMultipleRegular fontSize={ICON} />
  return <NewsRegular fontSize={ICON} />
}

function hitTitle(hit: SearchHit) {
  if (hit.kind === 'stock') return `${hit.name} (${hit.code})`
  return hit.title
}

function hitMeta(hit: SearchHit) {
  if (hit.kind === 'session') return hit.snippet || (hit.archived ? '已归档' : '')
  if (hit.kind === 'stock') return hit.industry || hit.market
  return `${hit.sourceTitle} · ${hit.snippet || hit.pubDate}`
}

export default function WorkspaceSearchDialog({ open, onClose, onAction }: Props) {
  const s = useStyles()
  const [query, setQuery] = useState('')
  const [loading, setLoading] = useState(false)
  const [results, setResults] = useState<{
    sessions: Extract<SearchHit, { kind: 'session' }>[]
    stocks: Extract<SearchHit, { kind: 'stock' }>[]
    news: Extract<SearchHit, { kind: 'news' }>[]
  } | null>(null)
  const [recent, setRecent] = useState<SessionMeta[]>([])
  const [archived, setArchived] = useState<Array<{ folderId: string; title: string; sessions: SessionMeta[] }>>([])
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set())
  const inputRef = useRef<HTMLInputElement>(null)

  const loadBrowse = useCallback(async () => {
    try {
      const data = await browseWorkspaceSearch()
      setRecent(data.recent)
      setArchived(data.archived)
    } catch {
      setRecent([])
      setArchived([])
    }
  }, [])

  useEffect(() => {
    if (!open) return
    setQuery('')
    setResults(null)
    void loadBrowse()
    window.setTimeout(() => inputRef.current?.focus(), 80)
  }, [open, loadBrowse])

  useDebouncedEffect(() => {
    if (!open) return
    const q = query.trim()
    if (!q) {
      setResults(null)
      setLoading(false)
      return
    }
    setLoading(true)
    searchWorkspace(q, 24)
      .then(res => {
        setResults({
          sessions: res.sessions,
          stocks: res.stocks,
          news: res.news,
        })
      })
      .catch(() => setResults({ sessions: [], stocks: [], news: [] }))
      .finally(() => setLoading(false))
  }, [query, open], 280, true)

  const openSession = (sessionId: string) => {
    onAction({ type: 'session', sessionId })
    onClose()
  }

  const handleHit = (hit: SearchHit) => {
    if (hit.kind === 'session') onAction({ type: 'session', sessionId: hit.id })
    if (hit.kind === 'stock') onAction({ type: 'stock', code: hit.code, name: hit.name })
    if (hit.kind === 'news') onAction({ type: 'news', articleId: hit.id })
    onClose()
  }

  const toggleFolder = (folderId: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev)
      if (next.has(folderId)) next.delete(folderId)
      else next.add(folderId)
      return next
    })
  }

  const showBrowse = !query.trim()
  const hasResults = Boolean(
    results && (results.sessions.length > 0 || results.stocks.length > 0 || results.news.length > 0),
  )

  const renderHit = (hit: SearchHit) => {
    const meta = hitMeta(hit)
    return (
      <button
        key={`${hit.kind}-${hit.kind === 'session' ? hit.id : hit.kind === 'stock' ? hit.code : hit.id}`}
        type="button"
        className={mergeClasses(s.resultItem, 'opptrix-focusable')}
        onClick={() => handleHit(hit)}
      >
        <span className={s.resultIcon}><HitIcon hit={hit} /></span>
        <span className={s.resultMain}>
          <span className={s.resultTitle}>{hitTitle(hit)}</span>
          {meta && <span className={s.resultMeta}>{meta}</span>}
        </span>
      </button>
    )
  }

  const renderSection = (label: string, hits: SearchHit[]) => {
    if (!hits.length) return null
    return (
      <>
        <span className={s.sectionLabel}>{label}</span>
        {hits.map(renderHit)}
      </>
    )
  }

  return (
    <Dialog open={open} onOpenChange={(_, data) => { if (!data.open) onClose() }}>
      <DialogSurface className={mergeClasses(s.surface, 'opptrix-dialog-surface')}>
        <DialogBody className={mergeClasses(s.body, 'opptrix-workspace-search-dialog')}>
          <div className={s.searchRow}>
            <div className={mergeClasses(s.searchShell, 'opptrix-input-shell', 'opptrix-workspace-search-shell')}>
              <SearchRegular fontSize={ICON} color={opptrixCssVars.textTertiary} />
              <Input
                ref={inputRef}
                className="opptrix-workspace-search-input"
                appearance="filled-darker"
                size="small"
                placeholder="搜索对话、个股、新闻…"
                value={query}
                onChange={(_, d) => setQuery(d.value)}
              />
            </div>
          </div>

          <div className={mergeClasses(s.scroll, 'opptrix-scroll')}>
            {loading && (
              <div className={s.loading}>
                <Spinner size="tiny" label="正在搜索…" />
              </div>
            )}

            {!loading && !showBrowse && results && !hasResults && (
              <div className={s.status}>没有找到相关内容</div>
            )}

            {!loading && !showBrowse && results && hasResults && (
              <>
                {renderSection('对话', results.sessions)}
                {renderSection('个股', results.stocks)}
                {renderSection('新闻', results.news)}
              </>
            )}

            {showBrowse && !loading && (
              <>
                <span className={s.sectionLabel}>最近对话</span>
                {recent.length === 0 && (
                  <div className={s.status}>暂无最近对话</div>
                )}
                {recent.map(sess => (
                  <button
                    key={sess.id}
                    type="button"
                    className={mergeClasses(s.resultItem, 'opptrix-focusable')}
                    onClick={() => openSession(sess.id)}
                  >
                    <span className={s.resultIcon}><ChatRegular fontSize={ICON} /></span>
                    <span className={s.resultMain}>
                      <span className={s.resultTitle}>{sess.title}</span>
                    </span>
                  </button>
                ))}

                {archived.length > 0 && (
                  <>
                    <span className={s.sectionLabel}>归档对话</span>
                    {archived.map(group => {
                      const expanded = expandedFolders.has(group.folderId)
                      return (
                        <div key={group.folderId}>
                          <button
                            type="button"
                            className={mergeClasses(s.folderHead, 'opptrix-focusable')}
                            onClick={() => toggleFolder(group.folderId)}
                          >
                            {expanded
                              ? <ChevronDownRegular fontSize={12} />
                              : <ChevronRightRegular fontSize={12} />}
                            <ArchiveRegular fontSize={12} />
                            <span>{group.title}</span>
                            <span className={s.folderCount}>{group.sessions.length}</span>
                          </button>
                          {expanded && (
                            <div className={s.folderSessions}>
                              {group.sessions.map(sess => (
                                <button
                                  key={sess.id}
                                  type="button"
                                  className={mergeClasses(s.resultItem, 'opptrix-focusable')}
                                  onClick={() => openSession(sess.id)}
                                >
                                  <span className={s.resultMain}>
                                    <span className={s.resultTitle}>{sess.title}</span>
                                  </span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </>
                )}
              </>
            )}
          </div>
        </DialogBody>
      </DialogSurface>
    </Dialog>
  )
}
