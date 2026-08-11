import { Text, makeStyles } from '@fluentui/react-components'
import {
  ProviderCatalogLoading,
  useProviderCatalog,
} from './ProviderSettingsCatalog'
import { DataProvidersCardsPanel } from './DataProvidersCardsPanel'
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
          选择并启用数据源，开始查看行情。需要填写连接信息的，先完成配置再启用。
        </Text>
        <ProviderCatalogLoading />
      </div>
    )
  }

  if (!catalog) {
    return <Text block>暂时无法加载数据源，请稍后重试</Text>
  }

  return (
    <div className={s.root}>
      <Text className={s.tabHint} block>
        选择并启用数据源，开始查看行情。需要填写连接信息的，先完成配置再启用。高级选项可调整行情回退顺序。
      </Text>
      <DataProvidersCardsPanel
        catalog={catalog}
        onSaved={() => { void refresh() }}
        onOrderSaved={setCatalog}
        showAdvancedOrder
      />
    </div>
  )
}
