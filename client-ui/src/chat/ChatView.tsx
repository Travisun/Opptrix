import { useRef, useEffect, useCallback, useState } from 'react'
import {
  Text, Spinner, Badge, makeStyles, mergeClasses,
} from '@fluentui/react-components'
import { BotRegular } from '@fluentui/react-icons'
import type { ChatDisplayMessage, SkillCategory, AvailableModel } from '../types/chat'
import SkillSheet from './SkillSheet'
import MobileTopBar from './MobileTopBar'
import ChatComposer from './ChatComposer'
import MarkdownMessage from './MarkdownMessage'
import { innoTokens } from '../theme/tokens'
import { fadeInUp } from '../theme/mixins'
import { isElectron } from '../platform/detect'

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    minWidth: 0,
    backgroundColor: innoTokens.canvas,
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
    maxWidth: innoTokens.chatThreadMaxWidth,
    marginInline: 'auto',
    paddingInline: innoTokens.chatThreadPaddingX,
    boxSizing: 'border-box',
  },
  threadColumnMobile: {
    maxWidth: 'none',
    paddingInline: innoTokens.chatThreadPaddingXMobile,
  },
  contentColumn: {
    width: '100%',
    padding: `8px 0 ${innoTokens.chatThreadScrollPadBottom}`,
    display: 'flex',
    flexDirection: 'column',
    gap: '20px',
    boxSizing: 'border-box',
  },
  contentColumnElectron: {
    paddingTop: '4px',
  },
  contentColumnMobile: {
    padding: `8px 0 ${innoTokens.chatThreadScrollPadBottomMobile}`,
    gap: '16px',
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
    maxWidth: innoTokens.chatThreadMaxWidth,
    marginInline: 'auto',
    paddingInline: innoTokens.chatThreadPaddingX,
    paddingBottom: innoTokens.chatComposerBottomInset,
    boxSizing: 'border-box',
    pointerEvents: 'auto',
  },
  composerInnerMobile: {
    maxWidth: 'none',
    paddingInline: innoTokens.chatThreadPaddingXMobile,
    paddingBottom: `max(${innoTokens.chatComposerBottomInset}, env(safe-area-inset-bottom))`,
  },
  header: {
    flexShrink: 0,
    padding: '8px 0 0',
    display: 'flex',
    alignItems: 'center',
    minHeight: '40px',
    backgroundColor: innoTokens.canvas,
    borderBottom: `1px solid ${innoTokens.separatorStrong}`,
  },
  headerInner: {
    maxWidth: innoTokens.chatThreadMaxWidth,
    width: '100%',
    margin: '0 auto',
    minWidth: 0,
    paddingLeft: innoTokens.chatThreadPaddingX,
    paddingRight: innoTokens.chatThreadPaddingX,
    boxSizing: 'border-box',
  },
  title: {
    fontSize: '14px',
    fontWeight: 500,
    letterSpacing: '-0.01em',
    color: innoTokens.textPrimary,
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
    borderRadius: innoTokens.radiusLg,
    backgroundColor: innoTokens.canvasAlt,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  welcomeIcon: {
    fontSize: '22px',
    color: innoTokens.textSecondary,
  },
  welcomeTitle: {
    fontSize: '16px',
    fontWeight: 650,
    letterSpacing: '-0.02em',
    color: innoTokens.textPrimary,
  },
  welcomeSub: {
    fontSize: '13px',
    color: innoTokens.textTertiary,
    lineHeight: 1.55,
  },
  bubble: {
    wordBreak: 'break-word',
    fontSize: '14px',
    lineHeight: 1.65,
    userSelect: 'text',
    ...fadeInUp,
  },
  bubbleMobile: {
    fontSize: '15px',
  },
  userBubble: {
    alignSelf: 'flex-end',
    maxWidth: '78%',
    padding: '11px 15px',
    borderRadius: innoTokens.radiusLg,
    backgroundColor: innoTokens.userBubble,
    color: innoTokens.textPrimary,
    whiteSpace: 'pre-wrap',
  },
  userBubbleMobile: {
    maxWidth: '90%',
  },
  assistantBubble: {
    alignSelf: 'stretch',
    maxWidth: '100%',
    padding: '2px 0',
    color: innoTokens.textPrimary,
  },
  loadingRow: {
    alignSelf: 'flex-start',
    display: 'flex',
    gap: '10px',
    alignItems: 'center',
    padding: '8px 0',
    color: innoTokens.textSecondary,
    ...fadeInUp,
  },
  toolTags: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '6px',
    marginTop: '12px',
  },
  toolBadge: {
    border: 'none',
    backgroundColor: innoTokens.canvasAlt,
    color: innoTokens.textSecondary,
    borderRadius: innoTokens.radiusFull,
    fontSize: '11px',
    fontFamily: 'ui-monospace, monospace',
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
  messages: ChatDisplayMessage[]
  input: string
  loading: boolean
  error: string
  skills: SkillCategory[]
  availableModels?: AvailableModel[]
  sessionModel?: string
  isMobile?: boolean
  sidebarVisible?: boolean
  llmLabel?: string
  backendOk?: boolean
  onInputChange: (v: string) => void
  onSubmit: (text?: string) => void
  onModelChange?: (ref: string) => void
  onOpenSidebar?: () => void
  onNewChat?: () => void
  onOpenSettings?: () => void
  onToggleSidebar?: () => void
}

