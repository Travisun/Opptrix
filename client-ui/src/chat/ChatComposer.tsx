import { useRef, useEffect, useCallback, useState } from 'react'
import { Text, makeStyles, mergeClasses } from '@fluentui/react-components'
import { ArrowUpRegular, PauseFilled } from '@fluentui/react-icons'
import ModelSelector from './ModelSelector'
import ComposerContextRefTag from './ComposerContextRefTag'
import ComposerStockRefTag from './ComposerStockRefTag'
import ComposerQuickTasks from './ComposerQuickTasks'
import ComposerStockMentionList from './ComposerStockMentionList'
import ComposerAgentUserPromptPanel from './ComposerAgentUserPromptPanel'
import OpptrixButton from '../components/opptrix/OpptrixButton'
import { useWatchlist } from '../market/useWatchlist'
import { useStockMention } from './useStockMention'
import type { AvailableModel, SessionContextRef } from '../types/chat'
import type { ChatUserPromptPayload, UserPromptAnswerPayload } from '../types/chatProgress'
import type { WatchlistItem } from '../types/market'
import { composeComposerMessage, mergeStockRef, stockRefKey } from './composerMessage'
import { opptrixTokens, opptrixCssVars } from '../theme/tokens'
import { motion, primaryInteractive, interactiveTransition, fadeInUp } from '../theme/mixins'
import { listRowKey } from '../utils/listRowKey'

