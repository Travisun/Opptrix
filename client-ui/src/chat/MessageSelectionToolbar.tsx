import { useCallback, useEffect, useRef, useState } from 'react'
import { makeStyles, mergeClasses } from '@fluentui/react-components'
import {
  ArrowLeftRegular,
  ArrowUpRegular,
  ChatRegular,
  CheckmarkCircleFilled,
  ClipboardPasteRegular,
  DismissRegular,
  TextQuoteRegular,
} from '@fluentui/react-icons'
import OpptrixButton from '../components/opptrix/OpptrixButton'
import MarkdownMessage from './MarkdownMessage'
import type { EphemeralAskTurn, MessageSelection } from '../types/chat'
import { opptrixTokens, opptrixCssVars } from '../theme/tokens'
import { glassDropdown, motion } from '../theme/mixins'
import { useRotatingPhrase } from '../hooks/useRotatingPhrase'
import { listRowKey } from '../utils/listRowKey'

const QUICK_ASKS = [
  { label: '解释一下', message: '请解释一下这段内容的含义。' },
  { label: '翻译', message: '请翻译这段内容。' },
  { label: '总结要点', message: '请总结这段内容的要点。' },
  { label: '举个例子', message: '请举一个相关的例子帮助理解。' },
] as const

const LOADING_PHRASES = [
  '正在分析…',
  '处理中…',
  '大模型分析…',
  '生成答案…',
  '稍等一会儿…',
] as const

type ToolbarMode = 'compact' | 'ask' | 'custom' | 'conversation'

const useStyles = makeStyles({
  toolbar: {
    ...glassDropdown,
    position: 'absolute',
    zIndex: 20,
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-start',
    width: 'fit-content',
    maxWidth: 'min(400px, calc(100vw - 24px))',
    gap: '2px',
    padding: '2px',
    borderRadius: opptrixTokens.radiusXl,
    pointerEvents: 'auto',
    overflow: 'hidden',
    transitionProperty: 'width, max-width, border-radius',
    transitionDuration: motion.normal,
    transitionTimingFunction: motion.easeOut,
  },
  toolbarExpanded: {
    alignItems: 'stretch',
    minWidth: '240px',
  },
  toolbarConversation: {
    minWidth: '280px',
    maxWidth: 'min(400px, calc(100vw - 24px))',
    borderRadius: opptrixTokens.radiusLg,
  },
  row: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '2px',
    width: 'fit-content',
  },
  btn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    height: '28px',
    padding: '0 12px',
    border: 'none',
    borderRadius: opptrixTokens.radiusFull,
    backgroundColor: 'transparent',
    color: opptrixCssVars.textPrimary,
    fontSize: 'var(--opptrix-font-md)',
    fontWeight: 500,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
    ':hover': {
      backgroundColor: opptrixCssVars.accentSoft,
    },
    ':disabled': {
      opacity: 0.5,
      cursor: 'default',
    },
  },
  btnIcon: {
    fontSize: 'var(--opptrix-font-lg)',
    color: opptrixCssVars.textSecondary,
  },
  iconBtn: {
    width: '28px',
    padding: 0,
    justifyContent: 'center',
  },
  askGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: '2px',
    width: '240px',
  },
  askBtn: {
    justifyContent: 'center',
    minWidth: 0,
    paddingInline: '8px',
  },
  customRow: {
    display: 'flex',
    alignItems: 'flex-end',
    gap: '6px',
    width: '240px',
    boxSizing: 'border-box',
  },
  customInput: {
    flex: 1,
    minHeight: '28px',
    maxHeight: '72px',
    resize: 'none',
    border: 'none',
    outline: 'none',
    backgroundColor: opptrixCssVars.inputBg,
    borderRadius: opptrixTokens.radiusMd,
    padding: '6px 8px',
    fontSize: 'var(--opptrix-font-md)',
    lineHeight: 1.45,
    fontFamily: 'inherit',
    color: opptrixCssVars.textPrimary,
    '::placeholder': {
      color: opptrixCssVars.textTertiary,
    },
  },
  sendBtn: {
    minWidth: '28px',
    width: '28px',
    height: '28px',
    padding: 0,
    borderRadius: opptrixTokens.radiusFull,
    flexShrink: 0,
  },
  thread: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    maxHeight: 'min(320px, 42vh)',
    overflowY: 'auto',
    padding: '4px 2px 2px',
    width: '100%',
    boxSizing: 'border-box',
  },
  turnUser: {
    alignSelf: 'flex-end',
    maxWidth: '92%',
    padding: '6px 10px',
    borderRadius: opptrixTokens.radiusMd,
    backgroundColor: opptrixCssVars.userBubble,
    fontSize: 'var(--opptrix-font-md)',
    lineHeight: 1.45,
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
  },
  turnAssistant: {
    alignSelf: 'stretch',
    fontSize: 'var(--opptrix-font-md)',
    lineHeight: 1.55,
    color: opptrixCssVars.textPrimary,
    wordBreak: 'break-word',
  },
  turnFooter: {
    display: 'flex',
    justifyContent: 'flex-end',
    marginTop: '4px',
  },
  copyBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 0,
    border: 'none',
    backgroundColor: 'transparent',
    color: opptrixCssVars.textTertiary,
    cursor: 'pointer',
    ':hover': {
      color: opptrixCssVars.textSecondary,
    },
  },
  composerRow: {
    display: 'flex',
    alignItems: 'flex-end',
    gap: '6px',
    width: '100%',
    boxSizing: 'border-box',
  },
  composerInput: {
    flex: 1,
    minHeight: '28px',
    maxHeight: '72px',
    resize: 'none',
    border: 'none',
    outline: 'none',
    backgroundColor: opptrixCssVars.inputBg,
    borderRadius: opptrixTokens.radiusMd,
    padding: '6px 8px',
    fontSize: 'var(--opptrix-font-md)',
    lineHeight: 1.45,
    fontFamily: 'inherit',
    color: opptrixCssVars.textPrimary,
    '::placeholder': {
      color: opptrixCssVars.textTertiary,
    },
  },
  loadingLine: {
    fontSize: 'var(--opptrix-font-md)',
    lineHeight: '28px',
    color: opptrixCssVars.textSecondary,
    padding: '0 8px',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
})

