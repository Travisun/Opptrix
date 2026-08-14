import { useRef, useEffect, useCallback, useState, useMemo, memo } from 'react'
import {
  Text, makeStyles, mergeClasses,
} from '@fluentui/react-components'
import type {
  ChatDisplayMessage, ChatContextUsage, EphemeralAskTurn, MessageSelection, SessionContextRef,
  AvailableModel, ChatAttachmentMeta, ComposerStarterChip, ExpertStarterPrompt, SessionLlmParams,
} from '../types/chat'
import type { SessionLlmParamsPatch } from './ModelSelector'
import type { ChatLiveTrace, ChatUserPromptPayload, UserPromptAnswerPayload } from '../types/chatProgress'
import { getExpert, submitUserPromptResponse } from '../api/client'
import type { ChatStreamUiRef } from './chatStreamUiBridge'
import type { SessionStreamSnapshot } from './sessionStreamRuntime'
import type { QueuedPrompt } from './sessionPromptQueue'
import MobileTopBar from './MobileTopBar'
import ChatComposer from './ChatComposer'
import type { ChatComposerHandle } from './ChatComposer'
import ChatMessageItem from './ChatMessageItem'
import ChatProcessTrace from './ChatProcessTrace'
import MessageSelectionToolbar from './MessageSelectionToolbar'
import { useMessageSelection, type MessageSelectionAnchor } from '../hooks/useMessageSelection'
import { opptrixTokens, opptrixCssVars } from '../theme/tokens'
import { fadeInUp } from '../theme/mixins'
import { isElectron } from '../platform/detect'
import { listRowKey } from '../utils/listRowKey'
import ChromeToolButton from '../desktop/ChromeToolButton'
import {
  PanelRightExpandRegular,
  ArrowMaximizeRegular,
  ArrowMinimizeRegular,
} from './chatIcons'
import { FolderListRegular } from '@fluentui/react-icons'
import {
  DESKTOP_SIDEBAR_TOOL_ICON_PADDING,
  DESKTOP_SIDEBAR_TOOL_ICON_SIZE,
  DESKTOP_TOOL_ICON_SIZE,
} from '../desktop/constants'
import { pickWelcomeVariant } from './chatWelcomeVariants'
import MessageOutlineRail, { buildOutlineEntries } from './MessageOutlineRail'

/** 消息区底 padding 初始/下限（ResizeObserver 测 composerInner 后覆盖） */
const CHAT_COMPOSER_BOTTOM_PAD = 100
/** Cursor `--agent-panel-scroll-fade-transparent-bottom-inset`：进入 composer 占位后的淡出带 */
const COMPOSER_SCROLL_FADE_PX = 38

