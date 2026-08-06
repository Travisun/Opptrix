import { memo, useCallback, useState } from 'react'
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
import MediaPreviewBox from './MediaPreviewBox'
import type { ChatAttachmentMeta, ChatDisplayMessage } from '../types/chat'
import { opptrixTokens, opptrixCssVars } from '../theme/tokens'
import { fadeInUp } from '../theme/mixins'
import { copyTextToClipboard } from '../platform/clipboard'
import { formatFriendlyTime } from '../utils/formatFriendlyTime'

const useStyles = makeStyles({
  entry: {
    outline: 'none',
    ...fadeInUp,
  },
  entryUser: {
    alignSelf: 'flex-end',
    maxWidth: '78%',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
  },
  entryUserMobile: {
    maxWidth: '90%',
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
    padding: '11px 15px',
    borderRadius: opptrixTokens.radiusLg,
    backgroundColor: opptrixCssVars.userBubble,
    color: opptrixCssVars.textPrimary,
    whiteSpace: 'pre-wrap',
  },
  userBubbleMobile: {
    maxWidth: '100%',
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
    fontFamily: 'ui-monospace, monospace',
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
  onFork?: () => void
  onOpenPreview?: (sessionId: string, attachment: ChatAttachmentMeta) => void
}

function ChatMessageItem({ message, index, sessionId, isMobile = false, onFork, onOpenPreview }: Props) {
  const s = useStyles()
  const [copied, setCopied] = useState(false)
  const [previewAttachment, setPreviewAttachment] = useState<ChatAttachmentMeta | null>(null)
  const isUser = message.role === 'user'
  const timeLabel = formatFriendlyTime(message.at)

  const handleCopy = useCallback(async () => {
    if (!message.content) return
    const ok = await copyTextToClipboard(message.content)
    if (!ok) return
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1500)
  }, [message.content])

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
          {copyButton}
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

  return (
    <div
      className={mergeClasses(
        s.entry,
        s.entryInteractive,
        isUser
          ? mergeClasses(s.entryUser, isMobile && s.entryUserMobile)
          : s.entryAssistant,
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
            ? mergeClasses(s.userBubble, isMobile && s.userBubbleMobile)
            : s.assistantBubble,
        )}
      >
        {message.attachments && message.attachments.length > 0 && (
          <MessageAttachmentStrip
            items={message.attachments}
            onOpen={(item) => {
              if (isMobile || !onOpenPreview) {
                setPreviewAttachment(item)
                return
              }
              if (sessionId) onOpenPreview(sessionId, item)
            }}
          />
        )}
        {isUser
          ? message.content
          : <MarkdownMessage content={message.content} />}
        {message.toolSteps && message.toolSteps.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <ChatProcessTrace steps={message.toolSteps} />
          </div>
        )}
        {!message.toolSteps?.length && message.toolsUsed && message.toolsUsed.length > 0 && (
          <div className={s.toolTags}>
            {message.toolsUsed.map(t => (
              <Badge key={t} size="small" className={s.toolBadge}>{t}</Badge>
            ))}
          </div>
        )}
        {!isUser && metaFooter}
      </div>
      {isUser && metaFooter}
      {sessionId && (
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
