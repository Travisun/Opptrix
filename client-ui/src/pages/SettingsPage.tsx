import { useState, useEffect, useCallback } from 'react'
import { Text, Spinner, makeStyles, Badge } from '@fluentui/react-components'
import { ArrowLeftRegular, AddRegular, DeleteRegular } from '@fluentui/react-icons'
import StatusBanner from '../components/StatusBanner'
import InnoSurface from '../components/inno/InnoSurface'
import InnoField from '../components/inno/InnoField'
import InnoInput from '../components/inno/InnoInput'
import InnoButton from '../components/inno/InnoButton'
import ProviderWizard from './ProviderWizard'
import {
  getConfig, patchConfig, deleteProvider, getHealth,
  type AppConfig, type PublicProvider,
} from '../api/client'
import { innoTokens } from '../theme/tokens'
import { hairlineBottom, hairlineTop } from '../theme/mixins'

const useStyles = makeStyles({
  page: {
    display: 'flex',
    flexDirection: 'column',
    height: '100dvh',
    backgroundColor: innoTokens.canvas,
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '8px 12px',
    paddingTop: 'max(8px, env(safe-area-inset-top))',
    backgroundColor: innoTokens.surface,
    ...hairlineBottom,
    flexShrink: 0,
    minHeight: '44px',
  },
  title: {
    fontSize: '17px',
    fontWeight: 600,
    color: innoTokens.textPrimary,
  },
  body: {
    flex: 1,
    overflowY: 'auto',
    padding: '20px 16px',
  },
  bodyInner: {
    maxWidth: '540px',
    margin: '0 auto',
    display: 'flex',
    flexDirection: 'column',
    gap: '24px',
  },
  providerRow: {
    display: 'flex',
    alignItems: 'center',
    gap: '12px',
    padding: '12px 0',
    borderBottom: `1px solid ${innoTokens.separator}`,
    ':last-child': { borderBottom: 'none' },
  },
  providerInfo: {
    flex: 1,
    minWidth: 0,
  },
  providerName: {
    fontSize: '15px',
    fontWeight: 600,
    color: innoTokens.textPrimary,
  },
  providerMeta: {
    fontSize: '12px',
    color: innoTokens.textTertiary,
    marginTop: '2px',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  modelTags: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '4px',
    marginTop: '6px',
  },
  modelBadge: {
    fontSize: '11px',
    fontFamily: 'ui-monospace, monospace',
    backgroundColor: innoTokens.surfaceMuted,
    color: innoTokens.textSecondary,
    border: 'none',
  },
  emptyHint: {
    fontSize: '14px',
    color: innoTokens.textTertiary,
    lineHeight: 1.5,
    padding: '8px 0',
  },
  addBtn: {
    marginTop: '4px',
  },
  footer: {
    padding: '12px 16px',
    paddingBottom: 'max(12px, env(safe-area-inset-bottom))',
    backgroundColor: innoTokens.surface,
    ...hairlineTop,
    flexShrink: 0,
  },
  footerInner: {
    maxWidth: '540px',
    margin: '0 auto',
  },
  aboutTitle: {
    fontSize: '15px',
    fontWeight: 600,
    color: innoTokens.textPrimary,
  },
  aboutMeta: {
    fontSize: '13px',
    color: innoTokens.textTertiary,
    lineHeight: 1.45,
    marginTop: '4px',
  },
})

interface SettingsPageProps {
  onBack: () => void
  onSaved?: () => void
}

type View = 'list' | 'wizard'