/** Cursor 式多层 mask：内容区底部淡出；右侧 scrollbar 条带全程不透明 */
function composerScrollMask(
  overlayHeightPx: number,
  scrollbarPreservePx: number,
): {
  maskImage: string
  maskSize: string
  maskPosition: string
  maskRepeat: string
} {
  const pad = Math.max(0, overlayHeightPx)
  const fadeEnd = Math.max(0, pad - COMPOSER_SCROLL_FADE_PX)
  const preserve = Math.max(0, scrollbarPreservePx)
  const contentFade = [
    'linear-gradient(to bottom,',
    '#000 0,',
    `#000 calc(100% - ${pad}px),`,
    `transparent calc(100% - ${fadeEnd}px),`,
    'transparent 100%)',
  ].join(' ')
  return {
    maskImage: [
      'linear-gradient(#000, #000)',
      contentFade,
      'linear-gradient(#000, #000)',
    ].join(', '),
    maskSize: `0 100%, calc(100% - ${preserve}px) 100%, ${preserve}px 100%`,
    maskPosition: 'left top, left top, right top',
    maskRepeat: 'no-repeat',
  }
}

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
  /** Electron: let `.opptrix-app-main` / chat-panel tint show through. */
  rootElectron: {
    backgroundColor: 'transparent',
  },
  bodyShell: {
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
    minHeight: 0,
    overflow: 'hidden',
  },
  /** Thread scroll + composer dock; symmetric paddingX inside thread/composer columns. */
  mainStack: {
    position: 'relative',
    display: 'flex',
    flexDirection: 'column',
    flex: 1,
    minWidth: 0,
    minHeight: 0,
    overflow: 'hidden',
  },
  bodyShellDragging: {
    outline: `1.5px dashed ${opptrixCssVars.borderStrong}`,
    outlineOffset: '-6px',
    backgroundColor: 'color-mix(in srgb, var(--opptrix-canvas-alt) 55%, transparent)',
  },
  /**
   * 占满 bodyShell；消息可滚到浮层输入卡下方。
   * 底部淡出 mask 由 inline style 按 `--opptrix-composer-overlay-height` / pad 联动。
   */
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
    paddingLeft: opptrixTokens.chatThreadPaddingX,
    paddingRight: opptrixTokens.chatThreadPaddingX,
    boxSizing: 'border-box',
  },
  threadColumnMobile: {
    maxWidth: 'none',
    paddingLeft: opptrixTokens.chatThreadPaddingXMobile,
    paddingRight: opptrixTokens.chatThreadPaddingXMobile,
  },
  /** Fill the scroll viewport so empty-state welcome can sit on the Y center. */
  threadColumnEmpty: {
    minHeight: '100%',
    display: 'flex',
    flexDirection: 'column',
  },
  contentColumn: {
    width: '100%',
    paddingTop: '8px',
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    boxSizing: 'border-box',
  },
  contentColumnElectron: {
    paddingTop: '4px',
  },
  contentColumnMobile: {
    paddingTop: '8px',
    gap: '10px',
  },
  contentColumnEmpty: {
    flex: 1,
    minHeight: '100%',
    justifyContent: 'center',
    paddingTop: 0,
  },
  /** 浮层 dock：透明底盘（与主区同色/透底）；消息淡出靠 scroll mask；输入卡 panel 实色 */
  composerDock: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 10,
    pointerEvents: 'none',
    boxSizing: 'border-box',
    backgroundColor: 'transparent',
  },
  composerInner: {
    position: 'relative',
    zIndex: 1,
    width: '100%',
    maxWidth: opptrixTokens.chatThreadMaxWidth,
    marginInline: 'auto',
    paddingLeft: opptrixTokens.chatThreadPaddingX,
    paddingRight: opptrixTokens.chatThreadPaddingX,
    /* bottomInset 由 ChatComposer.composerFooter 承担；消息淡出由 scrollViewport mask */
    paddingBottom: 0,
    boxSizing: 'border-box',
    pointerEvents: 'auto',
    backgroundColor: 'transparent',
  },
  composerInnerMobile: {
    maxWidth: 'none',
    paddingLeft: opptrixTokens.chatThreadPaddingXMobile,
    paddingRight: opptrixTokens.chatThreadPaddingXMobile,
  },
  header: {
    flexShrink: 0,
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'stretch',
    height: '40px',
    padding: 0,
    boxSizing: 'border-box',
    backgroundColor: opptrixCssVars.canvas,
    borderBottom: `1px solid ${opptrixCssVars.separatorHairline}`,
  },
  headerMain: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    alignItems: 'center',
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
    fontSize: 'var(--opptrix-font-lg)',
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
    padding: '20px 24px',
    textAlign: 'center',
    width: '100%',
    maxWidth: 'min(80vw, 100%)',
    boxSizing: 'border-box',
  },
  welcomeBannerMobile: {
    padding: '16px 16px',
  },
  welcomeEnter: {
    ...fadeInUp,
    animationDuration: '480ms',
    opacity: 0,
  },
  welcomeBrand: {
    display: 'inline-flex',
    alignItems: 'baseline',
    fontSize: 'var(--opptrix-font-display)',
    fontWeight: 600,
    letterSpacing: '0.08em',
    lineHeight: 1,
    animationDelay: '0.35s',
  },
  welcomeBrandExpert: {
    letterSpacing: '0.04em',
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
    fontSize: 'var(--opptrix-font-2xl)',
    fontWeight: 650,
    letterSpacing: '-0.02em',
    color: opptrixCssVars.textPrimary,
    animationDelay: '0.55s',
  },
  welcomeSub: {
    fontSize: 'var(--opptrix-font-lg)',
    color: opptrixCssVars.textSecondary,
    lineHeight: 1.6,
    maxWidth: '100%',
    animationDelay: '0.75s',
  },
  loadingRow: {
    alignSelf: 'stretch',
    padding: '4px 0 8px',
    ...fadeInUp,
  },
  contextHint: {
    flexShrink: 0,
    margin: '0 auto',
    width: '100%',
    maxWidth: opptrixTokens.chatThreadMaxWidth,
    padding: '8px 16px',
    boxSizing: 'border-box',
    fontSize: 'var(--opptrix-font-sm)',
    lineHeight: 1.45,
    color: opptrixCssVars.textSecondary,
    backgroundColor: opptrixCssVars.canvasAlt,
    borderBottom: `1px solid ${opptrixCssVars.separator}`,
    ...fadeInUp,
    animationDuration: '280ms',
  },
})

