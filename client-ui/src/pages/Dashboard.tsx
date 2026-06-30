import { useEffect } from 'react'
import { Text, Button, makeStyles } from '@fluentui/react-components'
import {
  DataTrendingRegular, BriefcaseRegular, GlobeRegular, BotRegular,
} from '@fluentui/react-icons'
import PageShell from '../components/PageShell'
import StatCard from '../components/StatCard'
import { useApp } from '../context/AppContext'
import type { FeatureRoute } from '../types/schemas'
import { opptrixTokens } from '../theme/tokens'

const useStyles = makeStyles({
  stats: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: '12px',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
    gap: '16px',
  },
  module: {
    cursor: 'pointer',
    padding: '16px',
    backgroundColor: opptrixTokens.surface,
    borderRadius: opptrixTokens.radiusGrouped,
    border: `1px solid ${opptrixTokens.separator}`,
    transition: 'background-color 150ms ease',
    ':hover': {
      backgroundColor: opptrixTokens.surfaceMuted,
    },
  },
  moduleIcon: {
    marginBottom: '12px',
    color: opptrixTokens.accent,
  },
  moduleTitle: {
    fontSize: '16px',
    fontWeight: 600,
    color: opptrixTokens.textPrimary,
    marginBottom: '4px',
  },
  moduleDesc: {
    fontSize: '12px',
    color: opptrixTokens.textSecondary,
  },
})

interface Props {
  navigate: (route: FeatureRoute) => void
}

export default function Dashboard({ navigate }: Props) {
  const s = useStyles()
  const { globalStock, openAgent, setPageContext } = useApp()

  useEffect(() => {
    setPageContext({ route: 'dashboard', title: '工作台' })
  }, [setPageContext])

  const modules = [
    { route: 'stock_research' as const, icon: DataTrendingRegular, title: '个股研究', desc: '因子诊断 · 机构 · 策略 · 回测' },
    { route: 'portfolio_hub' as const, icon: BriefcaseRegular, title: '机会与组合', desc: '选股 · 持仓 · 交易账本' },
    { route: 'market_insight' as const, icon: GlobeRegular, title: '市场与产业', desc: '收盘早报 · 产业链' },
  ]

  return (
    <PageShell kicker="RESEARCH" title="工作台" subtitle="选择模块开始投研，或向 AI 助手提问">
      <div className={s.stats}>
        <StatCard label="因子引擎" value="30+" tooltip="已注册因子数量" />
        <StatCard label="机构评估" value="28" />
        <StatCard label="策略模型" value="9" />
        <StatCard label="Agent 工具" value="21" />
      </div>

      {globalStock && (
        <Text style={{ fontSize: 13, color: opptrixTokens.textSecondary }}>
          当前标的：<strong>{globalStock.name}({globalStock.code})</strong> — 建议进入「个股研究」
        </Text>
      )}

      <div className={s.grid}>
        {modules.map(m => (
          <div key={m.route} className={s.module} onClick={() => navigate(m.route)} role="button" tabIndex={0}
            onKeyDown={(e) => { if (e.key === 'Enter') navigate(m.route) }}>
            <div className={s.moduleIcon}><m.icon fontSize={24} /></div>
            <div className={s.moduleTitle}>{m.title}</div>
            <div className={s.moduleDesc}>{m.desc}</div>
          </div>
        ))}
      </div>

      <Button appearance="primary" icon={<BotRegular />} onClick={() => openAgent('帮我概览今日 A 股市场')}>
        问 AI：今日市场概览
      </Button>
    </PageShell>
  )
}
