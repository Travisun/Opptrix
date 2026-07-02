import { makeStyles, Text } from '@fluentui/react-components'
import { ChartMultipleRegular } from '@fluentui/react-icons'
import { BotRegular } from '@fluentui/react-icons'
import NavItem from '../components/NavItem'
import { navGroups, bottomNav } from './navConfig'
import type { FeatureRoute } from '../types/schemas'
import { useApp } from '../context/AppContext'
import { opptrixTokens, opptrixCssVars } from '../theme/tokens'

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    height: '100%',
    backgroundColor: opptrixCssVars.surface,
    borderRight: `1px solid ${opptrixCssVars.border}`,
  },
  brand: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    padding: '16px 14px',
  },
  logo: {
    width: '32px',
    height: '32px',
    borderRadius: opptrixTokens.radiusMd,
    backgroundColor: opptrixCssVars.accent,
    color: '#fff',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  brandName: {
    fontSize: '16px',
    fontWeight: 600,
    color: opptrixCssVars.textPrimary,
  },
  scroll: {
    flex: 1,
    overflowY: 'auto',
    padding: '8px 10px',
    display: 'flex',
    flexDirection: 'column',
    gap: '16px',
  },
  groupLabel: {
    fontSize: '11px',
    fontWeight: 600,
    letterSpacing: '0.06em',
    textTransform: 'uppercase' as const,
    color: opptrixCssVars.textTertiary,
    padding: '4px 8px',
  },
  group: { display: 'flex', flexDirection: 'column', gap: '2px' },
  footer: {
    padding: '10px',
    borderTop: `1px solid ${opptrixCssVars.border}`,
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  status: {
    padding: '8px 10px',
    fontSize: '12px',
    color: opptrixCssVars.textTertiary,
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
  },
  dotOk: { color: opptrixCssVars.success },
  dotErr: { color: opptrixCssVars.error },
})

interface Props {
  activeRoute: FeatureRoute
  onNavigate: (route: FeatureRoute) => void
  llmLabel?: string
  backendOk?: boolean
}

export default function Sidebar({ activeRoute, onNavigate, llmLabel, backendOk }: Props) {
  const s = useStyles()
  const { openAgent } = useApp()

  return (
    <aside className={s.root}>
      <div className={s.brand}>
        <div className={s.logo}>
          <ChartMultipleRegular fontSize={18} color="#fff" />
        </div>
        <Text className={s.brandName}>Opptrix</Text>
      </div>

      <div className={s.scroll}>
        <NavItem icon={BotRegular} label="AI 投研助手" onClick={() => openAgent()} />

        {navGroups.map(group => (
          <div key={group.label} className={s.group}>
            <Text className={s.groupLabel}>{group.label}</Text>
            {group.items.map(item => (
              <NavItem
                key={item.id}
                icon={item.icon}
                label={item.label}
                active={activeRoute === item.id}
                onClick={() => onNavigate(item.id)}
              />
            ))}
          </div>
        ))}
      </div>

      <div className={s.footer}>
        <div className={s.status}>
          <span className={backendOk ? s.dotOk : s.dotErr}>●</span>
          <span>{llmLabel ?? '连接中…'}</span>
        </div>
        {bottomNav.map(item => (
          <NavItem
            key={item.id}
            icon={item.icon}
            label={item.label}
            active={activeRoute === item.id}
            onClick={() => onNavigate(item.id)}
          />
        ))}
      </div>
    </aside>
  )
}
