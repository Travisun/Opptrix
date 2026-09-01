import type { ReactNode } from 'react'
import { Text, makeStyles, mergeClasses } from '@fluentui/react-components'
import { ArrowSyncRegular } from '@fluentui/react-icons'
import PanelTitleTabs, { type PanelTitleTabItem } from '../../components/PanelTitleTabs'
import MobileNavMenuButton from '../../components/MobileNavMenuButton'
import ChromeToolButton from '../../desktop/ChromeToolButton'
import OpptrixButton from '../../components/opptrix/OpptrixButton'
import { opptrixCssVars } from '../../theme/tokens'
import {
  DESKTOP_CHROME_TOP_OFFSET,
  DESKTOP_SIDEBAR_TOOL_ICON_PADDING,
  DESKTOP_SIDEBAR_TOOL_ICON_SIZE,
  DESKTOP_TITLEBAR_HEIGHT,
  DESKTOP_TITLE_GAP,
  DESKTOP_Z_PANEL_TITLE,
} from '../../desktop/constants'
import { desktopTitleBarActionsRight } from '../../desktop/layout'

const useStyles = makeStyles({
  root: {
    flexShrink: 0,
    height: `${DESKTOP_TITLEBAR_HEIGHT}px`,
    boxSizing: 'border-box',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    borderBottom: `1px solid ${opptrixCssVars.separatorHairline}`,
    backgroundColor: opptrixCssVars.canvas,
    position: 'relative',
    zIndex: DESKTOP_Z_PANEL_TITLE,
  },
  rootElectron: {
    paddingTop: `${DESKTOP_CHROME_TOP_OFFSET}px`,
    backgroundColor: 'transparent',
  },
  rootWeb: {
    height: '40px',
    padding: '0 12px',
  },
  rootWebMobile: {
    height: 'auto',
    minHeight: '44px',
    padding: '0 8px',
  },
  titleTabs: {
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    minHeight: '28px',
    position: 'relative',
    zIndex: 1,
  },
  title: {
    fontSize: 'var(--opptrix-font-md)',
    fontWeight: 650,
    color: opptrixCssVars.textPrimary,
    lineHeight: 1.2,
    whiteSpace: 'nowrap',
  },
  spacer: {
    flex: 1,
    minWidth: '8px',
    alignSelf: 'stretch',
  },
  meta: {
    fontSize: 'var(--opptrix-font-sm)',
    color: opptrixCssVars.textTertiary,
    flexShrink: 0,
    whiteSpace: 'nowrap',
  },
  actions: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    flexShrink: 0,
  },
  sectionRow: {
    flexShrink: 0,
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '6px 12px',
    borderBottom: `1px solid ${opptrixCssVars.separator}`,
    minWidth: 0,
  },
  sectionTrailing: {
    marginLeft: 'auto',
    flexShrink: 0,
  },
})

type Props = {
  statusLabel: string
  refreshing: boolean
  onRefresh: () => void
  electronChrome?: boolean
  chromeToolbarReserve?: number
  dragRegionClassName?: string
  isMobile?: boolean
  onOpenSidebar?: () => void
}

export default function MarketDynamicsHeader({
  statusLabel,
  refreshing,
  onRefresh,
  electronChrome = false,
  chromeToolbarReserve = 0,
  dragRegionClassName = 'opptrix-market-dynamics-title-drag',
  isMobile = false,
  onOpenSidebar,
}: Props) {
  const s = useStyles()
  const paddingLeft = electronChrome
    ? (chromeToolbarReserve > 0 ? chromeToolbarReserve : DESKTOP_TITLE_GAP)
    : 0
  const paddingRight = electronChrome ? desktopTitleBarActionsRight() : 0

  const refreshBtn = electronChrome ? (
    <ChromeToolButton
      label="刷新"
      iconPadding={DESKTOP_SIDEBAR_TOOL_ICON_PADDING}
      disabled={refreshing}
      onClick={onRefresh}
    >
      <ArrowSyncRegular fontSize={DESKTOP_SIDEBAR_TOOL_ICON_SIZE} />
    </ChromeToolButton>
  ) : (
    <OpptrixButton
      variant="secondary"
      size="small"
      icon={<ArrowSyncRegular />}
      disabled={refreshing}
      onClick={onRefresh}
    >
      刷新
    </OpptrixButton>
  )

  return (
    <div
      className={mergeClasses(
        s.root,
        electronChrome && s.rootElectron,
        !electronChrome && s.rootWeb,
        !electronChrome && isMobile && s.rootWebMobile,
        'opptrix-market-dynamics-title-bar',
      )}
      style={{
        paddingLeft: electronChrome ? `${paddingLeft}px` : undefined,
        paddingRight: electronChrome ? `${paddingRight}px` : undefined,
      }}
    >
      <div className={mergeClasses(s.titleTabs, 'opptrix-panel-title-no-drag')}>
        {!electronChrome && isMobile && onOpenSidebar ? (
          <MobileNavMenuButton onClick={onOpenSidebar} />
        ) : null}
        <Text className={s.title}>市场动态</Text>
      </div>
      <div
        className={mergeClasses(s.spacer, electronChrome && dragRegionClassName)}
        aria-hidden
      />
      <Text className={mergeClasses(s.meta, 'opptrix-panel-title-no-drag')}>{statusLabel}</Text>
      <div className={mergeClasses(s.actions, 'opptrix-panel-title-no-drag')}>
        {refreshBtn}
      </div>
    </div>
  )
}

export function MarketDynamicsSectionTabs<T extends string>({
  tabs,
  value,
  onChange,
  trailing,
}: {
  tabs: PanelTitleTabItem<T>[]
  value: T
  onChange: (value: T) => void
  trailing?: ReactNode
}) {
  const s = useStyles()

  return (
    <div className={s.sectionRow}>
      <PanelTitleTabs tabs={tabs} value={value} onChange={onChange} />
      {trailing ? <div className={s.sectionTrailing}>{trailing}</div> : null}
    </div>
  )
}