interface Props {
  className?: string
  style?: React.CSSProperties
  selection: MessageSelection
  onQuote: () => void
  onEphemeralAsk: (
    message: string,
    selection: MessageSelection,
    priorTurns: EphemeralAskTurn[],
  ) => Promise<string>
  onDismiss: () => void
  onExpandedChange?: (expanded: boolean) => void
}

function TurnCopyButton({ content }: { content: string }) {
  const s = useStyles()
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <OpptrixButton
      variant="icon"
      className={s.copyBtn}
      onClick={() => void handleCopy()}
      aria-label={copied ? '已复制' : '复制回复'}
      title={copied ? '已复制' : '复制回复'}
    >
      {copied
        ? <CheckmarkCircleFilled fontSize={14} />
        : <ClipboardPasteRegular fontSize={14} />}
    </OpptrixButton>
  )
}

export default function MessageSelectionToolbar({
  className,
  style,
  selection,
  onQuote,
  onEphemeralAsk,
  onDismiss,
  onExpandedChange,
}: Props) {
  const s = useStyles()
  const [mode, setMode] = useState<ToolbarMode>('compact')
  const [customInput, setCustomInput] = useState('')
  const [followUpInput, setFollowUpInput] = useState('')
  const [turns, setTurns] = useState<EphemeralAskTurn[]>([])
  const [loading, setLoading] = useState(false)
  const customInputRef = useRef<HTMLTextAreaElement>(null)
  const followUpRef = useRef<HTMLTextAreaElement>(null)
  const threadRef = useRef<HTMLDivElement>(null)

  const loadingPhrase = useRotatingPhrase(LOADING_PHRASES, loading)

  useEffect(() => {
    onExpandedChange?.(mode !== 'compact')
  }, [mode, onExpandedChange])

  useEffect(() => {
    if (mode === 'custom') customInputRef.current?.focus()
  }, [mode])

  useEffect(() => {
    if (mode === 'conversation' && !loading) followUpRef.current?.focus()
  }, [mode, loading, turns.length])

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: 'smooth' })
  }, [turns.length, loading])

  const sendMessage = useCallback(async (message: string) => {
    const msg = message.trim()
    if (!msg || loading) return

    const priorTurns = [...turns]
    setTurns(prev => [...prev, { role: 'user', content: msg }])
    setCustomInput('')
    setFollowUpInput('')
    setMode('conversation')
    setLoading(true)

    try {
      const reply = await onEphemeralAsk(msg, selection, priorTurns)
      setTurns(prev => [...prev, { role: 'assistant', content: reply }])
    } catch (e) {
      setTurns(prev => [...prev, {
        role: 'assistant',
        content: e instanceof Error ? e.message : '请求失败',
      }])
    } finally {
      setLoading(false)
    }
  }, [loading, onEphemeralAsk, selection, turns])

  const handleCustomSubmit = () => {
    void sendMessage(customInput)
  }

  const handleFollowUpSubmit = () => {
    void sendMessage(followUpInput)
  }

  const handleCustomKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleCustomSubmit()
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      setMode('ask')
    }
  }

  const handleFollowUpKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleFollowUpSubmit()
    }
    if (e.key === 'Escape') {
      e.preventDefault()
      onDismiss()
    }
  }

  const stopPointer = (e: React.MouseEvent | React.PointerEvent) => {
    e.preventDefault()
    e.stopPropagation()
  }

  const inConversation = mode === 'conversation'
  const isExpanded = mode !== 'compact'

  return (
    <div
      className={mergeClasses(
        s.toolbar,
        isExpanded && s.toolbarExpanded,
        inConversation && s.toolbarConversation,
        className,
      )}
      style={style}
      role="toolbar"
      aria-label="选区工具"
      data-selection-toolbar
      onMouseDown={stopPointer}
      onPointerDown={stopPointer}
    >
      {!inConversation && (
        <div className={s.row}>
          {mode !== 'compact' && (
            <OpptrixButton
              variant="icon"
              className={mergeClasses(s.btn, s.iconBtn)}
              onClick={() => setMode(mode === 'custom' ? 'ask' : 'compact')}
              aria-label="返回"
            >
              <ArrowLeftRegular className={s.btnIcon} />
            </OpptrixButton>
          )}
          <OpptrixButton variant="ghost" className={s.btn} onClick={onQuote} disabled={loading}>
            <TextQuoteRegular className={s.btnIcon} />
            引用
          </OpptrixButton>
          {mode === 'compact' && (
            <OpptrixButton variant="ghost" className={s.btn} onClick={() => setMode('ask')}>
              <ChatRegular className={s.btnIcon} />
              提问
            </OpptrixButton>
          )}
        </div>
      )}

      {mode === 'ask' && (
        <div className={s.askGrid}>
          {QUICK_ASKS.map((item, index) => (
            <OpptrixButton
              key={listRowKey(index, item.label)}
              variant="secondary"
              className={mergeClasses(s.btn, s.askBtn)}
              disabled={loading}
              onClick={() => void sendMessage(item.message)}
            >
              {item.label}
            </OpptrixButton>
          ))}
          <OpptrixButton
            variant="secondary"
            className={mergeClasses(s.btn, s.askBtn)}
            disabled={loading}
            onClick={() => setMode('custom')}
          >
            自定义
          </OpptrixButton>
        </div>
      )}

      {mode === 'custom' && (
        <div className={s.customRow}>
          <textarea
            ref={customInputRef}
            className={mergeClasses(s.customInput, 'opptrix-scroll')}
            value={customInput}
            onChange={e => setCustomInput(e.target.value)}
            onKeyDown={handleCustomKeyDown}
            placeholder="输入问题，Enter 发送…"
            rows={1}
            disabled={loading}
          />
          <OpptrixButton
            className={s.sendBtn}
            variant="primary"
            icon={<ArrowUpRegular fontSize={14} />}
            disabled={loading || !customInput.trim()}
            onClick={handleCustomSubmit}
            aria-label="发送"
          />
        </div>
      )}

      {inConversation && (
        <>
          <div className={s.row} style={{ width: '100%', justifyContent: 'space-between' }}>
            <span className={s.btn} style={{ cursor: 'default', opacity: 0.85 }}>
              <ChatRegular className={s.btnIcon} />
              临时追问
            </span>
            <OpptrixButton
              variant="icon"
              className={mergeClasses(s.btn, s.iconBtn)}
              onClick={onDismiss}
              aria-label="关闭"
            >
              <DismissRegular className={s.btnIcon} />
            </OpptrixButton>
          </div>

          <div ref={threadRef} className={mergeClasses(s.thread, 'opptrix-scroll')}>
            {turns.map((turn, i) => (
              <div key={listRowKey(i, turn.role)}>
                {turn.role === 'user' ? (
                  <div className={s.turnUser}>{turn.content}</div>
                ) : (
                  <div className={s.turnAssistant}>
                    <MarkdownMessage content={turn.content} />
                    <div className={s.turnFooter}>
                      <TurnCopyButton content={turn.content} />
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>

          <div className={s.composerRow}>
            {loading ? (
              <div className={s.loadingLine}>{loadingPhrase}</div>
            ) : (
              <>
                <textarea
                  ref={followUpRef}
                  className={mergeClasses(s.composerInput, 'opptrix-scroll')}
                  value={followUpInput}
                  onChange={e => setFollowUpInput(e.target.value)}
                  onKeyDown={handleFollowUpKeyDown}
                  placeholder="继续追问…"
                  rows={1}
                  disabled={loading}
                />
                <OpptrixButton
                  className={s.sendBtn}
                  variant="primary"
                  icon={<ArrowUpRegular fontSize={14} />}
                  disabled={loading || !followUpInput.trim()}
                  onClick={handleFollowUpSubmit}
                  aria-label="发送"
                />
              </>
            )}
          </div>
        </>
      )}
    </div>
  )
}
