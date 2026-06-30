import { useRef, useEffect, useCallback, useState } from 'react'
import {
  Text, makeStyles, mergeClasses,
} from '@fluentui/react-components'
import { BotRegular } from '@fluentui/react-icons'
import type {
  ChatDisplayMessage, EphemeralAskTurn, MessageSelection, SessionContextRef,
  AvailableModel,
} from '../types/chat'
import type { ChatLiveTrace } from '../types/chatProgress'
import MobileTopBar from './MobileTopBar'
import ChatComposer from './ChatComposer'
import ChatMessageItem from './ChatMessageItem'
import ChatProcessTrace from './ChatProcessTrace'
import MessageSelectionToolbar from './MessageSelectionToolbar'
import { useMessageSelection, type MessageSelectionAnchor } from '../hooks/useMessageSelection'
import { opptrixTokens } from '../theme/tokens'
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

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    minWidth: 0,
    backgroundColor: opptrixTokens.canvas,
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
    backgroundColor: opptrixTokens.canvas,
    borderBottom: `1px solid ${opptrixTokens.separatorStrong}`,
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
  title: {
    fontSize: '14px',
    fontWeight: 500,
    letterSpacing: '-0.01em',
    color: opptrixTokens.textPrimary,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  welcomeBanner: {
    alignSelf: 'center',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '12px',
    padding: '48px 24px 24px',
    textAlign: 'center',
    maxWidth: '420px',
    ...fadeInUp,
  },
  welcomeBannerMobile: {
    padding: '32px 16px 16px',
  },
  welcomeIconWrap: {
    width: '44px',
    height: '44px',
    borderRadius: opptrixTokens.radiusLg,
    backgroundColor: opptrixTokens.canvasAlt,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  welcomeIcon: {
    fontSize: '22px',
    color: opptrixTokens.textSecondary,
  },
  welcomeTitle: {
    fontSize: '16px',
    fontWeight: 650,
    letterSpacing: '-0.02em',
    color: opptrixTokens.textPrimary,
  },
  welcomeSub: {
    fontSize: '13px',
    color: opptrixTokens.textTertiary,
    lineHeight: 1.55,
  },
  loadingRow: {
    alignSelf: 'stretch',
    padding: '4px 0 8px',
    ...fadeInUp,
  },
})

const STARTERS = [
  '帮我全面诊断贵州茅台(600519)',
  '筛选 ROE>15 且负债率<50 的股票',
  '生成今日 A 股收盘市场报告',
  '半导体产业链有哪些代表公司？',
]

const MOBILE_STARTERS = STARTERS.slice(0, 3)

interface ChatViewProps {
  title?: string
  sessionId?: string | null
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
}

export default function ChatView({
  title = '新对话', sessionId = null, messages, contextRef = null, input, loading, liveTrace = null, error,
  availableModels = [],
  sessionModel,
  isMobile = false,
  llmLabel = '',
  backendOk = false,
  onInputChange, onSubmit, onForkMessage, onQuoteSelection, onEphemeralAsk, onClearContextRef, onModelChange,
  onOpenSidebar, onNewChat, onOpenSettings,
  rightPanelOpen = false,
  onToggleRightPanel,
  chatColumnVisible = true,
  onToggleChatColumn,
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
    syncScrollbarHalfOffset()
  }, [messages.length, loading, isMobile, syncScrollbarHalfOffset])

  const scrollToBottom = useCallback((behavior: ScrollBehavior = 'auto') => {
    const el = chatBoxRef.current
    if (!el) return
    el.scrollTo({ top: el.scrollHeight, behavior })
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

  const handleSubmit = (text?: string) => {
    stickToBottomRef.current = true
    onSubmit(text)
  }

  const starters = isMobile ? MOBILE_STARTERS : STARTERS
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
            <Text className={s.title}>{title || '新对话'}</Text>
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
                <div className={mergeClasses(s.welcomeBanner, isMobile && s.welcomeBannerMobile)}>
                  <div className={s.welcomeIconWrap}>
                    <BotRegular className={s.welcomeIcon} />
                  </div>
                  <Text className={s.welcomeTitle}>有什么可以帮你？</Text>
                  <Text className={s.welcomeSub}>
                    投研问答 · Markdown · LaTeX · Mermaid
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
              availableModels={availableModels}
              sessionModel={sessionModel}
              onInputChange={onInputChange}
              onSubmit={handleSubmit}
              onModelChange={onModelChange}
              onClearContextRef={onClearContextRef}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
