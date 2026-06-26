import { useRef, useEffect, useCallback, useState } from 'react'
import {
  Text, Spinner, Badge, makeStyles, mergeClasses,
} from '@fluentui/react-components'
import { SendRegular, BotRegular, PanelLeftRegular, PanelLeftContractRegular, LightbulbRegular } from '@fluentui/react-icons'
import type { ChatDisplayMessage, SkillCategory, AvailableModel } from '../types/chat'
import SkillSheet from './SkillSheet'
import MobileTopBar from './MobileTopBar'
import ModelSelector from './ModelSelector'
import MarkdownMessage from './MarkdownMessage'
import { innoTokens } from '../theme/tokens'
import { fadeInUp, composerSurface, motion, primaryInteractive, ghostInteractive, hairlineTop } from '../theme/mixins'
import InnoButton from '../components/inno/InnoButton'

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    minWidth: 0,
    backgroundColor: innoTokens.canvas,
  },
  header: {
    padding: '12px 20px',
    backgroundColor: innoTokens.surface,
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    borderBottom: `1px solid ${innoTokens.separator}`,
    flexShrink: 0,
    minHeight: '44px',
  },
  sidebarToggle: {
    ...ghostInteractive,
    minWidth: '36px',
    height: '36px',
    borderRadius: innoTokens.radiusSm,
    color: innoTokens.textTertiary,
    flexShrink: 0,
  },
  title: {
    fontSize: '17px',
    fontWeight: 650,
    letterSpacing: '-0.02em',
    color: innoTokens.textPrimary,
    flex: 1,
    minWidth: 0,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  headerModel: {
    flexShrink: 0,
  },
  chatBox: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: '14px',
    overflowY: 'auto',
    overflowX: 'hidden',
    padding: '8px 28px 20px',
    minHeight: 0,
    overscrollBehavior: 'contain',
    WebkitOverflowScrolling: 'touch',
  },
  chatBoxMobile: {
    padding: '12px 14px 16px',
    gap: '12px',
  },
  welcomeBanner: {
    alignSelf: 'center',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '10px',
    padding: '32px 24px 16px',
    textAlign: 'center',
    maxWidth: '480px',
    ...fadeInUp,
  },
  welcomeBannerMobile: {
    padding: '20px 12px 8px',
    gap: '8px',
  },
  welcomeIconWrap: {
    width: '48px',
    height: '48px',
    borderRadius: innoTokens.radiusLg,
    backgroundColor: innoTokens.accentSoft,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  welcomeIcon: {
    fontSize: '24px',
    color: innoTokens.accent,
  },
  welcomeTitle: {
    fontSize: '17px',
    fontWeight: 650,
    color: innoTokens.textPrimary,
  },
  welcomeSub: {
    fontSize: '13px',
    color: innoTokens.textSecondary,
    lineHeight: 1.5,
  },
  bubble: {
    maxWidth: '82%',
    padding: '14px 18px',
    borderRadius: innoTokens.radiusLg,
    wordBreak: 'break-word',
    fontSize: '14px',
    lineHeight: 1.6,
    border: 'none',
    userSelect: 'text',
    ...fadeInUp,
  },
  bubbleMobile: {
    maxWidth: '94%',
    padding: '12px 16px',
    fontSize: '15px',
  },
  userBubble: {
    alignSelf: 'flex-end',
    backgroundColor: innoTokens.accentSoft,
    color: innoTokens.textPrimary,
    borderBottomRightRadius: innoTokens.radiusSm,
    whiteSpace: 'pre-wrap',
  },
  assistantBubble: {
    alignSelf: 'flex-start',
    backgroundColor: innoTokens.surface,
    borderBottomLeftRadius: innoTokens.radiusSm,
    maxWidth: '92%',
  },
  assistantBubbleMobile: {
    maxWidth: '96%',
  },
  loadingBubble: {
    alignSelf: 'flex-start',
    display: 'flex',
    gap: '10px',
    alignItems: 'center',
    padding: '14px 18px',
    backgroundColor: innoTokens.surface,
    borderRadius: innoTokens.radiusLg,
    borderBottomLeftRadius: innoTokens.radiusSm,
    ...fadeInUp,
  },
  toolTags: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '6px',
    marginTop: '10px',
  },
  toolBadge: {
    border: 'none',
    backgroundColor: innoTokens.infoSoft,
    color: innoTokens.accentHover,
    borderRadius: innoTokens.radiusFull,
    fontSize: '11px',
  },
  inputArea: {
    padding: '8px 12px 12px',
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    flexShrink: 0,
    backgroundColor: innoTokens.surface,
    ...hairlineTop,
  },
  inputAreaMobile: {
    paddingBottom: 'max(8px, env(safe-area-inset-bottom))',
  },
  startersSection: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    padding: '0 2px',
  },
  startersLabel: {
    fontSize: '12px',
    fontWeight: 500,
    color: innoTokens.textTertiary,
  },
  starters: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '8px',
  },
  startersMobile: {
    flexWrap: 'nowrap',
    overflowX: 'auto',
    paddingBottom: '2px',
  },
  starterChip: {
    borderRadius: innoTokens.radiusFull,
    fontWeight: 500,
    fontSize: '13px',
    border: `1px solid ${innoTokens.separator}`,
    backgroundColor: innoTokens.canvas,
    color: innoTokens.textSecondary,
    whiteSpace: 'nowrap',
    flexShrink: 0,
    ':hover': {
      backgroundColor: innoTokens.surfaceMuted,
      color: innoTokens.textPrimary,
    },
  },
  inputShell: {
    ...composerSurface,
    padding: '4px 4px 4px 6px',
    display: 'flex',
    gap: '2px',
    alignItems: 'flex-end',
  },
  skillBtn: {
    minWidth: '44px',
    height: '44px',
    borderRadius: innoTokens.radiusFull,
    color: innoTokens.accent,
    flexShrink: 0,
  },
  inputShellMobile: {
    padding: '3px 3px 3px 6px',
  },
  textarea: {
    flex: 1,
    minHeight: '44px',
    maxHeight: '160px',
    border: 'none',
    background: 'transparent',
    resize: 'none',
    outline: 'none',
    fontSize: '14px',
    lineHeight: 1.5,
    fontFamily: 'inherit',
    color: innoTokens.textPrimary,
    padding: '10px 0',
    '::placeholder': {
      color: innoTokens.textTertiary,
    },
  },
  textareaMobile: {
    fontSize: '16px',
    minHeight: '40px',
    maxHeight: '120px',
  },
  sendBtn: {
    ...primaryInteractive,
    borderRadius: innoTokens.radiusFull,
    minWidth: '44px',
    height: '44px',
    flexShrink: 0,
  },
  error: {
    fontSize: '13px',
    color: innoTokens.error,
    padding: '0 8px',
    animationName: {
      from: { opacity: 0 },
      to: { opacity: 1 },
    },
    animationDuration: motion.fast,
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
  title: string
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
  title, messages, input, loading, error, skills,
  availableModels = [],
  sessionModel,
  isMobile = false,
  sidebarVisible = false,
  llmLabel = '',
  backendOk = false,
  onInputChange, onSubmit, onModelChange,
  onOpenSidebar, onNewChat, onOpenSettings, onToggleSidebar,
}: ChatViewProps) {
  const s = useStyles()
  const chatBoxRef = useRef<HTMLDivElement>(null)
  const stickToBottomRef = useRef(true)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const [skillsOpen, setSkillsOpen] = useState(false)

  const isEmpty = messages.length === 0 && !loading

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

  const resizeTextarea = useCallback(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, isMobile ? 120 : 160)}px`
  }, [isMobile])

  useEffect(() => {
    resizeTextarea()
  }, [input, resizeTextarea])

  const handleSubmit = (text?: string) => {
    stickToBottomRef.current = true
    onSubmit(text)
  }

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSubmit()
    }
  }

  const starters = isMobile ? MOBILE_STARTERS : STARTERS

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

      {!isMobile && (
        <div className={s.header}>
          {onToggleSidebar && (
            <InnoButton
              className={s.sidebarToggle}
              variant="ghost"
              icon={sidebarVisible ? <PanelLeftContractRegular /> : <PanelLeftRegular />}
              onClick={onToggleSidebar}
              aria-label={sidebarVisible ? '隐藏侧栏' : '显示侧栏'}
            />
          )}
          <Text className={s.title}>{title || '新对话'}</Text>
          {onModelChange && (
            <div className={s.headerModel}>
              <ModelSelector
                models={availableModels}
                value={sessionModel}
                disabled={loading}
                onChange={onModelChange}
              />
            </div>
          )}
        </div>
      )}

      <div
        ref={chatBoxRef}
        className={mergeClasses(s.chatBox, 'inno-scroll', isMobile && s.chatBoxMobile)}
        onScroll={handleChatScroll}
      >
        {isEmpty && (
          <div className={mergeClasses(s.welcomeBanner, isMobile && s.welcomeBannerMobile)}>
            <div className={s.welcomeIconWrap}>
              <BotRegular className={s.welcomeIcon} />
            </div>
            <Text className={s.welcomeTitle}>投研助手，随时提问</Text>
            <Text className={s.welcomeSub}>
              支持 Markdown、LaTeX 公式与 Mermaid 关系图谱
            </Text>
          </div>
        )}

        {messages.map((m, i) => (
          <div
            key={`${m.at}-${i}`}
            className={mergeClasses(
              s.bubble,
              isMobile && s.bubbleMobile,
              m.role === 'user' ? s.userBubble : s.assistantBubble,
              m.role === 'assistant' && isMobile && s.assistantBubbleMobile,
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
          <div className={s.loadingBubble}>
            <Spinner size="tiny" />
            <Text size={200} style={{ color: innoTokens.textSecondary }}>正在分析…</Text>
          </div>
        )}
      </div>

      <SkillSheet
        open={skillsOpen}
        isMobile={isMobile}
        categories={skills}
        onClose={() => setSkillsOpen(false)}
        onPickPrompt={onInputChange}
      />

      <div className={mergeClasses(s.inputArea, isMobile && s.inputAreaMobile)}>
        {isEmpty && (
          <div className={s.startersSection}>
            <Text className={s.startersLabel}>试试这些</Text>
            <div className={mergeClasses(s.starters, isMobile && `${s.startersMobile} inno-scroll-x`)}>
              {starters.map(st => (
                <InnoButton
                  key={st}
                  className={s.starterChip}
                  variant="pill"
                  size="small"
                  onClick={() => handleSubmit(st)}
                >
                  {st}
                </InnoButton>
              ))}
            </div>
          </div>
        )}
        {error && <div className={s.error} role="alert">{error}</div>}
        <div className={mergeClasses(s.inputShell, isMobile && s.inputShellMobile)}>
          {skills.length > 0 && (
            <InnoButton
              className={s.skillBtn}
              variant="ghost"
              icon={<LightbulbRegular />}
              onClick={() => setSkillsOpen(true)}
              aria-label="投研技能"
            />
          )}
          <textarea
            ref={textareaRef}
            className={mergeClasses(s.textarea, isMobile && s.textareaMobile)}
            value={input}
            onChange={e => onInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isMobile ? '输入投研问题…' : '输入投研问题，Enter 发送，Shift+Enter 换行…'}
            rows={1}
            disabled={loading}
            enterKeyHint="send"
          />
          <InnoButton
            className={s.sendBtn}
            variant="primary"
            icon={<SendRegular />}
            disabled={loading || !input.trim()}
            onClick={() => handleSubmit()}
            aria-label="发送"
          />
        </div>
      </div>
    </div>
  )
}