const LINE_HEIGHT = 1.5
const FONT_SIZE = 14
const ROWS = 3
const ROW_PX = Math.round(FONT_SIZE * LINE_HEIGHT)
const MIN_TEXT_HEIGHT = ROW_PX * ROWS
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
    fontSize: '12px',
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
    fontSize: '13px',
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
    flexWrap: 'wrap',
    alignItems: 'flex-start',
    alignContent: 'flex-start',
    gap: '6px',
    width: '100%',
    minHeight: `${MIN_TEXT_HEIGHT}px`,
    position: 'relative',
  },
  mentionAnchor: {
    position: 'absolute',
    left: 0,
    bottom: '2px',
    width: '24px',
    height: '20px',
    pointerEvents: 'none',
  },
  textarea: {
    flex: '1 1 120px',
    width: 'auto',
    minWidth: '48px',
    border: 'none',
    background: 'transparent',
    resize: 'none',
    outline: 'none',
    fontSize: `${FONT_SIZE}px`,
    lineHeight: LINE_HEIGHT,
    fontFamily: 'inherit',
    color: opptrixCssVars.textPrimary,
    padding: 0,
    margin: 0,
    '::placeholder': {
      color: opptrixCssVars.textTertiary,
    },
  },
  textareaWithRef: {
    minHeight: `${ROW_PX * Math.max(ROWS - 1, 1)}px`,
    maxHeight: `${MAX_TEXT_HEIGHT}px`,
  },
  textareaSolo: {
    minHeight: `${MIN_TEXT_HEIGHT}px`,
    maxHeight: `${MAX_TEXT_HEIGHT}px`,
  },
  textareaFull: {
    flex: '1 1 100%',
    width: '100%',
  },
  textareaMobile: {
    fontSize: '16px',
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
    flexShrink: 0,
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
    width: '28px',
    height: '28px',
    padding: 0,
    flexShrink: 0,
  },
  error: {
    fontSize: '13px',
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
    fontSize: '12px',
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
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const mentionAnchorRef = useRef<HTMLSpanElement>(null)
  const [input, setInput] = useState('')
  const [stockRefs, setStockRefs] = useState<WatchlistItem[]>([])
  const hasInlineRefs = Boolean(contextRef) || stockRefs.length > 0
  const { items: watchlistItems } = useWatchlist()

  useEffect(() => {
    if (!draftSync) return
    setInput(draftSync.text)
    setStockRefs([])
  }, [draftSync])
  const {
    state: mentionState,
    matches: mentionMatches,
    syncFromInput: syncMentionFromInput,
    close: closeMention,
    moveActive: moveMentionActive,
    selectActive: selectMentionActive,
    applySelection: applyMentionSelection,
    clampActiveIndex,
    setMentionActiveIndex,
  } = useStockMention(watchlistItems)

  useEffect(() => {
    clampActiveIndex()
  }, [clampActiveIndex, mentionMatches.length])

  const syncHeight = useCallback(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    const lineMin = hasInlineRefs ? ROW_PX * Math.max(ROWS - 1, 1) : MIN_TEXT_HEIGHT
    const next = Math.min(Math.max(el.scrollHeight, lineMin), MAX_TEXT_HEIGHT)
    el.style.height = `${next}px`
  }, [hasInlineRefs])

  useEffect(() => {
    syncHeight()
  }, [input, hasInlineRefs, syncHeight])

  const handleInputChange = useCallback((value: string) => {
    setInput(value)
    const cursor = textareaRef.current?.selectionStart ?? value.length
    syncMentionFromInput(value, cursor)
  }, [syncMentionFromInput])

  const handleApplyQuickTask = useCallback((text: string) => {
    setInput(text)
    closeMention()
    textareaRef.current?.focus()
  }, [closeMention])

  const handleSelectMention = useCallback((item: WatchlistItem) => {
    const el = textareaRef.current
    if (!el) return
    const cursor = el.selectionStart ?? input.length
    const { nextText, nextCursor } = applyMentionSelection(input, cursor)
    setStockRefs(prev => mergeStockRef(prev, item))
    setInput(nextText)
    window.requestAnimationFrame(() => {
      el.focus()
      el.setSelectionRange(nextCursor, nextCursor)
    })
  }, [applyMentionSelection, input])

  const handleRemoveStockRef = useCallback((code: string) => {
    setStockRefs(prev => prev.filter(r => stockRefKey(r) !== code))
  }, [])

  const handleSubmitMessage = useCallback((text?: string) => {
    const explicit = text?.trim()
    if (explicit) {
      onSubmit(explicit)
      setInput('')
      setStockRefs([])
      return
    }
    const composed = composeComposerMessage(input, stockRefs)
    if (!composed.trim() || loading) return
    onSubmit(composed)
    setInput('')
    setStockRefs([])
  }, [input, loading, onSubmit, stockRefs])

  const canSend = Boolean(input.trim() || stockRefs.length) && !loading && !userPrompt
  const composerLocked = loading || Boolean(userPrompt)

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
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
        const el = textareaRef.current
        if (!el) return
        const cursor = el.selectionStart ?? input.length
        const result = selectMentionActive(input, cursor)
        if (result) {
          setStockRefs(prev => mergeStockRef(prev, result.item))
          setInput(result.nextText)
          window.requestAnimationFrame(() => {
            el.focus()
            el.setSelectionRange(result.nextCursor, result.nextCursor)
          })
        }
        return
      }
    }

    if (mentionState.open && e.key === 'Escape') {
      e.preventDefault()
      closeMention()
      return
    }

    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (canSend) handleSubmitMessage()
    }
  }

  const handleTextareaSelect = useCallback(() => {
    const el = textareaRef.current
    if (!el) return
    syncMentionFromInput(input, el.selectionStart ?? input.length)
  }, [input, syncMentionFromInput])

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
            <span ref={mentionAnchorRef} className={s.mentionAnchor} aria-hidden />
            {contextRef && (
              <ComposerContextRefTag
                contextRef={contextRef}
                onClear={onClearContextRef}
              />
            )}
            {stockRefs.map(item => (
              <ComposerStockRefTag
                key={stockRefKey(item)}
                item={item}
                onRemove={() => handleRemoveStockRef(stockRefKey(item))}
              />
            ))}
            <textarea
              ref={textareaRef}
              className={mergeClasses(
                s.textarea,
                hasInlineRefs ? s.textareaWithRef : s.textareaSolo,
                !hasInlineRefs && s.textareaFull,
                isMobile && s.textareaMobile,
              )}
              value={input}
              onChange={e => handleInputChange(e.target.value)}
              onKeyDown={handleKeyDown}
              onClick={handleTextareaSelect}
              onKeyUp={handleTextareaSelect}
              placeholder={isMobile ? '输入问题，@ 选择股票…' : '输入问题，@ 选择关注股票，Enter 发送…'}
              rows={ROWS}
              disabled={composerLocked}
              enterKeyHint="send"
            />
          </div>
          <div className={s.toolbar}>
            <div className={s.toolbarLeft}>
              <ComposerQuickTasks
                disabled={composerLocked}
                onApply={handleApplyQuickTask}
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
