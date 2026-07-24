import { useRef, useEffect, useCallback, useState } from 'react'
import { Text, makeStyles, mergeClasses } from '@fluentui/react-components'
import { ArrowUpRegular, PauseFilled } from '@fluentui/react-icons'
import ModelSelector from './ModelSelector'
import ComposerContextRefTag from './ComposerContextRefTag'
import ComposerQuickTasks from './ComposerQuickTasks'
import ChatWorkspaceGrants from './ChatWorkspaceGrants'
import ComposerStockMentionList from './ComposerStockMentionList'
import ComposerAgentUserPromptPanel from './ComposerAgentUserPromptPanel'
import OpptrixButton from '../components/opptrix/OpptrixButton'
import { useWatchlist } from '../market/useWatchlist'
import { useStockMention } from './useStockMention'
import type { AvailableModel, SessionContextRef } from '../types/chat'
import type { ChatUserPromptPayload, UserPromptAnswerPayload } from '../types/chatProgress'
import type { WatchlistItem } from '../types/market'
import {
  displayCodeFromInstrument,
  marketDisplayName,
  normalizeWatchlistItem,
  resolveWatchlistInstrument,
  watchlistItemKey,
} from '../market/instrument'
import {
  captureCaretRange,
  clearEditor,
  collectChipKeys,
  createChipElement,
  editorHasContent,
  focusEditorEnd,
  getCaretTextContext,
  getSendText,
  insertLineBreakAtCaret,
  insertMentionChip,
  setEditorText,
  type InlineChipData,
} from './composerEditor'
import { opptrixTokens, opptrixCssVars } from '../theme/tokens'
import { motion, primaryInteractive, interactiveTransition, fadeInUp } from '../theme/mixins'
import { listRowKey } from '../utils/listRowKey'

const LINE_HEIGHT = 1.5
const FONT_SIZE = 14
const ROW_PX = Math.round(FONT_SIZE * LINE_HEIGHT)
const MIN_TEXT_HEIGHT = ROW_PX
const MAX_TEXT_HEIGHT = ROW_PX * 8