export default function ChatView({
  title = '新对话', messages, input, loading, error, skills,
  availableModels = [],
  sessionModel,
  isMobile = false,
  llmLabel = '',
  backendOk = false,
  onInputChange, onSubmit, onModelChange,
  onOpenSidebar, onNewChat, onOpenSettings,
}: ChatViewProps) {
  const s = useStyles()
  const chatBoxRef = useRef<HTMLDivElement>(null)
  const stickToBottomRef = useRef(true)
  const [skillsOpen, setSkillsOpen] = useState(false)
  const [scrollbarHalfOffset, setScrollbarHalfOffset] = useState(0)

  const isEmpty = messages.length === 0 && !loading
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

  const handleChatScroll = useCallback(() => {
    const el = chatBoxRef.current
    if (!el) return
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight
    stickToBottomRef.current = distance < 96
  }, [])

  useEffect(() => {
    if (!stickToBottomRef.current) return
    scrollToBottom(messages.length <= 1 ? 'auto' : 'smooth')
  }, [messages, loading, scrollToBottom])

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
          </div>
        </div>
      )}

      <div className={s.bodyShell}>
        <div
          ref={chatBoxRef}
          className={mergeClasses(s.scrollViewport, 'inno-scroll', 'inno-chat-scroll')}
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
                <div
                  key={`${m.at}-${i}`}
                  className={mergeClasses(
                    s.bubble,
                    isMobile && s.bubbleMobile,
                    m.role === 'user'
                      ? mergeClasses(s.userBubble, isMobile && s.userBubbleMobile)
                      : s.assistantBubble,
                  )}
                  style={{ animationDelay: `${Math.min(i * 40, 200)}ms` }}
                >
                  {m.role === 'assistant'
                    ? <MarkdownMessage content={m.content} />
                    : m.content}
                  {m.toolsUsed && m.toolsUsed.length > 0 && (
                    <div className={s.toolTags}>
                      {m.toolsUsed.map(t => (
                        <Badge key={t} size="small" className={s.toolBadge}>{t}</Badge>
                      ))}
                    </div>
                  )}
                </div>
              ))}

              {loading && (
                <div className={s.loadingRow}>
                  <Spinner size="tiny" />
                  <Text size={200}>正在分析…</Text>
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
              starters={starters}
              skillsCount={skills.length}
              availableModels={availableModels}
              sessionModel={sessionModel}
              onInputChange={onInputChange}
              onSubmit={handleSubmit}
              onModelChange={onModelChange}
              onOpenSkills={() => setSkillsOpen(true)}
            />
          </div>
        </div>
      </div>

      <SkillSheet
        open={skillsOpen}
        isMobile={isMobile}
        categories={skills}
        onClose={() => setSkillsOpen(false)}
        onPickPrompt={onInputChange}
      />
    </div>
  )
}
