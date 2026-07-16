import { Text, makeStyles } from '@fluentui/react-components'
import {
  ProviderCatalogListPanel,
  ProviderCatalogLoading,
  useProviderCatalog,
} from './ProviderSettingsCatalog'
import { opptrixCssVars } from '../../theme/tokens'

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  tabHint: {
    fontSize: 'var(--opptrix-font-md)',
    color: opptrixCssVars.textSecondary,
    lineHeight: 1.45,
    padding: '0 2px 4px',
  },
})

export default function DataProvidersSettingsSection() {
  const s = useStyles()
  const { catalog, loading, refresh, setCatalog } = useProviderCatalog()

  if (loading && !catalog) {
    return (
      <div className={s.root}>
        <Text className={s.tabHint} block>
        配置连接、启用数据源，并拖拽调整行情回退顺序。
        </Text>
        <ProviderCatalogLoading />
      </div>
    )
  }

  if (!catalog) {
    return <Text block>无法加载数据源配置</Text>
  }

  return (
    <div className={s.root}>
      <Text className={s.tabHint} block>
        配置连接并启用数据源。拖拽列表调整行情回退顺序；越靠前越优先，仅已启用且密钥配置完成的源会实际参与回退。
      </Text>
      <ProviderCatalogListPanel
        catalog={catalog}
        onSaved={() => { void refresh() }}
        onOrderSaved={setCatalog}
        showInstalled={false}
      />
    </div>
  )
}
