import { useRef, useEffect, useCallback, useState } from 'react'
import {
  Text, makeStyles, mergeClasses,
} from '@fluentui/react-components'
import type {
  ChatDisplayMessage, EphemeralAskTurn, MessageSelection, SessionContextRef,
  AvailableModel,
} from '../types/chat'
import type { ChatLiveTrace, ChatUserPromptPayload, UserPromptAnswerPayload } from '../types/chatProgress'
import MobileTopBar from './MobileTopBar'
import ChatComposer from './ChatComposer'
import ChatMessageItem from './ChatMessageItem'
import ChatProcessTrace from './ChatProcessTrace'
import MessageSelectionToolbar from './MessageSelectionToolbar'
import { useMessageSelection, type MessageSelectionAnchor } from '../hooks/useMessageSelection'
import { opptrixTokens, opptrixCssVars } from '../theme/tokens'
import { fadeInUp } from '../theme/mixins'
import { isElectron } from '../platform/detect'
import ChromeToolButton from '../desktop/ChromeToolButton'
import {
  PanelRightExpandRegular,
  ArrowMaximizeRegular,
  ArrowMinimizeRegular,
} from './chatIcons'
import {
  DESKTOP_SIDEBAR_TOOL_ICON_PADDING,
  DESKTOP_SIDEBAR_TOOL_ICON_SIZE,
} from '../desktop/constants'
import { pickWelcomeVariant } from './chatWelcomeVariants'

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    minWidth: 0,
    backgroundColor: opptrixCssVars.canvas,
    overflow: 'hidden',
    position: 'relative',
  },
  bodyShell: {
    position: 'relative',
    flex: 1,
    minHeight: 0,
    overflow: 'hidden',
  },
  scrollViewport: {
    position: 'absolute',
    inset: 0,
    overflowY: 'auto',
    overflowX: 'hidden',
    zIndex: 1,
    overscrollBehavior: 'contain',
    WebkitOverflowScrolling: 'touch',
  },
  threadColumn: {
    width: '100%',
    maxWidth: opptrixTokens.chatThreadMaxWidth,
    marginInline: 'auto',
    paddingInline: opptrixTokens.chatThreadPaddingX,
    boxSizing: 'border-box',
  },
  threadColumnMobile: {
    maxWidth: 'none',
    paddingInline: opptrixTokens.chatThreadPaddingXMobile,
  },
  contentColumn: {
    width: '100%',
    padding: `8px 0 ${opptrixTokens.chatThreadScrollPadBottom}`,
    display: 'flex',
    flexDirection: 'column',
    gap: '5px',
    boxSizing: 'border-box',
  },
  contentColumnElectron: {
    paddingTop: '4px',
  },
  contentColumnMobile: {
    padding: `8px 0 ${opptrixTokens.chatThreadScrollPadBottomMobile}`,
    gap: '5px',
  },
  composerDock: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    pointerEvents: 'none',
    boxSizing: 'border-box',
  },
  composerInner: {
    position: 'relative',
    zIndex: 1,
    width: '100%',
    maxWidth: opptrixTokens.chatThreadMaxWidth,
    marginInline: 'auto',
    paddingInline: opptrixTokens.chatThreadPaddingX,
    paddingBottom: opptrixTokens.chatComposerBottomInset,
    boxSizing: 'border-box',
    pointerEvents: 'auto',
  },
  composerInnerMobile: {
    maxWidth: 'none',
    paddingInline: opptrixTokens.chatThreadPaddingXMobile,
    paddingBottom: `max(${opptrixTokens.chatComposerBottomInset}, env(safe-area-inset-bottom))`,
  },
  header: {
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    height: '40px',
    padding: 0,
    boxSizing: 'border-box',
    backgroundColor: opptrixCssVars.canvas,
    borderBottom: `1px solid ${opptrixCssVars.separatorStrong}`,
  },
  headerInner: {
    maxWidth: opptrixTokens.chatThreadMaxWidth,
    width: '100%',
    height: '100%',
    margin: '0 auto',
    minWidth: 0,
    paddingLeft: opptrixTokens.chatThreadPaddingX,
    paddingRight: opptrixTokens.chatThreadPaddingX,
    boxSizing: 'border-box',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '8px',
  },
  headerActions: {
    marginLeft: 'auto',
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    flexShrink: 0,
  },
  headerTitleSlot: {
    flex: '1 1 auto',
    minWidth: 0,
    maxWidth: '100%',
    display: 'flex',
    alignItems: 'center',
  },
  title: {
    fontSize: '14px',
    fontWeight: 500,
    letterSpacing: '-0.01em',
    color: opptrixCssVars.textPrimary,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  welcomeBanner: {
    alignSelf: 'center',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '10px',
    padding: '48px 24px 20px',
    textAlign: 'center',
    maxWidth: '440px',
  },
  welcomeBannerMobile: {
    padding: '32px 16px 12px',
  },
  welcomeEnter: {
    ...fadeInUp,
    animationDuration: '480ms',
    opacity: 0,
  },
  welcomeBrand: {
    display: 'inline-flex',
    alignItems: 'baseline',
    fontSize: '36px',
    fontWeight: 600,
    letterSpacing: '0.08em',
    lineHeight: 1,
    animationDelay: '0.35s',
  },
  welcomeBrandLetter: {
    display: 'inline-block',
    color: opptrixCssVars.textTertiary,
    animationName: {
      '0%, 100%': {
        color: opptrixCssVars.textTertiary,
        opacity: 0.45,
      },
      '35%': {
        color: opptrixCssVars.textPrimary,
        opacity: 1,
      },
      '55%': {
        color: opptrixCssVars.textSecondary,
        opacity: 0.78,
      },
    },
    animationDuration: '1.9s',
    animationTimingFunction: 'ease-in-out',
    animationIterationCount: 'infinite',
  },
  welcomeTitle: {
    fontSize: '17px',
    fontWeight: 650,
    letterSpacing: '-0.02em',
    color: opptrixCssVars.textPrimary,
    animationDelay: '0.55s',
  },
  welcomeSub: {
    fontSize: '14px',
    color: opptrixCssVars.textSecondary,
    lineHeight: 1.6,
    maxWidth: '36ch',
    animationDelay: '0.75s',
  },
  loadingRow: {
    alignSelf: 'stretch',
    padding: '4px 0 8px',
    ...fadeInUp,
  },
})