const useStyles = makeStyles({
  wrap: {
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
    width: '100%',
  },
  startersSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    paddingLeft: opptrixTokens.chatComposerPadding,
    ...fadeInUp,
    animationDuration: '480ms',
    animationDelay: '0.95s',
    opacity: 0,
  },
  startersLabel: {
    fontSize: 'var(--opptrix-font-md)',
    fontWeight: 500,
    color: opptrixCssVars.textTertiary,
    letterSpacing: '0.01em',
  },
  starters: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
  },
  startersMobile: {
    flexWrap: 'nowrap',
    overflowX: 'auto',
  },
  starterChip: {
    borderRadius: opptrixTokens.radiusFull,
    fontWeight: 500,
    fontSize: 'var(--opptrix-font-base)',
    padding: '6px 14px',
    border: `1px solid ${opptrixCssVars.border}`,
    backgroundColor: opptrixCssVars.canvasAlt,
    color: opptrixCssVars.textSecondary,
    whiteSpace: 'nowrap',
    flexShrink: 0,
    transitionProperty: 'background-color, color, border-color, box-shadow',
    transitionDuration: motion.fast,
    ':hover': {
      backgroundColor: opptrixCssVars.surfaceHover,
      color: opptrixCssVars.textPrimary,
      border: `1px solid ${opptrixCssVars.separatorStrong}`,
    },
    ':focus-visible': {
      outline: `${opptrixTokens.focusRingWidth} solid ${opptrixCssVars.inputBorderFocus}`,
      outlineOffset: opptrixTokens.focusRingOffset,
    },
  },
  panelWrap: {
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'stretch',
    width: '100%',
    boxSizing: 'border-box',
    marginBottom: `calc(-1 * ${opptrixTokens.chatComposerGroundExtend})`,
  },
  panelGround: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: `calc(-1 * (${opptrixTokens.chatComposerGroundExtend} + ${opptrixTokens.chatComposerBottomInset}))`,
    borderTopLeftRadius: opptrixTokens.radiusXl,
    borderTopRightRadius: opptrixTokens.radiusXl,
    pointerEvents: 'none',
    zIndex: 0,
    backgroundImage: [
      'linear-gradient(',
      '180deg,',
      'transparent 0%,',
      `${opptrixCssVars.canvas} 62%,`,
      `${opptrixCssVars.canvas} 100%`,
      ')',
    ].join(' '),
  },
  panel: {...interactiveTransition,
position: 'relative',
    zIndex: 1,
    display: 'flex',
    flexDirection: 'column',
    width: '100%',
    boxSizing: 'border-box',
    padding: opptrixTokens.chatComposerPadding,
    gap: '10px',
    borderRadius: opptrixTokens.radiusXl,
    border: `1px solid ${opptrixCssVars.border}`,
    backgroundColor: opptrixCssVars.canvasAlt,
    boxShadow: 'none',
    ':hover': {
      border: `1px solid ${opptrixCssVars.borderStrong}`,
    },
    ':focus-within': {
      backgroundColor: opptrixCssVars.canvas,
      border: `1px solid ${opptrixCssVars.borderStrong}`,
      boxShadow: opptrixCssVars.composerFloatShadowFocus,
    },
  },
  inputRow: {
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
    width: '100%',
  },
  editorRow: {
    position: 'relative',
    width: '100%',
  },
  mentionAnchor: {
    position: 'absolute',
    left: 0,
    bottom: '2px',
    width: '24px',
    height: '20px',
    pointerEvents: 'none',
  },
  editor: {
    width: '100%',
    minWidth: 0,
    minHeight: `${MIN_TEXT_HEIGHT}px`,
    maxHeight: `${MAX_TEXT_HEIGHT}px`,
    overflowY: 'auto',
    border: 'none',
    background: 'transparent',
    outline: 'none',
    fontSize: `${FONT_SIZE}px`,
    lineHeight: LINE_HEIGHT,
    fontFamily: 'inherit',
    color: opptrixCssVars.textPrimary,
    padding: 0,
    margin: 0,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    cursor: 'text',
  },
  editorMobile: {
    fontSize: 'var(--opptrix-font-2xl)',
  },
  toolbar: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '8px',
    minHeight: '34px',
  },
  toolbarLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    flexShrink: 1,
    minWidth: 0,
  },
  toolbarRight: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    flexShrink: 1,
    minWidth: 0,
    justifyContent: 'flex-end',
    height: '34px',
  },
  skillBtnSlot: {
    display: 'flex',
    alignItems: 'center',
    flexShrink: 0,
  },
  sendBtn: {...primaryInteractive,
borderRadius: opptrixTokens.radiusFull,
    minWidth: '28px',
    maxWidth: '28px',
    width: '28px',
    minHeight: '28px',
    maxHeight: '28px',
    height: '28px',
    padding: 0,
    flexShrink: 0,
  },
  error: {
    fontSize: 'var(--opptrix-font-base)',
    color: opptrixCssVars.error,
    padding: `0 0 0 ${opptrixTokens.chatComposerPadding}`,
    animationDuration: motion.fast,
    animationName: {
      from: { opacity: 0 },
      to: { opacity: 1 },
    },
  },
  disclaimer: {
    position: 'relative',
    zIndex: 1,
    display: 'block',
    flexShrink: 0,
    textAlign: 'center',
    fontSize: 'var(--opptrix-font-md)',
    lineHeight: 1.45,
    color: opptrixCssVars.textSecondary,
    width: '100%',
    margin: 0,
    padding: '9px 0 0',
    userSelect: 'none',
  },
})

interface ChatComposerProps {
  /** 父组件注入草稿（revision 递增时同步到输入框） */
  draftSync?: { revision: number; text: string }
  sessionId?: string | null
  loading: boolean
  error: string
  isEmpty: boolean
  isMobile?: boolean
  contextRef?: SessionContextRef | null
  starters: string[]
  welcomeKey?: number
  availableModels: AvailableModel[]
  sessionModel?: string
  onSubmit: (text?: string) => void
  onStop?: () => void
  onModelChange?: (ref: string) => void
  onClearContextRef?: () => void
  userPrompt?: ChatUserPromptPayload | null
  userPromptSubmitting?: boolean
  onUserPromptSubmit?: (answer: UserPromptAnswerPayload) => void
}

