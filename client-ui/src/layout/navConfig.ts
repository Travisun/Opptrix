import type { FeatureRoute } from '../types/schemas'
import {
  HomeRegular,
  DataTrendingRegular,
  BriefcaseRegular,
  GlobeRegular,
  SettingsRegular,
} from '@fluentui/react-icons'
import type { FluentIcon } from '@fluentui/react-icons'

export interface NavItem {
  id: FeatureRoute
  label: string
  icon: FluentIcon
  hint?: string
}

export interface NavGroup {
  label: string
  items: NavItem[]
}

export const navGroups: NavGroup[] = [
  {
    label: '工作台',
    items: [
      { id: 'dashboard', label: '概览', icon: HomeRegular, hint: '快捷入口与最近标的' },
    ],
  },
  {
    label: '投研',
    items: [
      { id: 'stock_research', label: '个股研究', icon: DataTrendingRegular, hint: '诊断 · 机构 · 策略 · 回测' },
      { id: 'portfolio_hub', label: '机会与组合', icon: BriefcaseRegular, hint: '组合 · 账本' },
      { id: 'market_insight', label: '市场与产业', icon: GlobeRegular, hint: '日报 · 产业链' },
    ],
  },
]

export const bottomNav: NavItem[] = [
  { id: 'settings', label: '设置', icon: SettingsRegular },
]

export const allNavItems: NavItem[] = [
  ...navGroups.flatMap(g => g.items),
  ...bottomNav,
]