const WELCOME_LETTERS = ['O', 'p', 'p', 't', 'r', 'i', 'x'] as const
const WELCOME_LETTER_BASE_DELAY_S = 0.55

interface ChatViewProps {
  title?: string
  /** 顶栏标题区（可点击工具菜单）；未提供时使用纯文本 */
  titleSlot?: React.ReactNode
  sessionId?: string | null
  welcomeEpoch?: number
  chatScrollEpoch?: number
  messages: ChatDisplayMessage[]
  contextRef?: SessionContextRef | null
  input: string
  loading: boolean
  liveTrace?: ChatLiveTrace | null
  error: string
  availableModels?: AvailableModel[]
  sessionModel?: string
  isMobile?: boolean
  sidebarVisible?: boolean
  llmLabel?: string
  backendOk?: boolean
  onInputChange: (v: string) => void
  onSubmit: (text?: string) => void
  onStop?: () => void
  onForkMessage?: (messageIndex: number) => void
  onQuoteSelection?: (selection: MessageSelection) => void
  onEphemeralAsk?: (
    message: string,
    selection: MessageSelection,
    priorTurns: EphemeralAskTurn[],
  ) => Promise<string>
  onClearContextRef?: () => void
  onModelChange?: (ref: string) => void
  onOpenSidebar?: () => void
  onNewChat?: () => void
  onOpenSettings?: () => void
  onToggleSidebar?: () => void
  rightPanelOpen?: boolean
  onToggleRightPanel?: () => void
  chatColumnVisible?: boolean
  onToggleChatColumn?: () => void
  userPrompt?: ChatUserPromptPayload | null
  userPromptSubmitting?: boolean
  onUserPromptSubmit?: (answer: UserPromptAnswerPayload) => void
}