const WELCOME_LETTERS = ['O', 'p', 'p', 't', 'r', 'i', 'x'] as const
/** 专家空会话：替换顶部 Opptrix 逐字动画 */
const WELCOME_EXPERT_LETTERS = Array.from('Opptrix 专家')
const WELCOME_LETTER_BASE_DELAY_S = 0.55

interface ChatViewProps {
  title?: string
  /** 顶栏标题区（可点击工具菜单）；未提供时使用纯文本 */
  titleSlot?: React.ReactNode
  /** Web 顶栏右侧额外操作（如技能专长） */
  headerTrailing?: React.ReactNode
  /** 聊天区顶部浮层（如技能专长抽屉） */
  overlaySlot?: React.ReactNode
  /** 上下文整理轻提示 */
  contextHint?: string
  sessionId?: string | null
  /** 绑定专家时切换欢迎文案，并常驻展示快捷提问 */
  expertId?: string | null
  /** 编辑专家保存后递增，驱动重新拉取定义 */
  expertRefreshKey?: number
  welcomeEpoch?: number
  chatScrollEpoch?: number
  messages: ChatDisplayMessage[]
  contextRef?: SessionContextRef | null
  composerDraft?: { revision: number; text: string }
  loading: boolean
  /** schedule_turn_wake 等待期：显示动态倒计时过程条，不占用「停止」态 */
  wakeWaiting?: boolean
  streamUiRef?: ChatStreamUiRef
  error: string
  availableModels?: AvailableModel[]
  sessionModel?: string
  sessionLlmParams?: SessionLlmParams | null
  contextUsage?: ChatContextUsage | null
  isMobile?: boolean
  sidebarVisible?: boolean
  llmLabel?: string
  backendOk?: boolean
  onSubmit: (text?: string, attachmentIds?: string[], attachmentMetas?: ChatAttachmentMeta[]) => void
  onStop?: () => void
  promptQueue?: QueuedPrompt[]
  onPromptQueueRemove?: (id: string) => void
  onPromptQueueRunNow?: (id: string) => void
  onForkMessage?: (messageIndex: number) => void
  onEditResend?: (messageIndex: number, text: string) => void
  ensureSession?: () => Promise<string>
  onQuoteSelection?: (selection: MessageSelection) => void
  onEphemeralAsk?: (
    message: string,
    selection: MessageSelection,
    priorTurns: EphemeralAskTurn[],
  ) => Promise<string>
  onClearContextRef?: () => void
  onModelChange?: (ref: string) => void
  onLlmParamsChange?: (patch: SessionLlmParamsPatch) => void
  onOpenSidebar?: () => void
  onNewChat?: () => void
  onOpenSettings?: () => void
  onToggleSidebar?: () => void
  rightPanelOpen?: boolean
  onToggleRightPanel?: () => void
  onOpenFilePreview?: (sessionId: string, attachment: ChatAttachmentMeta) => void
  chatColumnVisible?: boolean
  onToggleChatColumn?: () => void
  onStreamError?: (message: string) => void
  resolveStreamSnapshot?: (sessionId: string | null) => SessionStreamSnapshot | null
  onClearPendingUserPrompt?: (sessionId: string | null) => void
  /** 本对话文件预览（状态由 ChatApp 持有；Electron 在 chrome titleBarTrailing；Web 在 headerActions） */
  sessionFilesPreviewOpen?: boolean
  onToggleSessionFilesPreview?: () => void
}

