import { memo, useCallback, useEffect, useRef, useState } from 'react'
import { Badge, makeStyles, mergeClasses } from '@fluentui/react-components'
import {
  BranchForkRegular,
  CheckmarkCircleFilled,
  ClipboardPasteRegular,
} from '@fluentui/react-icons'
import MarkdownMessage from './MarkdownMessage'
import ChatProcessTrace from './ChatProcessTrace'
import MessageTokenLabel from './MessageTokenLabel'
import { MessageAttachmentStrip } from './ComposerAttachmentStrip'
import MessageInlineRefs from './MessageInlineRefs'
import MediaPreviewBox from './MediaPreviewBox'
import OpptrixButton from '../components/opptrix/OpptrixButton'
import { isWakeResumeDisplayMessage, type ChatAttachmentMeta, type ChatDisplayMessage } from '../types/chat'
import { opptrixTokens, opptrixCssVars } from '../theme/tokens'
import { fadeInUp } from '../theme/mixins'
import { copyTextToClipboard } from '../platform/clipboard'
import { formatFriendlyTime } from '../utils/formatFriendlyTime'

/** 用户气泡编辑区约 3 行可见高度（超出滚动） */
const USER_BUBBLE_LINE_HEIGHT = 1.65
const USER_BUBBLE_FONT_PX = 16
const USER_BUBBLE_MAX_HEIGHT = Math.round(USER_BUBBLE_FONT_PX * USER_BUBBLE_LINE_HEIGHT * 3)
/** 续跑注入状态条文案（不展示完整 prompt） */
const WAKE_RESUME_STATUS_LABEL = '后台任务已完成，正在继续分析'

