import { useCallback, useEffect, useState } from 'react'
import { Switch, Text, makeStyles, mergeClasses } from '@fluentui/react-components'
import type { ProviderCatalogResponse, PublicProviderRuntime } from '../types/provider'
import { getProviderCatalog, saveProviderConfig } from '../api/client'
import { opptrixCssVars, opptrixTokens } from '../theme/tokens'
import { SettingsListPanelSkeleton } from '../pages/settings/SettingsListPanelSkeleton'

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
    fontSize: '12px',
    color: opptrixCssVars.textTertiary,
    lineHeight: 1.45,
  },
  scroll: {
    maxHeight: 'min(40vh, 300px)',
    overflowY: 'auto',
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '12px',
    padding: '10px 14px',
    borderBottom: `1px solid ${opptrixCssVars.separator}`,
    ':last-child': {
      borderBottom: 'none',
    },
  },
  rowMain: {
    flex: 1,
    minWidth: 0,
  },
  rowTitle: {
    fontSize: '13px',
    fontWeight: 600,
    color: opptrixCssVars.textPrimary,
    lineHeight: 1.35,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  rowMeta: {
    fontSize: '11px',
    color: opptrixCssVars.textTertiary,
    lineHeight: 1.4,
    marginTop: '2px',
  },
  enabled: {
    color: opptrixCssVars.accent,
    fontWeight: 500,
  },
})

function providerStatus(provider: PublicProviderRuntime): string {
  if (provider.enabled) return '已启用'
  if (!provider.canEnable) return '需在设置中完成配置'
  return '未启用'
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
  const [toggling, setToggling] = useState(false)

  const handleToggle = async (checked: boolean) => {
    if (checked && !provider.canEnable) return
    setToggling(true)
    try {
      await saveProviderConfig(provider.providerId, { enabled: checked })
      onSaved()
    } finally {
      setToggling(false)
    }
  }

  const status = providerStatus(provider)

  return (
    <div className={s.row}>
      <div className={s.rowMain}>
        <Text className={s.rowTitle} block title={provider.title}>{provider.title}</Text>
        <Text className={mergeClasses(s.rowMeta, provider.enabled && s.enabled)} block>
          {marketLabel} · {status}
        </Text>
      </div>
      <Switch
        checked={provider.enabled}
        disabled={toggling || (!provider.enabled && !provider.canEnable)}
        onChange={(_, d) => { void handleToggle(!!d.checked) }}
        aria-label={`${provider.enabled ? '停用' : '启用'} ${provider.title}`}
      />
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
      <Text block style={{ fontSize: 13, color: opptrixCssVars.textSecondary }}>
        暂时无法加载行情列表，可稍后在设置中查看。
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