function ChatView({
  title = '新对话', titleSlot, headerTrailing, overlaySlot, contextHint, sessionId = null, expertId = null, expertRefreshKey = 0, welcomeEpoch = 0, chatScrollEpoch = 0, messages, contextRef = null, composerDraft, loading, wakeWaiting = false, streamUiRef, error,
  availableModels = [],
  sessionModel,
  sessionLlmParams,
  contextUsage = null,
  isMobile = false,
  llmLabel = '',
  backendOk = false,
  onSubmit, onStop, promptQueue = [], onPromptQueueRemove, onPromptQueueRunNow, onForkMessage, onEditResend, onQuoteSelection, onEphemeralAsk, onClearContextRef, onModelChange, onLlmParamsChange,
  ensureSession,
  onOpenSidebar, onNewChat, onOpenSettings,
  rightPanelOpen = false,
  onToggleRightPanel,
  onOpenFilePreview,
  chatColumnVisible = true,
  onToggleChatColumn,
  onStreamError,
  resolveStreamSnapshot,
  onClearPendingUserPrompt,
  sessionFilesPreviewOpen = false,
  onToggleSessionFilesPreview,
}: ChatViewProps) {
  const s = useStyles()
  const [liveTrace, setLiveTrace] = useState<ChatLiveTrace | null>(null)
  const [pendingUserPrompt, setPendingUserPrompt] = useState<ChatUserPromptPayload | null>(null)
  const [userPromptSubmitting, setUserPromptSubmitting] = useState(false)
  const [expertSummary, setExpertSummary] = useState<string | null>(null)
  const [expertStarters, setExpertStarters] = useState<ExpertStarterPrompt[] | null>(null)
  const expertStartersCacheRef = useRef(new Map<string, {
    summary: string
    starters: ExpertStarterPrompt[]
  }>())
  const pendingUserPromptRef = useRef(pendingUserPrompt)
  const userPromptSubmittingRef = useRef(userPromptSubmitting)
  pendingUserPromptRef.current = pendingUserPrompt
  userPromptSubmittingRef.current = userPromptSubmitting

  useEffect(() => {
    const snapshot = resolveStreamSnapshot?.(sessionId) ?? null
    if (snapshot) {
      setLiveTrace(snapshot.liveTrace)
      setPendingUserPrompt(snapshot.pendingUserPrompt)
      setUserPromptSubmitting(snapshot.userPromptSubmitting)
      return
    }
    setLiveTrace(null)
    setPendingUserPrompt(null)
    setUserPromptSubmitting(false)
  }, [sessionId, resolveStreamSnapshot])

  useEffect(() => {
    if (!streamUiRef) return undefined
    streamUiRef.current = {
      setLiveTrace,
      setPendingUserPrompt,
      setUserPromptSubmitting,
      readPendingUserPrompt: () => pendingUserPromptRef.current,
      readUserPromptSubmitting: () => userPromptSubmittingRef.current,
      resetStreamUi: () => {
        setLiveTrace(null)
        setPendingUserPrompt(null)
        setUserPromptSubmitting(false)
      },
    }
    return () => {
      streamUiRef.current = null
    }
  }, [streamUiRef])

  const dismissPendingUserPrompt = useCallback(() => {
    setPendingUserPrompt(null)
    onClearPendingUserPrompt?.(sessionId)
  }, [onClearPendingUserPrompt, sessionId])

  const handleUserPromptSubmit = useCallback(async (answer: UserPromptAnswerPayload) => {
    const sid = sessionId
    const prompt = pendingUserPromptRef.current
    if (!sid || !prompt || userPromptSubmittingRef.current) return
    setUserPromptSubmitting(true)
    onStreamError?.('')
    try {
      await submitUserPromptResponse(sid, prompt.id, answer)
      dismissPendingUserPrompt()
    } catch (e) {
      dismissPendingUserPrompt()
      onStreamError?.(e instanceof Error ? e.message : '提交失败，请重试')
    } finally {
      setUserPromptSubmitting(false)
    }
  }, [dismissPendingUserPrompt, onStreamError, sessionId])
  const chatBoxRef = useRef<HTMLDivElement>(null)
  const bodyShellRef = useRef<HTMLDivElement>(null)
  const composerInnerRef = useRef<HTMLDivElement>(null)
  const composerRef = useRef<ChatComposerHandle>(null)
  const fileDragDepthRef = useRef(0)
  const [isDraggingFiles, setIsDraggingFiles] = useState(false)
  const stickToBottomRef = useRef(true)
  const prevLoadingRef = useRef(false)
  const [scrollbarHalfOffset, setScrollbarHalfOffset] = useState(0)
  /** 右侧 mask 保留条带宽度（有滚动条时用实测 gutter，至少 6px） */
  const [scrollbarMaskPreserve, setScrollbarMaskPreserve] = useState(0)
  const [composerBottomPad, setComposerBottomPad] = useState(CHAT_COMPOSER_BOTTOM_PAD)
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
    enabled: Boolean(sessionId) && !loading && !wakeWaiting,
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

  const isEmpty = messages.length === 0 && !loading && !wakeWaiting && !contextRef
  const welcome = pickWelcomeVariant(welcomeEpoch)
  const isExpertSession = Boolean(expertId)

  useEffect(() => {
    if (!expertId) {
      setExpertSummary(null)
      setExpertStarters(null)
      return
    }
    const cached = expertStartersCacheRef.current.get(expertId)
    if (cached) {
      setExpertSummary(cached.summary)
      setExpertStarters(cached.starters)
    } else {
      setExpertStarters(null)
    }
    let cancelled = false
    void getExpert(expertId)
      .then(({ expert }) => {
        if (cancelled) return
        const starters = expert.starterPrompts?.length ? expert.starterPrompts : []
        expertStartersCacheRef.current.set(expertId, {
          summary: expert.summary,
          starters,
        })
        setExpertSummary(expert.summary)
        setExpertStarters(starters)
      })
      .catch(() => {
        if (cancelled) return
        if (!cached) {
          setExpertSummary(null)
          setExpertStarters([])
        }
      })
    return () => { cancelled = true }
  }, [expertId, expertRefreshKey])

  const globalStarters: ComposerStarterChip[] = welcome.starters.map(text => ({ label: text, text }))
  const expertChipStarters: ComposerStarterChip[] = (expertStarters ?? []).map(p => ({
    label: p.title || p.content,
    text: p.content,
  }))
  // 专家会话：加载中不闪全局 chips；无专家提示时再回退全局
  const starterSource: ComposerStarterChip[] = !isExpertSession
    ? globalStarters
    : expertStarters === null
      ? []
      : expertChipStarters.length > 0
        ? expertChipStarters
        : globalStarters
  const starters = isMobile ? starterSource.slice(0, 3) : starterSource
  const brandLetters = isExpertSession ? WELCOME_EXPERT_LETTERS : [...WELCOME_LETTERS]
  const welcomeTitle = isExpertSession ? '专家可以帮你干点什么？' : welcome.title
  const welcomeSubtitle = isExpertSession
    ? (expertSummary ?? '')
    : welcome.subtitle
  const electronChrome = isElectron() && !isMobile
  const scrollMask = composerScrollMask(composerBottomPad, scrollbarMaskPreserve)
  const showDesktopChromeExtras = !isMobile
  const outlineEntries = useMemo(
    () => (showDesktopChromeExtras ? buildOutlineEntries(messages) : []),
    [messages, showDesktopChromeExtras],
  )
  const showOutlineRail = showDesktopChromeExtras && outlineEntries.length > 0
  const sessionFilesToggle = showDesktopChromeExtras && onToggleSessionFilesPreview ? (
    <ChromeToolButton
      label="文件预览"
      active={sessionFilesPreviewOpen}
      disabled={!sessionId}
      data-session-files-toggle
      onClick={onToggleSessionFilesPreview}
    >
      <FolderListRegular fontSize={DESKTOP_TOOL_ICON_SIZE} />
    </ChromeToolButton>
  ) : null

  const syncScrollbarHalfOffset = useCallback(() => {
    const el = chatBoxRef.current
    if (!el) return
    const hasScrollbar = el.scrollHeight > el.clientHeight + 1
    const gutter = Math.max(0, el.offsetWidth - el.clientWidth)
    setScrollbarHalfOffset(hasScrollbar && gutter > 0 ? gutter / 2 : 0)
    // overlay 滚动条 gutter 可能为 0；仍保留至少 6px（.opptrix-chat-scroll width）
    setScrollbarMaskPreserve(hasScrollbar ? Math.max(gutter, 6) : 0)
  }, [])

  useEffect(() => {
    syncScrollbarHalfOffset()
    const el = chatBoxRef.current
    if (!el) return
    const observer = new ResizeObserver(() => syncScrollbarHalfOffset())
    observer.observe(el)
    return () => observer.disconnect()
  }, [syncScrollbarHalfOffset])

  const syncComposerBottomPad = useCallback(() => {
    const el = composerInnerRef.current
    if (!el) return
    const next = Math.max(CHAT_COMPOSER_BOTTOM_PAD, el.offsetHeight)
    setComposerBottomPad(prev => (prev === next ? prev : next))
  }, [])

  useEffect(() => {
    syncComposerBottomPad()
    const el = composerInnerRef.current
    if (!el) return
    const observer = new ResizeObserver(() => syncComposerBottomPad())
    observer.observe(el)
    return () => observer.disconnect()
  }, [syncComposerBottomPad])

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
    if (loading || wakeWaiting || liveTrace) {
      if (stickToBottomRef.current) {
        scrollToBottom(messages.length <= 1 ? 'auto' : 'smooth')
      }
      prevLoadingRef.current = loading || wakeWaiting
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

    prevLoadingRef.current = loading || wakeWaiting
  }, [messages, loading, wakeWaiting, liveTrace, scrollToBottom, scrollMessageStartToCenter])

  useEffect(() => {
    if (!chatScrollEpoch || !sessionId || loading || wakeWaiting || liveTrace || messages.length === 0) return
    const idx = messages.length - 1
    window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => scrollToMessageStart(idx, 'auto'))
    })
  }, [chatScrollEpoch, sessionId, loading, wakeWaiting, liveTrace, messages.length, scrollToMessageStart])

  const handleSubmit = (text?: string, attachmentIds?: string[], attachmentMetas?: ChatAttachmentMeta[]) => {
    stickToBottomRef.current = true
    onSubmit(text, attachmentIds, attachmentMetas)
  }

  const isFileDrag = (e: React.DragEvent) =>
    Array.from(e.dataTransfer.types).includes('Files')

  const handleBodyDragEnter = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    if (!isFileDrag(e)) return
    e.preventDefault()
    fileDragDepthRef.current += 1
    setIsDraggingFiles(true)
  }, [])

  const handleBodyDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    if (!isFileDrag(e)) return
    fileDragDepthRef.current = Math.max(0, fileDragDepthRef.current - 1)
    if (fileDragDepthRef.current === 0) setIsDraggingFiles(false)
  }, [])

  const handleBodyDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    if (!isFileDrag(e)) return
    e.preventDefault()
    e.dataTransfer.dropEffect = 'copy'
  }, [])

  const handleBodyDrop = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    fileDragDepthRef.current = 0
    setIsDraggingFiles(false)
    if (e.dataTransfer.files?.length) {
      composerRef.current?.addDroppedFiles(e.dataTransfer.files)
    }
  }, [])

  const threadColumnClass = mergeClasses(
    s.threadColumn,
    isMobile && s.threadColumnMobile,
    isEmpty && s.threadColumnEmpty,
  )

  return (
    <div className={mergeClasses(s.root, electronChrome && s.rootElectron)}>
      {isMobile && onOpenSidebar && onNewChat && onOpenSettings && (
        <MobileTopBar
          title={title}
          llmLabel={llmLabel}
          backendOk={backendOk}
          availableModels={availableModels}
          sessionModel={sessionModel}
          sessionLlmParams={sessionLlmParams}
          onModelChange={onModelChange}
          onLlmParamsChange={onLlmParamsChange}
          onOpenDrawer={onOpenSidebar}
          onNewChat={onNewChat}
          onOpenSettings={onOpenSettings}
        />
      )}

      {!isMobile && !electronChrome && (
        <div className={s.header}>
          <div className={s.headerMain}>
            <div className={s.headerInner}>
              <div className={s.headerTitleSlot}>
                {titleSlot ?? <Text className={s.title}>{title || '新对话'}</Text>}
              </div>
              {(sessionFilesToggle || headerTrailing || (!rightPanelOpen && (onToggleRightPanel || onToggleChatColumn))) && (
                <div className={s.headerActions}>
                  {sessionFilesToggle}
                  {headerTrailing}
                  {!rightPanelOpen && onToggleChatColumn && (
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
                  {!rightPanelOpen && onToggleRightPanel && (
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
        </div>
      )}

      {contextHint ? (
        <div className={s.contextHint} role="status">
          {contextHint}
        </div>
      ) : null}

      <div
        className={mergeClasses(s.bodyShell, isDraggingFiles && s.bodyShellDragging)}
        ref={bodyShellRef}
        onDragEnter={handleBodyDragEnter}
        onDragLeave={handleBodyDragLeave}
        onDragOver={handleBodyDragOver}
        onDrop={handleBodyDrop}
      >
        {overlaySlot}
        {pinnedToolbar && onQuoteSelection && onEphemeralAsk && (
          <MessageSelectionToolbar
            style={{
              top: pinnedToolbar.anchor.top,
              left: pinnedToolbar.anchor.left,
            }}
            sessionId={sessionId}
            selection={pinnedToolbar.selection}
            onQuote={handleQuote}
            onEphemeralAsk={handleEphemeralAsk}
            onDismiss={dismissToolbar}
            onExpandedChange={setToolbarExpanded}
          />
        )}

        <div className={s.mainStack}>
        {showOutlineRail ? (
          <MessageOutlineRail
            messages={messages}
            scrollContainerRef={chatBoxRef}
            onJump={index => scrollToMessageStart(index, 'smooth')}
          />
        ) : null}
        <div
          ref={chatBoxRef}
          className={mergeClasses(s.scrollViewport, 'opptrix-scroll', 'opptrix-chat-scroll')}
          style={{
            '--opptrix-composer-overlay-height': `${composerBottomPad}px`,
            maskImage: scrollMask.maskImage,
            WebkitMaskImage: scrollMask.maskImage,
            maskSize: scrollMask.maskSize,
            WebkitMaskSize: scrollMask.maskSize,
            maskPosition: scrollMask.maskPosition,
            WebkitMaskPosition: scrollMask.maskPosition,
            maskRepeat: scrollMask.maskRepeat,
            WebkitMaskRepeat: scrollMask.maskRepeat,
          } as React.CSSProperties}
          onScroll={handleChatScroll}
        >
          <div className={threadColumnClass}>
            <div
              className={mergeClasses(
                s.contentColumn,
                isMobile && s.contentColumnMobile,
                electronChrome && s.contentColumnElectron,
                isEmpty && s.contentColumnEmpty,
              )}
              style={{ paddingBottom: composerBottomPad }}
            >
              {isEmpty && (
                <div
                  key={welcomeEpoch}
                  className={mergeClasses(s.welcomeBanner, isMobile && s.welcomeBannerMobile)}
                >
                  <div
                    className={mergeClasses(
                      s.welcomeBrand,
                      isExpertSession && s.welcomeBrandExpert,
                      s.welcomeEnter,
                    )}
                    aria-hidden
                  >
                    {brandLetters.map((letter, index) => (
                      <span
                        key={`${letter}-${index}`}
                        className={s.welcomeBrandLetter}
                        style={{
                          animationDelay: `${WELCOME_LETTER_BASE_DELAY_S + index * 0.08}s`,
                          ...(letter === ' ' ? { width: '0.32em' } : null),
                        }}
                      >
                        {letter === ' ' ? '\u00A0' : letter}
                      </span>
                    ))}
                  </div>
                  <Text className={mergeClasses(s.welcomeTitle, s.welcomeEnter)}>
                    {welcomeTitle}
                  </Text>
                  {welcomeSubtitle ? (
                    <Text className={mergeClasses(s.welcomeSub, s.welcomeEnter)}>
                      {welcomeSubtitle}
                    </Text>
                  ) : null}
                </div>
              )}

              {messages.map((m, i) => (
                <ChatMessageItem
                  key={listRowKey(i, m.at, m.role)}
                  message={m}
                  index={i}
                  sessionId={sessionId}
                  isMobile={isMobile}
                  editDisabled={loading}
                  onFork={onForkMessage ? () => onForkMessage(i) : undefined}
                  onEditResend={onEditResend}
                  onOpenPreview={onOpenFilePreview}
                />
              ))}

              {((loading || wakeWaiting) && liveTrace) && (
                <div className={s.loadingRow} data-message-role="assistant">
                  <ChatProcessTrace
                    steps={liveTrace.steps}
                    thinkingLabel={liveTrace.thinkingLabel}
                    phaseLabel={liveTrace.phaseLabel}
                    estimatedTokens={liveTrace.estimatedTokens}
                    thinkingSnippet={liveTrace.thinkingSnippet}
                    thinkingSegments={liveTrace.thinkingSegments}
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
            ref={composerInnerRef}
            className={mergeClasses(s.composerInner, isMobile && s.composerInnerMobile)}
            style={scrollbarHalfOffset > 0
              ? { transform: `translateX(-${scrollbarHalfOffset}px)` }
              : undefined}
          >
            <ChatComposer
              ref={composerRef}
              sessionId={sessionId}
              draftSync={composerDraft}
              loading={loading}
              error={error}
              isEmpty={isEmpty}
              alwaysShowStarters={isExpertSession}
              isMobile={isMobile}
              contextRef={contextRef}
              starters={starters}
              welcomeKey={welcomeEpoch}
              availableModels={availableModels}
              sessionModel={sessionModel}
              sessionLlmParams={sessionLlmParams}
              contextUsage={contextUsage}
              onSubmit={handleSubmit}
              onStop={onStop}
              onModelChange={onModelChange}
              onLlmParamsChange={onLlmParamsChange}
              onClearContextRef={onClearContextRef}
              ensureSession={ensureSession}
              userPrompt={pendingUserPrompt}
              userPromptSubmitting={userPromptSubmitting}
              onUserPromptSubmit={pendingUserPrompt ? handleUserPromptSubmit : undefined}
              promptQueue={promptQueue}
              onPromptQueueRemove={onPromptQueueRemove}
              onPromptQueueRunNow={onPromptQueueRunNow}
              onOpenPreview={onOpenFilePreview}
            />
          </div>
        </div>
        </div>
      </div>
    </div>
  )
}

export default memo(ChatView)
