import { useState, useEffect } from 'react'
import {
  Text, Button, Input, Switch, Spinner,
} from '@fluentui/react-components'
import PageShell from '../components/PageShell'
import SectionCard from '../components/SectionCard'
import StatusBanner from '../components/StatusBanner'
import OpptrixSelect, { OpptrixOption } from '../components/opptrix/OpptrixSelect'
import { getConfig, saveConfig, getHealth } from '../api/client'
import { useApp } from '../context/AppContext'

export default function Settings() {
  const { setPageContext } = useApp()
  useEffect(() => {
    setPageContext({ route: 'settings', title: '设置' })
  }, [setPageContext])

  const [provider, setProvider] = useState('DeepSeek')
  const [model, setModel] = useState('deepseek-chat')
  const [apiKey, setApiKey] = useState('')
  const [scorecard, setScorecard] = useState('综合评估')
  const [compact, setCompact] = useState(true)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [testing, setTesting] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    getConfig()
      .then(cfg => {
        setProvider(cfg.llm?.provider || 'DeepSeek')
        setModel(cfg.llm?.model || 'deepseek-chat')
        setScorecard(cfg.default_scorecard || '综合评估')
      })
      .catch(() => setError('无法读取后端配置，请确认 npm run dev 已启动'))
      .finally(() => setLoading(false))
  }, [])

  const handleSave = async () => {
    setSaving(true)
    setError('')
    setMessage('')
    try {
      await saveConfig({
        provider,
        model,
        scorecard,
        ...(apiKey.trim() ? { api_key: apiKey.trim() } : {}),
      })
      setMessage('配置已保存')
      setApiKey('')
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存失败')
    }
    setSaving(false)
  }

  const handleTest = async () => {
    setTesting(true)
    setError('')
    setMessage('')
    try {
      const health = await getHealth()
      setMessage(health.llm_configured
        ? `连接正常 · 模型 ${health.model || model}`
        : '后端已连接，但 LLM 尚未配置 API Key')
    } catch (e) {
      setError(e instanceof Error ? e.message : '连接失败')
    }
    setTesting(false)
  }

  return (
    <PageShell title="设置" subtitle="LLM 与界面偏好">
      {loading && <Spinner size="tiny" label="加载配置..." />}
      {error && <StatusBanner message={error} tone="error" />}
      {message && <StatusBanner message={message} tone="info" />}

      <SectionCard title="LLM 提供商">
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Text style={{ width: 80, fontSize: 12 }}>提供商</Text>
          <OpptrixSelect size="small" value={provider} style={{ width: 160 }}
            onOptionSelect={(_, d) => setProvider(d.optionValue || provider)}>
            <OpptrixOption value="DeepSeek">DeepSeek</OpptrixOption>
            <OpptrixOption value="OpenAI">OpenAI</OpptrixOption>
          </OpptrixSelect>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Text style={{ width: 80, fontSize: 12 }}>模型</Text>
          <OpptrixSelect size="small" value={model} style={{ width: 200 }}
            onOptionSelect={(_, d) => setModel(d.optionValue || model)}>
            <OpptrixOption value="deepseek-chat">deepseek-chat</OpptrixOption>
            <OpptrixOption value="deepseek-coder">deepseek-coder</OpptrixOption>
            <OpptrixOption value="gpt-4o">gpt-4o</OpptrixOption>
            <OpptrixOption value="gpt-4o-mini">gpt-4o-mini</OpptrixOption>
          </OpptrixSelect>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Text style={{ width: 80, fontSize: 12 }}>评分卡</Text>
          <Input size="small" value={scorecard} style={{ width: 200 }}
            onChange={(_, d) => setScorecard(d.value || '')} />
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Text style={{ width: 80, fontSize: 12 }}>API Key</Text>
          <Input type="password" size="small" placeholder="留空则不修改" value={apiKey}
            onChange={(_, d) => setApiKey(d.value || '')}
            style={{ flex: 1, maxWidth: 300 }} />
          <Button size="small" appearance="subtle" onClick={handleTest} disabled={testing}>
            {testing ? '测试中...' : '测试连接'}
          </Button>
        </div>
        <Button size="small" appearance="primary" style={{ alignSelf: 'flex-start' }}
          onClick={handleSave} disabled={saving}>
          {saving ? '保存中...' : '保存配置'}
        </Button>
      </SectionCard>

      <SectionCard title="外观">
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Text style={{ width: 80, fontSize: 12 }}>紧凑模式</Text>
          <Switch checked={compact} onChange={(_, d) => setCompact(!!d.checked)} />
          <Text style={{ fontSize: 11, color: '#888' }}>后续版本将全局应用间距缩放</Text>
        </div>
      </SectionCard>

      <SectionCard>
        <Text size={200}>Opptrix v0.6.0</Text>
        <Text size={100} style={{ color: '#888' }}>
          数据源: 多市场数据层 (CN/US/HK/JP/KR/Crypto) · 因子引擎 · 机构评级 · 策略 · Function Calling Agent
        </Text>
        <Text size={100} style={{ color: '#888' }}>
          开发: npm run dev → http://127.0.0.1:5173（API 后台自动代理）
        </Text>
      </SectionCard>
    </PageShell>
  )
}