const useStyles = makeStyles({
  entry: {
    outline: 'none',
    ...fadeInUp,
  },
  entryUser: {
    alignSelf: 'stretch',
    display: 'flex',
    flexDirection: 'column',
  },
  entryAssistant: {
    alignSelf: 'stretch',
  },
  bubble: {
    wordBreak: 'break-word',
    fontSize: 'var(--opptrix-font-lg)',
    lineHeight: 1.65,
    userSelect: 'text',
  },
  bubbleMobile: {
    fontSize: 'var(--opptrix-font-xl)',
  },
  userBubble: {
    maxWidth: '100%',
    padding: '8px 12px',
    borderRadius: opptrixTokens.radiusXl,
    border: `1px solid ${opptrixCssVars.separatorHairline}`,
    backgroundColor: opptrixCssVars.canvas,
    color: opptrixCssVars.textPrimary,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    boxSizing: 'border-box',
  },
  userBubbleEditable: {
    cursor: 'text',
  },
  userBubbleEditing: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    maxHeight: 'none',
    overflow: 'visible',
    whiteSpace: 'normal',
    textOverflow: 'clip',
  },
  userBubbleMobile: {
    maxWidth: '100%',
  },
  wakeResumeBar: {
    alignSelf: 'stretch',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    minHeight: '22px',
    padding: '4px 8px',
    borderRadius: opptrixTokens.radiusSm,
    backgroundColor: opptrixCssVars.canvasAlt,
    color: opptrixCssVars.textTertiary,
    fontSize: 'var(--opptrix-font-sm)',
    lineHeight: 1.35,
    boxSizing: 'border-box',
    userSelect: 'none',
  },
  wakeResumeLabel: {
    flex: 1,
    minWidth: 0,
    color: 'inherit',
  },
  editTextarea: {
    display: 'block',
    width: '100%',
    margin: 0,
    padding: 0,
    border: 'none',
    outline: 'none',
    resize: 'none',
    backgroundColor: 'transparent',
    color: 'inherit',
    font: 'inherit',
    lineHeight: 'inherit',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    minHeight: `${USER_BUBBLE_MAX_HEIGHT}px`,
    maxHeight: `${USER_BUBBLE_MAX_HEIGHT}px`,
    overflowY: 'auto',
    boxSizing: 'border-box',
  },
  editActions: {
    display: 'flex',
    justifyContent: 'flex-end',
    gap: '8px',
    flexShrink: 0,
  },
  assistantBubble: {
    maxWidth: '100%',
    padding: '2px 0',
    color: opptrixCssVars.textPrimary,
  },
  toolTags: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '6px',
    marginTop: '12px',
  },
  toolBadge: {
    border: 'none',
    backgroundColor: opptrixCssVars.canvasAlt,
    color: opptrixCssVars.textSecondary,
    borderRadius: opptrixTokens.radiusFull,
    fontSize: 'var(--opptrix-font-sm)',
    fontFamily: 'var(--opptrix-font-mono)',
  },
  footer: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    minHeight: '18px',
  },
  footerAssistant: {
    justifyContent: 'flex-start',
    marginTop: '8px',
  },
  footerUser: {
    justifyContent: 'flex-end',
    gap: '4px',
    marginTop: '4px',
  },
  /** 附件/产物条：用户在气泡外 footer 上；助手在正文后 meta 上 */
  attachmentBelow: {
    marginTop: '6px',
    maxWidth: '100%',
  },
  time: {
    fontSize: 'var(--opptrix-font-sm)',
    lineHeight: 1,
    color: opptrixCssVars.textTertiary,
    fontVariantNumeric: 'tabular-nums',
    userSelect: 'none',
  },
  actionBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 0,
    margin: 0,
    border: 'none',
    backgroundColor: 'transparent',
    color: opptrixCssVars.textTertiary,
    cursor: 'pointer',
    opacity: 0,
    pointerEvents: 'none',
    transitionProperty: 'opacity, color',
    transitionDuration: '0.15s',
    transitionTimingFunction: 'ease',
    ':hover': {
      color: opptrixCssVars.textSecondary,
    },
    ':focus-visible': {
      opacity: 1,
      pointerEvents: 'auto',
      outline: `2px solid rgba(0, 122, 255, 0.35)`,
      outlineOffset: '2px',
      borderRadius: '3px',
    },
    ':active': {
      opacity: 0.72,
    },
  },
  entryInteractive: {
    ':hover': {
      [`& .opptrix-msg-action`]: {
        opacity: 1,
        pointerEvents: 'auto',
      },
    },
    ':focus-within': {
      [`& .opptrix-msg-action`]: {
        opacity: 1,
        pointerEvents: 'auto',
      },
    },
  },
})

interface Props {
  message: ChatDisplayMessage
  index: number
  sessionId?: string | null
  isMobile?: boolean
  /** 流式生成中不可进入编辑 */
  editDisabled?: boolean
  onFork?: () => void
  onEditResend?: (index: number, text: string) => void
  onOpenPreview?: (sessionId: string, attachment: ChatAttachmentMeta) => void
}

function hasTextSelection(): boolean {
  const sel = window.getSelection()
  return Boolean(sel && !sel.isCollapsed && sel.toString().trim())
}

/** 默认态单行展示：换行与连续空白压成空格 */
function toOneLinePreview(text: string): string {
  return text.replace(/\s+/g, ' ')
}

