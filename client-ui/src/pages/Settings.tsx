import { useState } from 'react'
import { Text, Button, Input, Dropdown, Option, Switch, Badge } from '@fluentui/react-components'
import { SettingsRegular } from '@fluentui/react-icons'

export default function Settings() {
  const [provider, setProvider] = useState('DeepSeek')
  const [model, setModel] = useState('deepseek-chat')
  const [apiKey, setApiKey] = useState('')
  const [compact, setCompact] = useState(true)

  return (
    <>
      <Text size={400} weight="bold">设置</Text>

      <div style={{ backgroundColor: 'var(--colorNeutralBackground2)', padding: '12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <Text size={300} weight="bold">LLM 提供商</Text>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Text style={{ width: 80, fontSize: 12 }}>提供商</Text>
          <Dropdown size="small" value={provider} style={{ width: 160 }}
            onOptionSelect={(_, d) => setProvider(d.optionValue || provider)}>
            <Option value="DeepSeek">DeepSeek</Option>
            <Option value="OpenAI">OpenAI</Option>
          </Dropdown>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Text style={{ width: 80, fontSize: 12 }}>模型</Text>
          <Dropdown size="small" value={model} style={{ width: 200 }}
            onOptionSelect={(_, d) => setModel(d.optionValue || model)}>
            <Option value="deepseek-chat">deepseek-chat</Option>
            <Option value="deepseek-coder">deepseek-coder</Option>
            <Option value="gpt-4o">gpt-4o</Option>
            <Option value="gpt-4o-mini">gpt-4o-mini</Option>
          </Dropdown>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Text style={{ width: 80, fontSize: 12 }}>API Key</Text>
          <Input type="password" size="small" placeholder="sk-..." value={apiKey}
            onChange={(_, d) => setApiKey(d.value || '')}
            style={{ flex: 1, maxWidth: 300 }} />
          <Button size="small" appearance="subtle">测试连接</Button>
        </div>
        <Button size="small" appearance="primary" style={{ alignSelf: 'flex-start' }}>保存配置</Button>
      </div>

      <div style={{ backgroundColor: 'var(--colorNeutralBackground2)', padding: '12px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <Text size={300} weight="bold">外观</Text>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <Text style={{ width: 80, fontSize: 12 }}>紧凑模式</Text>
          <Switch checked={compact} onChange={(_, d) => setCompact(!!d.checked)} />
          <Text style={{ fontSize: 11, color: '#888' }}>开启后所有间距减半</Text>
        </div>
      </div>

      <div style={{ backgroundColor: 'var(--colorNeutralBackground2)', padding: '12px', fontSize: 11, color: '#888' }}>
        <Text size={200}>stock-research v0.3.0</Text>
        <br />
        <Text size={100}>数据源: a_stock_layer (13源自动回退) · 40因子 · 28机构评估 · 9策略</Text>
      </div>
    </>
  )
}
