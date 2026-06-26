import { useState, useRef, useEffect } from 'react'
import {
  Text, Textarea, Button, Spinner, Badge, makeStyles, tokens,
} from '@fluentui/react-components'
import { SendRegular, DeleteRegular } from '@fluentui/react-icons'
import PageShell from '../components/PageShell'
import SectionCard from '../components/SectionCard'
import StatusBanner from '../components/StatusBanner'
import { sendChat, resetChat } from '../api/client'

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  toolsUsed?: string[]
}

const useStyles = makeStyles({
  chatBox: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
    maxHeight: 'calc(100vh - 220px)',
    overflowY: 'auto',
    padding: tokens.spacingVerticalS,
  },
  bubble: {
    maxWidth: '85%',
    padding: tokens.spacingVerticalS,
    borderRadius: tokens.borderRadiusMedium,
    whiteSpace: 'pre-wrap' as const,
    wordBreak: 'break-word' as const,
    fontSize: tokens.fontSizeBase300,
    lineHeight: '1.5',
  },
  userBubble: {
    alignSelf: 'flex-end',
    backgroundColor: tokens.colorBrandBackground2,
    color: tokens.colorNeutralForegroundOnBrand,
  },
  assistantBubble: {
    alignSelf: 'flex-start',
    backgroundColor: tokens.colorNeutralBackground3,
    color: tokens.colorNeutralForeground1,
  },
  inputRow: {
    display: 'flex',
    gap: tokens.spacingHorizontalS,
    alignItems: 'flex-end',
  },
  toolTags: {
    display: 'flex',
    flexWrap: 'wrap' as const,
    gap: '4px',
    marginTop: '4px',
  },
})

const STARTERS = [
  '帮我诊断 600519 的综合评分',
  '搜索比亚迪相关股票',
  '生成今日收盘市场报告',
  '半导体产业链有哪些代表公司？',
]

export default function AgentChat() {
  const s = useStyles()
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  const submit = async (text?: string) => {
    const msg = (text ?? input).trim()
    if (!msg || loading) return
    setInput('')
    setError('')
    setMessages(prev => [...prev, { role: 'user', content: msg }])
    setLoading(true)
    try {
      const resp = await sendChat(msg)
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: resp.reply,
        toolsUsed: resp.tools_used,
      }])
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
    <PageShell title="AI 投研助手" subtitle="Function Calling · 自动调用 21 个投研工具">
      {error && <StatusBanner tone="error" message={error} />}

      <SectionCard title="对话">
        <div className={s.chatBox}>
          {messages.length === 0 && (
            <Text size={200} style={{ color: tokens.colorNeutralForeground3 }}>
              直接提问，Agent 会自动调用因子评估、机构评级、策略信号等工具。示例：
            </Text>
          )}
          {messages.length === 0 && STARTERS.map(q => (
            <Button key={q} appearance="subtle" size="small" style={{ justifyContent: 'flex-start' }}
              onClick={() => submit(q)}>
              {q}
            </Button>
          ))}
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
              <Spinner size="tiny" /><Text size={200}>思考中…</Text>
            </div>
          )}
          <div ref={bottomRef} />
        </div>
      </SectionCard>

      <SectionCard>
        <div className={s.inputRow}>
          <Textarea
            value={input}
            onChange={(_, d) => setInput(d.value)}
            placeholder="输入问题，Enter 发送，Shift+Enter 换行"
            resize="vertical"
            style={{ flex: 1 }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                submit()
              }
            }}
          />
          <Button appearance="primary" icon={<SendRegular />} onClick={() => submit()} disabled={loading || !input.trim()}>
            发送
          </Button>
          <Button appearance="subtle" icon={<DeleteRegular />} onClick={clear} disabled={loading}>
            清空
          </Button>
        </div>
      </SectionCard>
    </PageShell>
  )
}
