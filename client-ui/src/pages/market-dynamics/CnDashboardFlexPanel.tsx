import type { ReactNode } from 'react'
import { Text, makeStyles, mergeClasses } from '@fluentui/react-components'
import PanelTitleTabs, { type PanelTitleTabItem } from '../../components/PanelTitleTabs'
import { opptrixCssVars } from '../../theme/tokens'
import { CN_DASH } from './cnDashboardTokens'

const useStyles = makeStyles({
  panel: {
    display: 'flex',
    flexDirection: 'column',
    minHeight: 0,
    minWidth: 0,
    backgroundColor: opptrixCssVars.surface,
    borderRadius: CN_DASH.cardRadius,
    border: CN_DASH.cardBorder,
    overflow: 'hidden',
  },
  panelFill: {
    flex: 1,
    minHeight: 0,
  },
  flexHead: {
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: '12px',
    padding: CN_DASH.headPad,
    borderBottom: `1px solid ${opptrixCssVars.separatorHairline}`,
    minHeight: '44px',
  },
  headText: {
    flex: '1 1 auto',
    minWidth: 0,
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
  },
  title: {
    fontSize: 'var(--opptrix-font-md)',
    fontWeight: 650,
    color: opptrixCssVars.textPrimary,
    lineHeight: 1.25,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  subtitle: {
    fontSize: 'var(--opptrix-font-xs)',
    color: opptrixCssVars.textTertiary,
    lineHeight: 1.35,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  tabsSlot: {
    flex: '0 1 auto',
    minWidth: 0,
    maxWidth: '62%',
    display: 'flex',
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  body: {
    flex: 1,
    minHeight: 0,
    display: 'flex',
    flexDirection: 'column',
    overflow: 'hidden',
    borderRadius: `0 0 ${CN_DASH.cardRadius} ${CN_DASH.cardRadius}`,
  },
})

type TabConfig<T extends string> = {
  tabs: PanelTitleTabItem<T>[]
  value: T
  onChange: (value: T) => void
  ariaLabel?: string
}

type Props<T extends string> = {
  title: string
  subtitle?: string
  tabConfig?: TabConfig<T>
  children: ReactNode
  className?: string
  fill?: boolean
  headExtra?: ReactNode
}

export default function CnDashboardFlexPanel<T extends string>({
  title,
  subtitle,
  tabConfig,
  children,
  className,
  fill = false,
  headExtra,
}: Props<T>) {
  const s = useStyles()

  return (
    <section className={mergeClasses(s.panel, fill && s.panelFill, className)}>
      <header className={s.flexHead}>
        <div className={s.headText}>
          <Text className={s.title} block>{title}</Text>
          {subtitle ? <Text className={s.subtitle} block>{subtitle}</Text> : null}
        </div>
        {tabConfig ? (
          <div className={s.tabsSlot}>
            <PanelTitleTabs
              tabs={tabConfig.tabs}
              value={tabConfig.value}
              onChange={tabConfig.onChange}
              ariaLabel={tabConfig.ariaLabel}
            />
          </div>
        ) : null}
        {headExtra}
      </header>
      <div className={s.body}>{children}</div>
    </section>
  )
}