export default function SettingsPage({ onBack, onSaved }: SettingsPageProps) {
  const s = useStyles()
  const [view, setView] = useState<View>('list')
  const [config, setConfig] = useState<AppConfig | null>(null)
  const [scorecard, setScorecard] = useState('综合评估')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const refresh = useCallback(async () => {
    const cfg = await getConfig()
    setConfig(cfg)
    setScorecard(cfg.default_scorecard || '综合评估')
    return cfg
  }, [])

  useEffect(() => {
    setLoading(true)
    refresh()
      .catch(() => setError('无法读取后端配置，请确认 npm run dev 已启动'))
      .finally(() => setLoading(false))
  }, [refresh])

  const handleDeleteProvider = async (p: PublicProvider) => {
    if (!confirm(`确定删除提供商「${p.name}」？`)) return
    setError('')
    try {
      await deleteProvider(p.id)
      await refresh()
      setMessage('已删除')
      onSaved?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : '删除失败')
    }
  }

  const handleSaveScorecard = async () => {
    setSaving(true)
    setError('')
    setMessage('')
    try {
      await patchConfig({ default_scorecard: scorecard })
      setMessage('配置已保存')
      onSaved?.()
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存失败')
    }
    setSaving(false)
  }

  const handleTest = async () => {
    setError('')
    setMessage('')
    try {
      const health = await getHealth()
      setMessage(health.llm_configured
        ? `连接正常 · ${health.available_models ?? 0} 个可用模型`
        : '后端已连接，但尚未配置 LLM 提供商')
    } catch (e) {
      setError(e instanceof Error ? e.message : '连接失败')
    }
  }

  if (view === 'wizard') {
    return (
      <ProviderWizard
        onBack={() => setView('list')}
        onDone={async () => {
          await refresh()
          setView('list')
          setMessage('提供商已添加')
          onSaved?.()
        }}
      />
    )
  }

  const providers = config?.providers ?? []

  return (
    <div className={s.page}>
      <header className={s.header}>
        <InnoButton variant="ghost" icon={<ArrowLeftRegular />} onClick={onBack} aria-label="返回" />
        <Text className={s.title}>设置</Text>
      </header>

      <div className={`${s.body} inno-scroll`}>
        <div className={s.bodyInner}>
          {loading && <Spinner size="tiny" label="加载配置..." />}
          {error && <StatusBanner message={error} tone="error" />}
          {message && <StatusBanner message={message} tone="success" />}

          <InnoSurface title="模型提供商" subtitle="多提供商合并后，聊天时可选择当前对话模型">
            {providers.length === 0 ? (
              <Text className={s.emptyHint}>
                尚未配置任何提供商。点击下方按钮，通过 3 步向导添加：选择提供商 → 填写 API Key → 勾选启用模型。
              </Text>
            ) : (
              providers.map(p => (
                <div key={p.id} className={s.providerRow}>
                  <div className={s.providerInfo}>
                    <Text className={s.providerName}>{p.name}</Text>
                    <Text className={s.providerMeta}>{p.base_url}</Text>
                    <div className={s.modelTags}>
                      {p.models.map(m => (
                        <Badge key={m} size="small" className={s.modelBadge}>{m}</Badge>
                      ))}
                    </div>
                  </div>
                  <InnoButton
                    variant="icon"
                    icon={<DeleteRegular />}
                    onClick={() => handleDeleteProvider(p)}
                    aria-label={`删除 ${p.name}`}
                  />
                </div>
              ))
            )}
            <InnoButton
              className={s.addBtn}
              variant="secondary"
              icon={<AddRegular />}
              onClick={() => setView('wizard')}
              style={{ width: '100%' }}
            >
              添加提供商
            </InnoButton>
          </InnoSurface>

          <InnoSurface title="投研默认" subtitle="因子评估等工具的默认参数">
            <InnoField label="评分卡" hint="因子评估默认使用的评分模板">
              <InnoInput value={scorecard} onChange={(_, d) => setScorecard(d.value || '')} placeholder="综合评估" />
            </InnoField>
            <InnoButton variant="secondary" onClick={handleTest} style={{ alignSelf: 'flex-start', marginTop: 8 }}>
              测试连接
            </InnoButton>
          </InnoSurface>

          <InnoSurface title="关于" sectionHeader>
            <Text className={s.aboutTitle}>innoAStock · 投研 Chat Agent</Text>
            <Text className={s.aboutMeta}>21 投研工具 · 多会话 · Function Calling · 多模型提供商</Text>
          </InnoSurface>
        </div>
      </div>

      <footer className={s.footer}>
        <div className={s.footerInner}>
          <InnoButton variant="primary" onClick={handleSaveScorecard} disabled={saving} style={{ width: '100%' }}>
            {saving ? '保存中…' : '保存配置'}
          </InnoButton>
        </div>
      </footer>
    </div>
  )
}
