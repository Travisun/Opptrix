import { useState, useRef, useEffect } from 'react'
import {
  Text, Textarea, Button, Spinner, Badge, makeStyles,
} from '@fluentui/react-components'
import { SendRegular, DeleteRegular, DismissRegular, BotRegular } from '@fluentui/react-icons'
import { sendChat, resetChat } from '../api/client'
import { useApp } from '../context/AppContext'
import { opptrixTokens, opptrixCssVars } from '../theme/tokens'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  toolsUsed?: string[]
}

const useStyles = makeStyles({
  drawer: {
    width: '100%',
    height: '100%',
    display: 'flex',
    flexDirection: 'column',
    backgroundColor: opptrixCssVars.surface,
    borderLeft: `1px solid ${opptrixCssVars.border}`,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '14px 16px',
    borderBottom: `1px solid ${opptrixCssVars.border}`,
  },
  context: {
    padding: '8px 16px',
    backgroundColor: opptrixCssVars.surfaceMuted,
    fontSize: '12px',
    color: opptrixCssVars.textSecondary,
    borderBottom: `1px solid ${opptrixCssVars.border}`,
  },
  chatBox: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
    overflowY: 'auto',
    padding: '16px',
  },
  empty: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: opptrixCssVars.textTertiary,
    fontSize: '13px',
    textAlign: 'center' as const,
    padding: '24px',
  },
  bubble: {
    maxWidth: '92%',
    padding: '10px 14px',
    borderRadius: opptrixTokens.radiusLg,
    whiteSpace: 'pre-wrap' as const,
    wordBreak: 'break-word' as const,
    fontSize: '13px',
    lineHeight: 1.5,
  },
  userBubble: {
    alignSelf: 'flex-end',
    backgroundColor: opptrixCssVars.accentSoft,
    color: opptrixCssVars.textPrimary,
  },
  assistantBubble: {
    alignSelf: 'flex-start',
    backgroundColor: opptrixCssVars.surfaceMuted,
    border: `1px solid ${opptrixCssVars.border}`,
  },
  inputArea: {
    padding: '12px 16px',
    borderTop: `1px solid ${opptrixCssVars.border}`,
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  toolTags: { display: 'flex', flexWrap: 'wrap' as const, gap: '4px', marginTop: '6px' },
  starters: { display: 'flex', flexDirection: 'column', gap: '6px', width: '100%' },
})

const STARTERS = [
  '帮我诊断当前股票的综合评分',
  '机构评级共识如何？',
  '生成今日收盘市场简报',
]

export default function AgentDrawer() {
  const s = useStyles()
  const { globalStock, pageContext, agentPrefill, setAgentOpen, setAgentPrefill } = useApp()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (agentPrefill) { setInput(agentPrefill); setAgentPrefill('') }
  }, [agentPrefill, setAgentPrefill])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  const buildContext = () => ({
    route: pageContext.route,
    tab: pageContext.tab,
    title: pageContext.title,
    stock: globalStock,
  })

  const submit = async (text?: string) => {
    const msg = (text ?? input).trim()
    if (!msg || loading) return
    setInput('')
    setError('')
    setMessages(prev => [...prev, { role: 'user', content: msg }])
    setLoading(true)
    try {
      const resp = await sendChat(msg, buildContext())
      setMessages(prev => [...prev, { role: 'assistant', content: resp.reply, toolsUsed: resp.tools_used }])
    } catch (e) {
      setError(String(e))
    }
    setLoading(false)
  }

  const clear = async () => {
    try {
      await resetChat()
      setMessages([])
      setError('')
    } catch (e) {
      setError(String(e))
    }
  }

  return (
    <div className={s.drawer}>
      <div className={s.header}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <BotRegular primaryFill={opptrixCssVars.accent} fontSize={20} />
          <Text weight="semibold" size={400}>AI 助手</Text>
        </div>
        <Button appearance="subtle" size="small" icon={<DismissRegular />} onClick={() => setAgentOpen(false)} />
      </div>

      <div className={s.context}>
        {globalStock
          ? `${globalStock.name}(${globalStock.code})`
          : '未选择标的'}
        {pageContext.title ? ` · ${pageContext.title}` : ''}
      </div>

      <div className={s.chatBox}>
        {messages.length === 0 && !loading && (
          <div className={s.empty}>
            <div className={s.starters}>
              <Text>暂无会话记录</Text>
              <Text size={200} style={{ color: opptrixCssVars.textTertiary, marginTop: 8 }}>
                选择快捷问题或输入自然语言
              </Text>
              {STARTERS.map(q => (
                <Button key={q} appearance="subtle" size="small" style={{ justifyContent: 'flex-start' }}
                  onClick={() => submit(q)}>{q}</Button>
              ))}
            </div>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`${s.bubble} ${m.role === 'user' ? s.userBubble : s.assistantBubble}`}>
            {m.content}
            {m.toolsUsed && m.toolsUsed.length > 0 && (
              <div className={s.toolTags}>
                {m.toolsUsed.map(t => (
                  <Badge key={t} appearance="outline" size="small" color="informative">{t}</Badge>
                ))}
              </div>
            )}
          </div>
        ))}
        {loading && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Spinner size="tiny" /><Text size={200}>分析中…</Text>
          </div>
        )}
        {error && <Text size={200} style={{ color: opptrixCssVars.error }}>{error}</Text>}
        <div ref={bottomRef} />
      </div>

      <div className={s.inputArea}>
        <Textarea value={input} onChange={(_, d) => setInput(d.value)} placeholder="输入问题…"
          resize="none" rows={2}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit() } }} />
        <div style={{ display: 'flex', gap: 8 }}>
          <Button appearance="primary" size="small" icon={<SendRegular />} onClick={() => submit()}
            disabled={loading || !input.trim()}>发送</Button>
          <Button appearance="subtle" size="small" icon={<DeleteRegular />} onClick={clear} disabled={loading}>
            清空
          </Button>
        </div>
      </div>
    </div>
  )
}
