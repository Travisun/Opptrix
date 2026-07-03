import { useState } from 'react'
import { Tab, TabList, Text, makeStyles } from '@fluentui/react-components'
import {
  ProviderCatalogListPanel,
  ProviderCatalogLoading,
  ProviderPriorityPanels,
  useProviderCatalog,
} from './ProviderSettingsCatalog'
import { opptrixCssVars } from '../../theme/tokens'

type DataProviderTab = 'providers' | 'priority'

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  tabBar: {
    flexShrink: 0,
    marginBottom: '2px',
  },
  tabList: {
    minHeight: 'unset',
    gap: '2px',
  },
  tabPanel: {
    display: 'flex',
    flexDirection: 'column',
    gap: '8px',
  },
  tabPanelHidden: {
    display: 'none',
  },
  tabHint: {
    fontSize: '12px',
    color: opptrixCssVars.textSecondary,
    lineHeight: 1.45,
    padding: '0 2px 4px',
  },
})

export default function DataProvidersSettingsSection() {
  const s = useStyles()
  const [tab, setTab] = useState<DataProviderTab>('providers')
  const { catalog, loading, refresh, setCatalog } = useProviderCatalog()

  if (loading && !catalog) {
    return <ProviderCatalogLoading />
  }

  if (!catalog) {
    return <Text block>无法加载数据源配置</Text>
  }

  return (
    <div className={s.root}>
      <div className={s.tabBar}>
        <TabList
          className={s.tabList}
          size="small"
          selectedValue={tab}
          onTabSelect={(_, data) => setTab(data.value as DataProviderTab)}
        >
          <Tab value="providers">提供商</Tab>
          <Tab value="priority">优先级</Tab>
        </TabList>
      </div>

      <div className={tab === 'providers' ? s.tabPanel : s.tabPanelHidden}>
        <Text className={s.tabHint} block>
          为各数据源配置连接信息，并通过开关控制是否参与行情拉取。
        </Text>
        <ProviderCatalogListPanel
          catalog={catalog}
          onSaved={() => { void refresh() }}
        />
      </div>

      <div className={tab === 'priority' ? s.tabPanel : s.tabPanelHidden}>
        <Text className={s.tabHint} block>
          先选择市场板块，再拖拽或使用箭头调整该板块内数据源的优先顺序。
        </Text>
        <ProviderPriorityPanels
          catalog={catalog}
          onReordered={next => setCatalog(next)}
        />
      </div>
    </div>
  )
}
