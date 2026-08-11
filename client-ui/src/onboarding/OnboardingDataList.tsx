import { Text } from '@fluentui/react-components'
import type { ProviderCatalogResponse } from '../types/provider'
import {
  ProviderCatalogListPanel,
  ProviderCatalogLoading,
  useProviderCatalog,
} from '../pages/settings/ProviderSettingsCatalog'
import { opptrixCssVars } from '../theme/tokens'
import { TONGHUASHUN_PROVIDER_ID } from './OnboardingFuyaoPanel'

/** Hide tonghuashun in data step — configured separately in the fuyao step. */
function catalogWithoutTonghuashun(catalog: ProviderCatalogResponse): ProviderCatalogResponse {
  const keep = (id: string) => id !== TONGHUASHUN_PROVIDER_ID
  return {
    groups: catalog.groups
      .map(g => ({
        ...g,
        providers: g.providers.filter(p => keep(p.providerId)),
      }))
      .filter(g => g.providers.length > 0),
    providers: (catalog.providers ?? []).filter(p => keep(p.providerId)),
  }
}

export function OnboardingDataList() {
  const { catalog, loading, refresh } = useProviderCatalog()

  if (loading && !catalog) {
    return <ProviderCatalogLoading />
  }

  if (!catalog) {
    return (
      <Text block style={{ fontSize: 'var(--opptrix-font-base)', color: opptrixCssVars.textSecondary }}>
        暂时无法加载行情列表，请稍后重试。
      </Text>
    )
  }

  return (
    <ProviderCatalogListPanel
      catalog={catalogWithoutTonghuashun(catalog)}
      onSaved={() => { void refresh() }}
      showInstalled={false}
      panelHeight="min(40vh, 320px)"
    />
  )
}
