import { useCallback, useEffect, useState } from 'react'
import { Switch, Text, makeStyles, mergeClasses } from '@fluentui/react-components'
import { ChevronDownRegular, ChevronRightRegular } from '@fluentui/react-icons'
import type { ProviderCatalogResponse, PublicProviderRuntime } from '../types/provider'
import { getProviderCatalog, saveProviderConfig } from '../api/client'
import { opptrixCssVars, opptrixTokens } from '../theme/tokens'
import { SettingsListPanelSkeleton } from '../pages/settings/SettingsListPanelSkeleton'
import { ProviderSettingsForm, isExpandableSettingsField } from '../pages/settings/ProviderSettingsForm'
import { useSettingsToast } from '../pages/settings/SettingsToast'

const useStyles = makeStyles({
  root: {
    width: '100%',
    display: 'flex',
    flexDirection: 'column',
    borderRadius: opptrixTokens.radiusMd,
    border: `1px solid ${opptrixCssVars.border}`,
    backgroundColor: opptrixCssVars.surface,
    overflow: 'hidden',
  },
  head: {
    padding: '10px 14px',
    borderBottom: `1px solid ${opptrixCssVars.separator}`,
    fontSize: 'var(--opptrix-font-md)',
    color: opptrixCssVars.textTertiary,
    lineHeight: 1.45,
  },
  scroll: {
    maxHeight: 'min(40vh, 300px)',
    overflowY: 'auto',
  },
  row: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
    padding: '10px 14px',
    borderBottom: `1px solid ${opptrixCssVars.separator}`,
    ':last-child': {
      borderBottom: 'none',
    },
  },
  rowExpanded: {
    paddingBottom: '12px',
  },
  rowTop: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '12px',
    width: '100%',
  },
  rowMain: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '6px',
  },
  rowMainTop: {
    display: 'flex',
    alignItems: 'baseline',
    flexWrap: 'wrap',
    gap: '4px 8px',
  },
  rowTitle: {
    fontSize: 'var(--opptrix-font-base)',
    fontWeight: 600,
    color: opptrixCssVars.textPrimary,
    lineHeight: 1.35,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  rowMeta: {
    fontSize: 'var(--opptrix-font-sm)',
    color: opptrixCssVars.textTertiary,
    lineHeight: 1.4,
  },
  enabled: {
    color: opptrixCssVars.accent,
    fontWeight: 500,
  },
  expandToggle: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    padding: 0,
    border: 'none',
    background: 'none',
    cursor: 'pointer',
    fontSize: 'var(--opptrix-font-sm)',
    color: opptrixCssVars.accent,
    lineHeight: 1.35,
    ':hover': {
      textDecoration: 'underline',
    },
  },
  credentialExpand: {
    width: '100%',
    maxWidth: '100%',
    boxSizing: 'border-box',
    overflow: 'hidden',
    paddingLeft: '2px',
  },
})

function onboardingProviderStatus(provider: PublicProviderRuntime, marketLabel: string): string {
  const parts: string[] = [marketLabel]
  if (provider.enabled) {
    parts.push('已启用')
    return parts.join(' · ')
  }

  const requiredSecrets = provider.settingsFields.filter(f => f.type === 'secret' && f.required)
  if (requiredSecrets.length) {
    const configured = requiredSecrets.filter(f => provider.secretsConfigured[f.key]).length
    if (configured === requiredSecrets.length) {
      parts.push('密钥已填写，可启用')
    } else {
      parts.push('需填写数据密钥')
    }
    return parts.join(' · ')
  }

  if (provider.settingsFields.some(f => f.type === 'secret')) {
    const anySecret = provider.settingsFields.some(
      f => f.type === 'secret' && provider.secretsConfigured[f.key],
    )
    parts.push(anySecret ? '密钥已填写，可启用' : '需填写数据密钥')
    return parts.join(' · ')
  }

  if (!provider.canEnable) {
    parts.push('需完成配置后可启用')
    return parts.join(' · ')
  }

  parts.push('未启用')
  return parts.join(' · ')
}