export default function ChatComposer({
  draftSync,
  sessionId = null,
  loading,
  error,
  isEmpty,
  isMobile = false,
  contextRef = null,
  starters,
  welcomeKey = 0,
  availableModels,
  sessionModel,
  onSubmit,
  onStop,
  onModelChange,
  onClearContextRef,
  userPrompt = null,
  userPromptSubmitting = false,
  onUserPromptSubmit,
}: ChatComposerProps) {
  const s = useStyles()
  const editorRef = useRef<HTMLDivElement>(null)
  const mentionAnchorRef = useRef<HTMLSpanElement>(null)
  // composingRef: 中文/IME 输入合成期间，跳过 @ 提及检测，避免误触发与卡顿。
  const composingRef = useRef(false)
  // 最近一次编辑器内的光标快照：点菜单项插入 chip 时实时 selection 已被扰动，须用快照定位。
  const caretRangeRef = useRef<Range | null>(null)
  // 有无可发送内容（文字或 chip）；驱动发送按钮与 placeholder。
  const [hasContent, setHasContent] = useState(false)
  const { items: watchlistItems } = useWatchlist()

  const {
    state: mentionState,
    matches: mentionMatches,
    syncFromInput: syncMentionFromInput,
    close: closeMention,
    moveActive: moveMentionActive,
    clampActiveIndex,
    setMentionActiveIndex,
  } = useStockMention(watchlistItems)

  useEffect(() => {
    clampActiveIndex()
  }, [clampActiveIndex, mentionMatches.length])

  // 从编辑器 DOM 刷新可发送状态。
  const refreshContentState = useCallback(() => {
    const root = editorRef.current
    setHasContent(root ? editorHasContent(root) : false)
  }, [])

  // 根据当前光标上下文，驱动 @ 提及菜单开关与查询词。
  const syncMention = useCallback(() => {
    if (composingRef.current) return
    const root = editorRef.current
    if (!root) return
    // 每次光标/输入变动都快照当前 Range，供随后「点菜单项」插入时定位。
    caretRangeRef.current = captureCaretRange(root)
    const { text, offset } = getCaretTextContext(root)
    syncMentionFromInput(text, offset)
  }, [syncMentionFromInput])

  // 草稿同步（父组件注入）：重置编辑器为纯文本。
  useEffect(() => {
    if (!draftSync) return
    const root = editorRef.current
    if (!root) return
    setEditorText(root, draftSync.text)
    closeMention()
    refreshContentState()
  }, [draftSync, closeMention, refreshContentState])

  const buildChipData = useCallback((item: WatchlistItem): InlineChipData => {
    const row = normalizeWatchlistItem(item)
    const ref = resolveWatchlistInstrument(row)
    const code = displayCodeFromInstrument(ref)
    const market = ref.market !== 'CN' ? marketDisplayName(ref.market) : null
    return {
      key: watchlistItemKey(row),
      sendText: `${row.name}(${code})`,
      name: row.name,
      code,
      market,
    }
  }, [])

  const insertStockChip = useCallback((item: WatchlistItem) => {
    const root = editorRef.current
    if (!root) return
    // 用光标快照定位，避免点菜单项时实时 selection 退化到编辑器末尾。
    const savedRange = caretRangeRef.current
    root.focus()
    const data = buildChipData(item)
    if (collectChipKeys(root).includes(data.key)) {
      // 已存在同一标的：仅删除 @query 触发文本，不重复插入。
      const dup = createChipElement(data)
      insertMentionChip(root, dup, savedRange)
      dup.remove()
    } else {
      insertMentionChip(root, createChipElement(data), savedRange)
    }
    caretRangeRef.current = captureCaretRange(root)
    closeMention()
    refreshContentState()
  }, [buildChipData, closeMention, refreshContentState])

  const handleApplyQuickTask = useCallback((text: string) => {
    const root = editorRef.current
    if (!root) return
    setEditorText(root, text)
    closeMention()
    refreshContentState()
    focusEditorEnd(root)
  }, [closeMention, refreshContentState])

  const handleSelectMention = useCallback((item: WatchlistItem) => {
    insertStockChip(item)
  }, [insertStockChip])

  const clearEditorContent = useCallback(() => {
    const root = editorRef.current
    if (root) clearEditor(root)
    setHasContent(false)
  }, [])

  const handleSubmitMessage = useCallback((text?: string) => {
    const explicit = text?.trim()
    if (explicit) {
      onSubmit(explicit)
      clearEditorContent()
      return
    }
    const root = editorRef.current
    const composed = root ? getSendText(root).trim() : ''
    if (!composed || loading) return
    onSubmit(composed)
    clearEditorContent()
  }, [clearEditorContent, loading, onSubmit])

  const canSend = hasContent && !loading && !userPrompt
  const composerLocked = loading || Boolean(userPrompt)

  const handleInput = useCallback(() => {
    refreshContentState()
    syncMention()
  }, [refreshContentState, syncMention])

  const handleCompositionStart = useCallback(() => {
    composingRef.current = true
  }, [])

  const handleCompositionEnd = useCallback(() => {
    composingRef.current = false
    refreshContentState()
    syncMention()
  }, [refreshContentState, syncMention])

  const handlePaste = useCallback((e: React.ClipboardEvent<HTMLDivElement>) => {
    // 只接受纯文本，避免粘贴富文本/HTML 破坏编辑器结构。
    e.preventDefault()
    const text = e.clipboardData.getData('text/plain')
    if (text) document.execCommand('insertText', false, text)
    refreshContentState()
    syncMention()
  }, [refreshContentState, syncMention])

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (composingRef.current) return

    if (mentionState.open && mentionMatches.length) {
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        moveMentionActive(1)
        return
      }
      if (e.key === 'ArrowUp') {
        e.preventDefault()
        moveMentionActive(-1)
        return
      }
      if (e.key === 'Enter' || e.key === 'Tab') {
        e.preventDefault()
        const item = mentionMatches[mentionState.activeIndex]
        if (item) insertStockChip(item)
        return
      }
    }

    if (mentionState.open && e.key === 'Escape') {
      e.preventDefault()
      closeMention()
      return
    }

    if (e.key === 'Enter') {
      // Shift+Enter / Ctrl+Cmd+Enter: 插入换行。
      if (e.shiftKey || e.ctrlKey || e.metaKey) {
        e.preventDefault()
        const root = editorRef.current
        if (root) {
          insertLineBreakAtCaret(root)
          refreshContentState()
        }
        return
      }
      // 普通 Enter：发送。
      e.preventDefault()
      if (canSend) handleSubmitMessage()
    }
  }

  const handleSelect = useCallback(() => {
    syncMention()
  }, [syncMention])

  // 失焦时延迟关闭提及菜单，避免与菜单项点击（mousedown）产生时序竞争。
  const handleBlur = useCallback(() => {
    window.setTimeout(() => {
      if (composingRef.current) return
      closeMention()
    }, 120)
  }, [closeMention])

  return (
    <div className={s.wrap}>
      {isEmpty && (
        <div key={welcomeKey} className={s.startersSection}>
          <Text className={s.startersLabel}>你可以这样问</Text>
          <div className={mergeClasses(s.starters, isMobile && `${s.startersMobile} opptrix-scroll-x`)}>
            {starters.map((st, index) => (
              <OpptrixButton
                key={listRowKey(index, st)}
                className={s.starterChip}
                variant="pill"
                size="small"
                onClick={() => onSubmit(st)}
              >
                {st}
              </OpptrixButton>
            ))}
          </div>
        </div>
      )}

      {error && <div className={s.error} role="alert">{error}</div>}

      <div className={s.panelWrap}>
        <div className={s.panelGround} aria-hidden />
        {userPrompt && onUserPromptSubmit && (
          <ComposerAgentUserPromptPanel
            prompt={userPrompt}
            submitting={userPromptSubmitting}
            onSubmit={onUserPromptSubmit}
          />
        )}
        <div className={mergeClasses(s.panel, 'opptrix-composer-shell')}>
          <div className={s.inputRow}>
            {contextRef && (
              <ComposerContextRefTag
                contextRef={contextRef}
                onClear={onClearContextRef}
              />
            )}
            <div className={s.editorRow}>
              <span ref={mentionAnchorRef} className={s.mentionAnchor} aria-hidden />
              <div
                ref={editorRef}
                className={mergeClasses(
                  s.editor,
                  isMobile && s.editorMobile,
                  'opptrix-scroll',
                  'opptrix-composer-editor',
                )}
                contentEditable={!composerLocked}
                suppressContentEditableWarning
                role="textbox"
                aria-multiline="true"
                aria-label="输入问题，@ 选择关注股票"
                data-placeholder={isMobile ? '输入问题，@ 选择股票…' : '输入问题，@ 选择关注股票，Enter 发送…'}
                data-empty={hasContent ? undefined : 'true'}
                onInput={handleInput}
                onKeyDown={handleKeyDown}
                onKeyUp={handleSelect}
                onMouseUp={handleSelect}
                onPaste={handlePaste}
                onCompositionStart={handleCompositionStart}
                onCompositionEnd={handleCompositionEnd}
                onBlur={handleBlur}
              />
            </div>
          </div>
          <div className={s.toolbar}>
            <div className={s.toolbarLeft}>
              <ComposerQuickTasks
                disabled={composerLocked}
                onApply={handleApplyQuickTask}
              />
              <ChatWorkspaceGrants
                sessionId={sessionId}
                variant="toolbar"
                disabled={composerLocked}
              />
            </div>
            <div className={s.toolbarRight}>
              {onModelChange && (
                <ModelSelector
                  models={availableModels}
                  value={sessionModel}
                  disabled={composerLocked}
                  isMobile={isMobile}
                  compact
                  onChange={onModelChange}
                />
              )}
              <OpptrixButton
                className={s.sendBtn}
                variant="primary"
                icon={loading ? <PauseFilled fontSize={14} /> : <ArrowUpRegular fontSize={14} />}
                disabled={loading ? !onStop : !canSend}
                onClick={() => {
                  if (loading) onStop?.()
                  else handleSubmitMessage()
                }}
                aria-label={loading ? '停止生成' : '发送'}
              />
            </div>
          </div>
        </div>
        <span className={s.disclaimer}>
          内容由AI生成，不构成投资建议，请核实重要信息
        </span>
      </div>

      <ComposerStockMentionList
        open={mentionState.open}
        anchorRef={mentionAnchorRef}
        items={mentionMatches}
        activeIndex={mentionState.activeIndex}
        query={mentionState.query}
        onSelect={handleSelectMention}
        onHover={setMentionActiveIndex}
        onClose={closeMention}
      />
    </div>
  )
}