function ChatMessageItem({
  message,
  index,
  sessionId,
  isMobile = false,
  editDisabled = false,
  onFork,
  onEditResend,
  onOpenPreview,
}: Props) {
  const s = useStyles()
  const [copied, setCopied] = useState(false)
  /** 仅无右栏预览（如移动端）时走消息内弹层 */
  const [previewAttachment, setPreviewAttachment] = useState<ChatAttachmentMeta | null>(null)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(message.content)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const isUser = message.role === 'user'
  const isWakeResume = isWakeResumeDisplayMessage(message)
  const timeLabel = formatFriendlyTime(message.at)
  const canEdit = isUser && !isWakeResume && Boolean(onEditResend) && !editDisabled

  useEffect(() => {
    if (!editing) setDraft(message.content)
  }, [editing, message.content])

  useEffect(() => {
    if (editDisabled && editing) setEditing(false)
  }, [editDisabled, editing])

  useEffect(() => {
    if (!editing) return
    const el = textareaRef.current
    if (!el) return
    el.focus()
    const len = el.value.length
    el.setSelectionRange(len, len)
  }, [editing])

  const handleCopy = useCallback(async () => {
    if (!message.content) return
    const ok = await copyTextToClipboard(message.content)
    if (!ok) return
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1500)
  }, [message.content])

  const beginEdit = useCallback(() => {
    if (!canEdit || editing) return
    if (hasTextSelection()) return
    setDraft(message.content)
    setEditing(true)
  }, [canEdit, editing, message.content])

  const cancelEdit = useCallback(() => {
    setDraft(message.content)
    setEditing(false)
  }, [message.content])

  const submitEdit = useCallback(() => {
    if (!onEditResend) return
    const next = draft.trim()
    if (!next && !(message.attachments?.length)) return
    onEditResend(index, draft)
    setEditing(false)
  }, [draft, index, message.attachments?.length, onEditResend])

  const handleBubbleClick = useCallback((e: React.MouseEvent) => {
    if (!canEdit || editing) return
    const target = e.target
    if (target instanceof Element && target.closest('[data-attachment-strip], button, a')) return
    // 等 mouseup 后选区稳定，再决定是否进入编辑
    window.setTimeout(() => {
      if (hasTextSelection()) return
      beginEdit()
    }, 0)
  }, [beginEdit, canEdit, editing])

  const handleEditKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      cancelEdit()
      return
    }
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      submitEdit()
    }
  }, [cancelEdit, submitEdit])

  const copyLabel = copied ? '已复制消息 Markdown' : '复制消息 Markdown'
  const forkLabel = '基于此回复分叉新对话'

  const forkButton = onFork ? (
    <button
      type="button"
      className={mergeClasses(s.actionBtn, 'opptrix-msg-action')}
      onClick={onFork}
      title={forkLabel}
      aria-label={forkLabel}
    >
      <BranchForkRegular fontSize={16} />
    </button>
  ) : null

  const copyButton = (
    <button
      type="button"
      className={mergeClasses(s.actionBtn, 'opptrix-msg-action')}
      onClick={handleCopy}
      title={copyLabel}
      aria-label={copyLabel}
    >
      {copied
        ? <CheckmarkCircleFilled fontSize={16} />
        : <ClipboardPasteRegular fontSize={16} />}
    </button>
  )

  const timeNode = timeLabel ? (
    <time className={s.time} dateTime={message.at} title={message.at}>
      {timeLabel}
    </time>
  ) : null

  const metaFooter = (
    <div className={mergeClasses(s.footer, isUser ? s.footerUser : s.footerAssistant)}>
      {isUser ? (
        <>
          {!isWakeResume && copyButton}
          {timeNode}
        </>
      ) : (
        <>
          {timeNode}
          {!isUser && message.usage && message.usage.totalTokens > 0 && (
            <MessageTokenLabel
              totalTokens={message.usage.totalTokens}
              estimated={message.usageEstimated}
            />
          )}
          {forkButton}
          {copyButton}
        </>
      )}
    </div>
  )

  const handleOpenAttachment = useCallback((item: ChatAttachmentMeta) => {
    if (onOpenPreview && sessionId) {
      onOpenPreview(sessionId, item)
      return
    }
    setPreviewAttachment(item)
  }, [onOpenPreview, sessionId])

  const attachmentStrip = message.attachments && message.attachments.length > 0 ? (
    <div data-attachment-strip>
      <MessageAttachmentStrip
        items={message.attachments}
        sessionId={sessionId}
        onOpen={handleOpenAttachment}
      />
    </div>
  ) : null

  if (isWakeResume) {
    return (
      <div
        className={mergeClasses(s.entry, s.entryUser)}
        data-message-index={index}
        data-message-role={message.role}
        data-message-origin="wake_resume"
        style={{ animationDelay: `${Math.min(index * 40, 200)}ms` }}
      >
        <div className={s.wakeResumeBar} role="status">
          <span className={s.wakeResumeLabel}>{WAKE_RESUME_STATUS_LABEL}</span>
          {timeNode}
        </div>
      </div>
    )
  }

  return (
    <div
      className={mergeClasses(
        s.entry,
        s.entryInteractive,
        isUser ? s.entryUser : s.entryAssistant,
      )}
      data-message-index={index}
      data-message-role={message.role}
      style={{ animationDelay: `${Math.min(index * 40, 200)}ms` }}
      tabIndex={0}
    >
      <div
        className={mergeClasses(
          s.bubble,
          isMobile && s.bubbleMobile,
          isUser
            ? mergeClasses(
              s.userBubble,
              isMobile && s.userBubbleMobile,
              canEdit && !editing && s.userBubbleEditable,
              editing && s.userBubbleEditing,
            )
            : s.assistantBubble,
        )}
        onClick={isUser ? handleBubbleClick : undefined}
        role={canEdit && !editing ? 'button' : undefined}
        aria-label={canEdit && !editing ? '点击编辑这条消息' : undefined}
      >
        {isUser ? (
          editing ? (
            <>
              <textarea
                ref={textareaRef}
                className={mergeClasses(s.editTextarea, 'opptrix-scroll-hidden')}
                value={draft}
                onChange={e => setDraft(e.target.value)}
                onKeyDown={handleEditKeyDown}
                onClick={e => e.stopPropagation()}
                rows={3}
                aria-label="编辑消息"
              />
              <div className={s.editActions} onClick={e => e.stopPropagation()}>
                <OpptrixButton variant="ghost" size="small" onClick={cancelEdit}>
                  取消
                </OpptrixButton>
                <OpptrixButton
                  variant="primary"
                  size="small"
                  onClick={submitEdit}
                  disabled={!draft.trim() && !(message.attachments?.length)}
                >
                  发送
                </OpptrixButton>
              </div>
            </>
          ) : (
            message.content.trim()
              ? <MessageInlineRefs text={toOneLinePreview(message.content)} />
              : (message.attachments?.length ? '（附件）' : '')
          )
        ) : (
          <>
            {(message.reasoningContent?.trim()
              || (message.reasoningSegments && message.reasoningSegments.length > 0)
              || (message.toolSteps && message.toolSteps.length > 0)) && (
              <div style={{ marginBottom: message.content ? 8 : 0 }}>
                <ChatProcessTrace
                  steps={message.toolSteps ?? []}
                  thinkingSnippet={message.reasoningContent?.trim() || undefined}
                  thinkingSegments={message.reasoningSegments}
                />
              </div>
            )}
            <MarkdownMessage content={message.content} sessionId={sessionId} />
          </>
        )}
        {!message.toolSteps?.length && message.toolsUsed && message.toolsUsed.length > 0 && (
          <div className={s.toolTags}>
            {message.toolsUsed.map(t => (
              <Badge key={t} size="small" className={s.toolBadge}>{t}</Badge>
            ))}
          </div>
        )}
        {!isUser && attachmentStrip ? (
          <div className={s.attachmentBelow}>
            {attachmentStrip}
          </div>
        ) : null}
        {!isUser && metaFooter}
      </div>
      {isUser && attachmentStrip ? (
        <div className={s.attachmentBelow}>
          {attachmentStrip}
        </div>
      ) : null}
      {isUser && !editing && metaFooter}
      {sessionId && !onOpenPreview && (
        <MediaPreviewBox
          open={Boolean(previewAttachment)}
          sessionId={sessionId}
          attachment={previewAttachment}
          onClose={() => setPreviewAttachment(null)}
        />
      )}
    </div>
  )
}

export default memo(ChatMessageItem)