function ProviderRow({
  provider,
  marketLabel,
  onSaved,
}: {
  provider: PublicProviderRuntime
  marketLabel: string
  onSaved: () => void
}) {
  const s = useStyles()
  const toast = useSettingsToast()
  const hasSettings = provider.settingsFields.some(isExpandableSettingsField)
  const needsConfig = !provider.canEnable && hasSettings
  const [expanded, setExpanded] = useState(needsConfig)
  const [toggling, setToggling] = useState(false)

  useEffect(() => {
    if (needsConfig) setExpanded(true)
  }, [needsConfig])

  const handleToggle = async (checked: boolean) => {
    if (checked && !provider.canEnable) {
      toast.showError('请先填写必填项后再启用')
      if (hasSettings) setExpanded(true)
      return
    }
    setToggling(true)
    try {
      await saveProviderConfig(provider.providerId, { enabled: checked })
      toast.showSuccess(checked ? '已启用' : '已停用')
      onSaved()
    } catch (e) {
      toast.showError(e instanceof Error ? e.message : '更新失败')
    } finally {
      setToggling(false)
    }
  }

  const status = onboardingProviderStatus(provider, marketLabel)
  const expandLabel = provider.requiresApiKey || provider.settingsFields.some(f => f.type === 'secret')
    ? (expanded ? '收起' : '填写密钥')
    : (expanded ? '收起' : '展开配置')

  return (
    <div className={mergeClasses(s.row, expanded && hasSettings && s.rowExpanded)}>
      <div className={s.rowTop}>
        <div className={s.rowMain}>
          <div className={s.rowMainTop}>
            <Text className={s.rowTitle} block title={provider.title}>{provider.title}</Text>
            <Text className={mergeClasses(s.rowMeta, provider.enabled && s.enabled)} block>
              {status}
            </Text>
            {hasSettings && (
              <button
                type="button"
                className={mergeClasses(s.expandToggle, 'opptrix-focusable')}
                aria-expanded={expanded}
                onClick={() => setExpanded(v => !v)}
              >
                {expanded
                  ? <ChevronDownRegular fontSize={11} />
                  : <ChevronRightRegular fontSize={11} />}
                <span>{expandLabel}</span>
              </button>
            )}
          </div>
          {expanded && hasSettings && (
            <div className={s.credentialExpand}>
              <ProviderSettingsForm provider={provider} onSaved={onSaved} />
            </div>
          )}
        </div>
        <Switch
          checked={provider.enabled}
          disabled={toggling || (!provider.enabled && !provider.canEnable)}
          onChange={(_, d) => { void handleToggle(!!d.checked) }}
          aria-label={`${provider.enabled ? '停用' : '启用'} ${provider.title}`}
        />
      </div>
    </div>
  )
}

export function OnboardingDataList() {
  const s = useStyles()
  const [catalog, setCatalog] = useState<ProviderCatalogResponse | null>(null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const data = await getProviderCatalog()
      setCatalog(data)
    } catch {
      setCatalog(null)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
  }, [refresh])

  if (loading && !catalog) {
    return <SettingsListPanelSkeleton />
  }

  if (!catalog) {
    return (
      <Text block style={{ fontSize: 'var(--opptrix-font-base)', color: opptrixCssVars.textSecondary }}>
        暂时无法加载行情列表，请稍后重试。
      </Text>
    )
  }

  const rows = catalog.groups.flatMap(g =>
    g.providers.map(p => ({ provider: p, marketLabel: g.label })),
  )
  const enabledCount = rows.filter(r => r.provider.enabled).length

  return (
    <div className={s.root}>
      <Text className={s.head} block>
        {enabledCount > 0
          ? `已启用 ${enabledCount} / ${rows.length} 个来源`
          : `${rows.length} 个来源可供选择`}
      </Text>
      <div className={mergeClasses(s.scroll, 'opptrix-scroll')}>
        {rows.map(({ provider, marketLabel }) => (
          <ProviderRow
            key={provider.providerId}
            provider={provider}
            marketLabel={marketLabel}
            onSaved={() => { void refresh() }}
          />
        ))}
      </div>
    </div>
  )
}
