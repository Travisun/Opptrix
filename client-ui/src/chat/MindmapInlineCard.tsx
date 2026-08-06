import { useEffect, useState } from 'react'
import { makeStyles, mergeClasses, Spinner } from '@fluentui/react-components'
import { OpenRegular } from '@fluentui/react-icons'
import { fetchAttachmentRawText } from '../api/client'
import type { ChatAttachmentMeta } from '../types/chat'
import { opptrixCssVars, opptrixTokens } from '../theme/tokens'
import {
  buildTree,
  parseMindmapJson,
  type MindmapTreeNode,
} from './mindmapDocument'

export interface MindmapInlineCardProps {
  sessionId: string
  attachment: ChatAttachmentMeta
  onOpen: () => void
}

type LoadState =
  | { phase: 'loading' }
  | { phase: 'error'; message: string }
  | { phase: 'ready'; root: MindmapTreeNode; totalNodes: number }

const MAX_DEPTH = 2
const MAX_VISIBLE = 12

type PreviewRow = { id: string; label: string; depth: number }

function collectPreviewRows(
  root: MindmapTreeNode,
  maxDepth: number,
  maxVisible: number,
): { rows: PreviewRow[]; shown: number } {
  const rows: PreviewRow[] = []
  const walk = (node: MindmapTreeNode, depth: number) => {
    if (rows.length >= maxVisible) return
    rows.push({ id: node.id, label: node.label, depth })
    if (depth >= maxDepth) return
    for (const child of node.children) {
      if (rows.length >= maxVisible) return
      walk(child, depth + 1)
    }
  }
  walk(root, 0)
  return { rows, shown: rows.length }
}

const useStyles = makeStyles({
  card: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    width: '100%',
    maxWidth: '420px',
    minHeight: '120px',
    maxHeight: '200px',
    boxSizing: 'border-box',
    padding: '10px 12px',
    borderRadius: opptrixTokens.radiusMd,
    border: `1px solid ${opptrixCssVars.border}`,
    backgroundColor: opptrixCssVars.canvasAlt,
    cursor: 'pointer',
    textAlign: 'left',
    color: opptrixCssVars.textPrimary,
    transitionProperty: 'border-color, background-color',
    transitionDuration: '0.15s',
    transitionTimingFunction: 'ease',
    ':hover': {
      backgroundColor: opptrixCssVars.canvas,
    },
    ':focus-visible': {
      outline: `2px solid rgba(0, 122, 255, 0.35)`,
      outlineOffset: '2px',
    },
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '8px',
    flexShrink: 0,
  },
  title: {
    flex: '1 1 auto',
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontSize: 'var(--opptrix-font-sm)',
    fontWeight: 600,
    color: opptrixCssVars.textPrimary,
  },
  openHint: {
    flexShrink: 0,
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    fontSize: 'var(--opptrix-font-sm)',
    color: opptrixCssVars.textTertiary,
  },
  body: {
    flex: 1,
    minHeight: 0,
    overflow: 'hidden',
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  center: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: opptrixCssVars.textTertiary,
    fontSize: 'var(--opptrix-font-sm)',
  },
  row: {
    display: 'block',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
    fontSize: 'var(--opptrix-font-sm)',
    lineHeight: 1.45,
    color: opptrixCssVars.textSecondary,
  },
  rowRoot: {
    fontWeight: 600,
    color: opptrixCssVars.textPrimary,
  },
  more: {
    marginTop: '2px',
    fontSize: 'var(--opptrix-font-sm)',
    color: opptrixCssVars.textTertiary,
  },
})

export default function MindmapInlineCard({
  sessionId,
  attachment,
  onOpen,
}: MindmapInlineCardProps) {
  const s = useStyles()
  const [state, setState] = useState<LoadState>({ phase: 'loading' })

  useEffect(() => {
    let cancelled = false
    setState({ phase: 'loading' })
    void (async () => {
      const result = await fetchAttachmentRawText(sessionId, attachment.id)
      if (cancelled) return
      if (!result.ok) {
        setState({ phase: 'error', message: '暂时读不出这份脑图' })
        return
      }
      const parsed = parseMindmapJson(result.text)
      if (cancelled) return
      if ('error' in parsed) {
        setState({ phase: 'error', message: parsed.error })
        return
      }
      const root = buildTree(parsed)
      if (!root) {
        setState({ phase: 'error', message: '暂时无法展示脑图结构' })
        return
      }
      setState({ phase: 'ready', root, totalNodes: parsed.nodes.length })
    })()
    return () => {
      cancelled = true
    }
  }, [sessionId, attachment.id])

  const preview =
    state.phase === 'ready'
      ? collectPreviewRows(state.root, MAX_DEPTH, MAX_VISIBLE)
      : null
  const remaining =
    state.phase === 'ready' && preview
      ? Math.max(0, state.totalNodes - preview.shown)
      : 0

  return (
    <button
      type="button"
      className={s.card}
      onClick={onOpen}
      title={`打开 ${attachment.name}`}
      aria-label={`打开脑图 ${attachment.name}`}
    >
      <div className={s.header}>
        <span className={s.title}>{attachment.name}</span>
        <span className={s.openHint}>
          打开
          <OpenRegular fontSize={14} />
        </span>
      </div>
      <div className={s.body}>
        {state.phase === 'loading' ? (
          <div className={s.center}>
            <Spinner size="tiny" label="正在加载脑图…" />
          </div>
        ) : state.phase === 'error' ? (
          <div className={s.center}>{state.message}</div>
        ) : preview ? (
          <>
            {preview.rows.map((row) => (
              <span
                key={row.id}
                className={mergeClasses(s.row, row.depth === 0 && s.rowRoot)}
                style={{ paddingLeft: `${row.depth * 12}px` }}
              >
                {row.label}
              </span>
            ))}
            {remaining > 0 ? (
              <span className={s.more}>还有 {remaining} 个节点</span>
            ) : null}
          </>
        ) : null}
      </div>
    </button>
  )
}
