import { useState, useEffect } from 'react'
import {
  Text, SearchBox, Button, Spinner, Dropdown, Option, Textarea, TabList, Tab,
  Badge, Field,
} from '@fluentui/react-components'
import { ArrowSyncRegular, SendRegular, DocumentRegular } from '@fluentui/react-icons'
import PageShell from '../components/PageShell'
import SectionCard from '../components/SectionCard'
import EmptyState from '../components/EmptyState'
import StatusBanner from '../components/StatusBanner'
import { research, writerTypes, writerPersonas } from '../api/client'
import type { WriterFormatData, WriterPromptData, WriterPublishData } from '../types/schemas'

interface Props {
  globalStock?: { code: string; name: string } | null
}

const DEFAULT_MD = `# 标题在此

## 第一节
正文内容...

## 风险提示
本文仅供研究参考，不构成投资建议。投资有风险，决策需谨慎。
`

export default function StockWriter({ globalStock }: Props) {
  const [code, setCode] = useState(globalStock?.code || '600519')
  const [articleType, setArticleType] = useState('value')
  const [persona, setPersona] = useState('retail-voice')
  const [types, setTypes] = useState<{ type: string; name: string }[]>([])
  const [personas, setPersonas] = useState<string[]>([])
  const [markdown, setMarkdown] = useState(DEFAULT_MD)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [promptData, setPromptData] = useState<WriterPromptData | null>(null)
  const [formatData, setFormatData] = useState<WriterFormatData | null>(null)
  const [publishData, setPublishData] = useState<WriterPublishData | null>(null)
  const [tab, setTab] = useState('prompt')

  useEffect(() => {
    if (globalStock?.code) setCode(globalStock.code)
  }, [globalStock])

  useEffect(() => {
    writerTypes().then(r => setTypes(r.types ?? [])).catch(() => {})
    writerPersonas().then(r => setPersonas(r.personas ?? [])).catch(() => {})
  }, [])

  const prepare = async () => {
    if (!code.trim()) return
    setLoading(true)
    setError('')
    try {
      const resp = await research.writerPrompt(code.trim(), articleType, persona)
      if (resp.success) {
        setPromptData(resp.data)
        setTab('prompt')
      } else setError(resp.message || 'Prompt 生成失败')
    } catch (e) {
      setError(e instanceof Error ? e.message : '请求失败')
    }
    setLoading(false)
  }

  const format = async () => {
    setLoading(true)
    setError('')
    try {
      const resp = await research.writerFormat(markdown)
      if (resp.success) {
        setFormatData(resp.data)
        setTab('preview')
      } else setError(resp.message || '排版失败')
    } catch (e) {
      setError(e instanceof Error ? e.message : '排版失败')
    }
    setLoading(false)
  }

  const publish = async () => {
    setLoading(true)
    setError('')
    try {
      const resp = await research.writerPublish({
        markdown,
        code: code.trim(),
        name: promptData?.data.name,
        type: articleType,
        persona,
      })
      if (resp.success) {
        setPublishData(resp.data)
        setFormatData(resp.data)
      } else setError(resp.message || '发布失败')
    } catch (e) {
      setError(e instanceof Error ? e.message : '发布失败')
    }
    setLoading(false)
  }

  return (
    <PageShell
      title="投研写作"
      subtitle="数据采集 → Prompt → 排版 → 微信草稿箱"
      actions={(
        <>
          <SearchBox size="small" placeholder="股票代码" value={code}
            onChange={(_, d) => setCode(d.value || '')} style={{ width: 120 }} />
          <Dropdown size="small" value={articleType} style={{ minWidth: 120 }}
            onOptionSelect={(_, d) => setArticleType(String(d.optionValue ?? 'value'))}>
            {types.map(t => <Option key={t.type} value={t.type}>{t.name}</Option>)}
          </Dropdown>
          <Dropdown size="small" value={persona} style={{ minWidth: 120 }}
            onOptionSelect={(_, d) => setPersona(String(d.optionValue ?? 'retail-voice'))}>
            {personas.map(p => <Option key={p} value={p}>{p}</Option>)}
          </Dropdown>
          <Button size="small" icon={<ArrowSyncRegular />} onClick={prepare} disabled={loading}>
            生成 Prompt
          </Button>
          {loading && <Spinner size="tiny" />}
        </>
      )}
    >
      {error && <StatusBanner message={error} tone="error" />}
      {!promptData && !loading && !error && (
        <EmptyState message="输入股票代码，点击「生成 Prompt」开始写作流程" />
      )}

      {promptData && (
        <>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            <Badge appearance="filled" color="informative">[2/8] 数据采集 ✓</Badge>
            <Text size={200}>
              {promptData.data.name}({promptData.data.code}) · {promptData.data.templateName}
              · 维度 {promptData.data.summary.requiredOk}/{promptData.data.summary.requiredTotal}
              · 人格 {promptData.prompt.meta.persona}
            </Text>
          </div>

          <TabList selectedValue={tab} onTabSelect={(_, d) => setTab(d.value as string)}>
            <Tab value="prompt" icon={<DocumentRegular />}>Prompt</Tab>
            <Tab value="editor">Markdown</Tab>
            <Tab value="preview">预览</Tab>
          </TabList>

          {tab === 'prompt' && (
            <SectionCard title="写作 Prompt">
              <Text size={200} weight="semibold">System</Text>
              <pre style={{ whiteSpace: 'pre-wrap', fontSize: 11, maxHeight: 200, overflow: 'auto',
                background: 'var(--colorNeutralBackground3)', padding: 8 }}>
                {promptData.prompt.system}
              </pre>
              <Text size={200} weight="semibold" style={{ marginTop: 8 }}>User (摘要)</Text>
              <pre style={{ whiteSpace: 'pre-wrap', fontSize: 11, maxHeight: 300, overflow: 'auto',
                background: 'var(--colorNeutralBackground3)', padding: 8 }}>
                {promptData.prompt.user.slice(0, 3000)}
                {promptData.prompt.user.length > 3000 ? '\n…' : ''}
              </pre>
            </SectionCard>
          )}

          {tab === 'editor' && (
            <SectionCard title="Markdown 正文">
              <Field label="文章内容（含 # 标题与合规免责声明）">
                <Textarea value={markdown} onChange={(_, d) => setMarkdown(d.value)}
                  rows={18} style={{ width: '100%', fontFamily: 'monospace', fontSize: 12 }} />
              </Field>
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <Button appearance="primary" onClick={format} disabled={loading}>排版预览</Button>
                <Button icon={<SendRegular />} onClick={publish} disabled={loading}>推送草稿箱</Button>
              </div>
              {formatData?.preflight && (
                <div style={{ marginTop: 8 }}>
                  <Text size={200} weight="semibold">
                    预检: {formatData.preflight.ok ? '✓ 通过' : '✗ 未通过'}
                  </Text>
                  {formatData.preflight.checks.map(c => (
                    <div key={c.name} style={{ fontSize: 11, color: c.pass ? '#4caf50' : '#f44336' }}>
                      {c.pass ? '✓' : '✗'} {c.name}{c.detail ? `: ${c.detail}` : ''}
                    </div>
                  ))}
                </div>
              )}
              {publishData && (
                <StatusBanner
                  message={publishData.message + (publishData.mediaId ? ` (${publishData.mediaId})` : '')}
                  tone={publishData.published ? 'success' : 'warning'}
                />
              )}
            </SectionCard>
          )}

          {tab === 'preview' && formatData && (
            <SectionCard title={`微信排版预览 · ${formatData.convert.title || '无标题'}`}>
              <Text size={200} style={{ color: '#888' }}>
                摘要: {formatData.seo.digest} · {formatData.convert.wordCount} 字
                · 标签: {formatData.seo.tags.join('、')}
              </Text>
              <div style={{
                border: '1px solid var(--colorNeutralStroke2)',
                padding: 16, marginTop: 8, background: '#fff', color: '#333',
                maxHeight: 480, overflow: 'auto',
              }}
                dangerouslySetInnerHTML={{ __html: formatData.convert.html }}
              />
            </SectionCard>
          )}
        </>
      )}
    </PageShell>
  )
}