export default function ChatView({
  title = '新对话', titleSlot, sessionId = null, welcomeEpoch = 0, chatScrollEpoch = 0, messages, contextRef = null, input, loading, liveTrace = null, error,
  availableModels = [],
  sessionModel,
  isMobile = false,
  llmLabel = '',
  backendOk = false,
  onInputChange, onSubmit, onStop, onForkMessage, onQuoteSelection, onEphemeralAsk, onClearContextRef, onModelChange,
  onOpenSidebar, onNewChat, onOpenSettings,
  rightPanelOpen = false,
  onToggleRightPanel,
  chatColumnVisible = true,
  onToggleChatColumn,
  userPrompt = null,
  userPromptSubmitting = false,
  onUserPromptSubmit,
}: ChatViewProps) {
  const s = useStyles()
  const chatBoxRef = useRef<HTMLDivElement>(null)
  const bodyShellRef = useRef<HTMLDivElement>(null)
  const stickToBottomRef = useRef(true)
  const prevLoadingRef = useRef(false)
  const [scrollbarHalfOffset, setScrollbarHalfOffset] = useState(0)
  const [pinnedToolbar, setPinnedToolbar] = useState<{
    selection: MessageSelection
    anchor: MessageSelectionAnchor
  } | null>(null)
  const [toolbarExpanded, setToolbarExpanded] = useState(false)
  const toolbarExpandedRef = useRef(false)

  useEffect(() => {
    toolbarExpandedRef.current = toolbarExpanded
  }, [toolbarExpanded])

  const { selection, anchor, clearSelection } = useMessageSelection({
    rootRef: chatBoxRef,
    anchorRef: bodyShellRef,
    enabled: Boolean(sessionId) && !loading,
  })

  useEffect(() => {
    if (selection && anchor) {
      setPinnedToolbar({ selection, anchor })
    } else if (!toolbarExpanded) {
      setPinnedToolbar(null)
    }
  }, [selection, anchor, toolbarExpanded])

  const dismissToolbar = useCallback(() => {
    setPinnedToolbar(null)
    setToolbarExpanded(false)
    window.getSelection()?.removeAllRanges()
    clearSelection()
  }, [clearSelection])

  useEffect(() => {
    if (!pinnedToolbar) return

    const onSelectionChange = () => {
      window.setTimeout(() => {
        if (toolbarExpandedRef.current) return
        const sel = window.getSelection()
        const hasText = Boolean(sel && !sel.isCollapsed && sel.toString().trim())
        if (!hasText) {
          dismissToolbar()
        }
      }, 0)
    }

    document.addEventListener('selectionchange', onSelectionChange)
    return () => document.removeEventListener('selectionchange', onSelectionChange)
  }, [dismissToolbar, pinnedToolbar])

  useEffect(() => {
    if (!pinnedToolbar) return

    const onPointerDown = (e: Event) => {
      const target = e.target
      if (target instanceof Element && target.closest('[data-selection-toolbar]')) return
      dismissToolbar()
    }

    document.addEventListener('mousedown', onPointerDown, true)
    document.addEventListener('touchstart', onPointerDown, true)
    return () => {
      document.removeEventListener('mousedown', onPointerDown, true)
      document.removeEventListener('touchstart', onPointerDown, true)
    }
  }, [dismissToolbar, pinnedToolbar])

  const handleQuote = useCallback(() => {
    if (!pinnedToolbar || !onQuoteSelection) return
    onQuoteSelection(pinnedToolbar.selection)
    dismissToolbar()
  }, [dismissToolbar, onQuoteSelection, pinnedToolbar])

  const handleEphemeralAsk = useCallback((
    message: string,
    sel: MessageSelection,
    priorTurns: EphemeralAskTurn[],
  ) => {
    if (!onEphemeralAsk) return Promise.reject(new Error('无活动对话'))
    return onEphemeralAsk(message, sel, priorTurns)
  }, [onEphemeralAsk])

  const isEmpty = messages.length === 0 && !loading && !contextRef
  const welcome = pickWelcomeVariant(welcomeEpoch)
  const starters = isMobile ? welcome.starters.slice(0, 3) : welcome.starters
  const electronChrome = isElectron() && !isMobile

  const syncScrollbarHalfOffset = useCallback(() => {
    const el = chatBoxRef.current
    if (!el) return
    const hasScrollbar = el.scrollHeight > el.clientHeight + 1
    const gutter = Math.max(0, el.offsetWidth - el.clientWidth)
    setScrollbarHalfOffset(hasScrollbar && gutter > 0 ? gutter / 2 : 0)
  }, [])

  useEffect(() => {
    syncScrollbarHalfOffset()
    const el = chatBoxRef.current
    if (!el) return
    const observer = new ResizeObserver(() => syncScrollbarHalfOffset())
    observer.observe(el)
    return () => observer.disconnect()
  }, [syncScrollbarHalfOffset])

  useEffect(() => {
    if (!isEmpty) return
    const el = chatBoxRef.current
    if (el) el.scrollTop = 0
  }, [welcomeEpoch, isEmpty])

  useEffect(() => {
    syncScrollbarHalfOffset()
  }, [messages.length, loading, isMobile, syncScrollbarHalfOffset])

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'auto') => {
    const el = chatBoxRef.current
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior })
  }, [])

  const scrollToMessageStart = useCallback((messageIndex: number, behavior: ScrollBehavior = 'auto') => {
    const container = chatBoxRef.current
    if (!container) return
    const el = container.querySelector(`[data-message-index="${messageIndex}"]`)
    if (!(el instanceof HTMLElement)) return
    const containerRect = container.getBoundingClientRect()
    const elRect = el.getBoundingClientRect()
    const elTopInContainer = elRect.top - containerRect.top + container.scrollTop
    container.scrollTo({ top: Math.max(0, elTopInContainer - 12), behavior })
  }, [])

  const scrollMessageStartToCenter = useCallback((messageIndex: number) => {
    const container = chatBoxRef.current
    if (!container) return
    const el = container.querySelector(`[data-message-index="${messageIndex}"]`)
    if (!(el instanceof HTMLElement)) return
    const containerRect = container.getBoundingClientRect()
    const elRect = el.getBoundingClientRect()
    const elTopInContainer = elRect.top - containerRect.top + container.scrollTop
    const target = elTopInContainer - container.clientHeight / 2
    container.scrollTo({ top: Math.max(0, target), behavior: 'smooth' })
  }, [])

  const handleChatScroll = useCallback(() => {
    const el = chatBoxRef.current
    if (!el) return
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight
    stickToBottomRef.current = distance < 96
  }, [])

  useEffect(() => {
    if (loading || liveTrace) {
      if (stickToBottomRef.current) {
        scrollToBottom(messages.length <= 1 ? 'auto' : 'smooth')
      }
      prevLoadingRef.current = loading
      return
    }

    if (prevLoadingRef.current) {
      let idx = -1
      for (let i = messages.length - 1; i >= 0; i -= 1) {
        if (messages[i].role === 'assistant') {
          idx = i
          break
        }
      }
      if (idx >= 0) {
        window.requestAnimationFrame(() => {
          window.requestAnimationFrame(() => scrollMessageStartToCenter(idx))
        })
      }
    }

    prevLoadingRef.current = loading
  }, [messages, loading, liveTrace, scrollToBottom, scrollMessageStartToCenter])

  useEffect(() => {
    if (!chatScrollEpoch || !sessionId || loading || liveTrace || messages.length === 0) return
    const idx = messages.length - 1
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => scrollToMessageStart(idx, 'auto'))
    })
  }, [chatScrollEpoch, sessionId, loading, liveTrace, messages.length, scrollToMessageStart])

  const handleSubmit = (text?: string) => {
    stickToBottomRef.current = true
    onSubmit(text)
  }

  const threadColumnClass = mergeClasses(s.threadColumn, isMobile && s.threadColumnMobile)

  return (
    <div className={s.root}>
      {isMobile && onOpenSidebar && onNewChat && onOpenSettings && (
        <MobileTopBar
          title={title}
          llmLabel={llmLabel}
          backendOk={backendOk}
          availableModels={availableModels}
          sessionModel={sessionModel}
          onModelChange={onModelChange}
          onOpenDrawer={onOpenSidebar}
          onNewChat={onNewChat}
          onOpenSettings={onOpenSettings}
        />
      )}

      {!isMobile && !electronChrome && (
        <div className={s.header}>
          <div className={s.headerInner}>
            <div className={s.headerTitleSlot}>
              {titleSlot ?? <Text className={s.title}>{title || '新对话'}</Text>}
            </div>
            {!rightPanelOpen && (onToggleRightPanel || onToggleChatColumn) && (
              <div className={s.headerActions}>
                {onToggleChatColumn && (
                  <ChromeToolButton
                    label={chatColumnVisible ? '最大化右侧面板' : '恢复聊天区域'}
                    iconPadding={DESKTOP_SIDEBAR_TOOL_ICON_PADDING}
                    onClick={onToggleChatColumn}
                  >
                    {chatColumnVisible
                      ? <ArrowMaximizeRegular fontSize={DESKTOP_SIDEBAR_TOOL_ICON_SIZE} />
                      : <ArrowMinimizeRegular fontSize={DESKTOP_SIDEBAR_TOOL_ICON_SIZE} />}
                  </ChromeToolButton>
                )}
                {onToggleRightPanel && (
                  <ChromeToolButton
                    label="展开右侧面板"
                    iconPadding={DESKTOP_SIDEBAR_TOOL_ICON_PADDING}
                    onClick={onToggleRightPanel}
                  >
                    <PanelRightExpandRegular fontSize={DESKTOP_SIDEBAR_TOOL_ICON_SIZE} />
                  </ChromeToolButton>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      <div className={s.bodyShell} ref={bodyShellRef}>
        {pinnedToolbar && onQuoteSelection && onEphemeralAsk && (
          <MessageSelectionToolbar
            style={{
              top: pinnedToolbar.anchor.top,
              left: pinnedToolbar.anchor.left,
            }}
            selection={pinnedToolbar.selection}
            onQuote={handleQuote}
            onEphemeralAsk={handleEphemeralAsk}
            onDismiss={dismissToolbar}
            onExpandedChange={setToolbarExpanded}
          />
        )}

        <div
          ref={chatBoxRef}
          className={mergeClasses(s.scrollViewport, 'opptrix-scroll', 'opptrix-chat-scroll')}
          onScroll={handleChatScroll}
        >
          <div className={threadColumnClass}>
            <div
              className={mergeClasses(
                s.contentColumn,
                isMobile && s.contentColumnMobile,
                electronChrome && s.contentColumnElectron,
              )}
            >
              {isEmpty && (
                <div
                  key={`welcome-${welcomeEpoch}`}
                  className={mergeClasses(s.welcomeBanner, isMobile && s.welcomeBannerMobile)}
                >
                  <div className={mergeClasses(s.welcomeBrand, s.welcomeEnter)} aria-hidden>
                    {WELCOME_LETTERS.map((letter, index) => (
                      <span
                        key={`${letter}-${index}`}
                        className={s.welcomeBrandLetter}
                        style={{ animationDelay: `${WELCOME_LETTER_BASE_DELAY_S + index * 0.1}s` }}
                      >
                        {letter}
                      </span>
                    ))}
                  </div>
                  <Text className={mergeClasses(s.welcomeTitle, s.welcomeEnter)}>
                    {welcome.title}
                  </Text>
                  <Text className={mergeClasses(s.welcomeSub, s.welcomeEnter)}>
                    {welcome.subtitle}
                  </Text>
                </div>
              )}

              {messages.map((m, i) => (
                <ChatMessageItem
                  key={`${m.at}-${i}`}
                  message={m}
                  index={i}
                  isMobile={isMobile}
                  onFork={onForkMessage ? () => onForkMessage(i) : undefined}
                />
              ))}

              {loading && liveTrace && (
                <div className={s.loadingRow} data-message-role="assistant">
                  <ChatProcessTrace
                    steps={liveTrace.steps}
                    thinkingLabel={liveTrace.thinkingLabel}
                    thinkingSnippet={liveTrace.thinkingSnippet}
                    live
                  />
                </div>
              )}
              {loading && !liveTrace && (
                <div className={s.loadingRow}>
                  <ChatProcessTrace
                    steps={[]}
                    thinkingLabel="模型正在思考…"
                    live
                  />
                </div>
              )}
            </div>
          </div>
        </div>

        <div className={s.composerDock}>
          <div
            className={mergeClasses(s.composerInner, isMobile && s.composerInnerMobile)}
            style={scrollbarHalfOffset > 0
              ? { transform: `translateX(-${scrollbarHalfOffset}px)` }
              : undefined}
          >
            <ChatComposer
              input={input}
              loading={loading}
              error={error}
              isEmpty={isEmpty}
              isMobile={isMobile}
              contextRef={contextRef}
              starters={starters}
              welcomeKey={welcomeEpoch}
              availableModels={availableModels}
              sessionModel={sessionModel}
              onInputChange={onInputChange}
              onSubmit={handleSubmit}
              onStop={onStop}
              onModelChange={onModelChange}
              onClearContextRef={onClearContextRef}
              userPrompt={userPrompt}
              userPromptSubmitting={userPromptSubmitting}
              onUserPromptSubmit={onUserPromptSubmit}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
