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
  flexHeadStacked: {
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: '8px',
  },
  headTop: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '8px',
    minWidth: 0,
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
  titleWrap: {
    whiteSpace: 'normal',
    textOverflow: 'unset',
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
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
  tabsSlotFull: {
    maxWidth: '100%',
    width: '100%',
    justifyContent: 'flex-start',
    overflowX: 'auto',
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
  /** 标题允许两行完整展示（板块名等） */
  titleWrap?: boolean
  /** 标题+操作一行，Tab 另起一行（手机选中板块时） */
  stackedHead?: boolean
}

export default function CnDashboardFlexPanel<T extends string>({
  title,
  subtitle,
  tabConfig,
  children,
  className,
  fill = false,
  headExtra,
  titleWrap = false,
  stackedHead = false,
}: Props<T>) {
  const s = useStyles()

  const titleBlock = (
    <div className={s.headText}>
      <Text className={mergeClasses(s.title, titleWrap && s.titleWrap)} block>
        {title}
      </Text>
      {subtitle ? <Text className={s.subtitle} block>{subtitle}</Text> : null}
    </div>
  )

  const tabs = tabConfig ? (
    <div className={mergeClasses(s.tabsSlot, stackedHead && s.tabsSlotFull)}>
      <PanelTitleTabs
        tabs={tabConfig.tabs}
        value={tabConfig.value}
        onChange={tabConfig.onChange}
        ariaLabel={tabConfig.ariaLabel}
      />
    </div>
  ) : null

  return (
    <section className={mergeClasses(s.panel, fill && s.panelFill, className)}>
      <header className={mergeClasses(s.flexHead, stackedHead && s.flexHeadStacked)}>
        {stackedHead ? (
          <>
            <div className={s.headTop}>
              {titleBlock}
              {headExtra}
            </div>
            {tabs}
          </>
        ) : (
          <>
            {titleBlock}
            {tabs}
            {headExtra}
          </>
        )}
      </header>
      <div className={s.body}>{children}</div>
    </section>
  )
}
