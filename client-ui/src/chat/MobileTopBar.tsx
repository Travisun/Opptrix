import { makeStyles, Text, mergeClasses } from '@fluentui/react-components'
import { FolderListRegular } from '@fluentui/react-icons'
import {
  ChatAddRegular,
  PanelLeftContractRegular,
  PanelLeftExpandRegular,
  PanelRightContractRegular,
  PanelRightExpandRegular,
} from './chatIcons'
import { opptrixTokens, opptrixCssVars } from '../theme/tokens'
import {
  MOBILE_HEADER_ICON_SIZE,
  mobileHeaderBar,
  mobileHeaderIconBtn,
  mobileHeaderTitle,
} from '../theme/mobileChrome'
import { ghostInteractive, hairlineBottom } from '../theme/mixins'
import OpptrixButton from '../components/opptrix/OpptrixButton'

const useStyles = makeStyles({
  bar: {
    ...mobileHeaderBar,
    backgroundColor: opptrixCssVars.surface,
    ...hairlineBottom,
    zIndex: 10,
  },
  menuBtn: {
    ...ghostInteractive,
    ...mobileHeaderIconBtn,
    color: opptrixCssVars.textPrimary,
  },
  center: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '0 4px',
  },
  title: mobileHeaderTitle,
  statusDot: {
    width: '6px',
    height: '6px',
    borderRadius: opptrixTokens.radiusFull,
    flexShrink: 0,
  },
  statusOk: { backgroundColor: opptrixCssVars.success },
  statusErr: { backgroundColor: opptrixCssVars.error },
  actions: {
    display: 'flex',
    alignItems: 'center',
    gap: '2px',
    flexShrink: 0,
  },
  actionBtn: {
    ...ghostInteractive,
    ...mobileHeaderIconBtn,
    color: opptrixCssVars.textSecondary,
  },
  actionBtnActive: {
    color: opptrixCssVars.textPrimary,
  },
})

interface MobileTopBarProps {
  title: string
  backendOk: boolean
  /** 会话侧栏抽屉是否打开（切换 PanelLeft 图标） */
  drawerOpen?: boolean
  onOpenDrawer: () => void
  onNewChat: () => void
  /** 打开关注 / 组合·持仓全屏面板 */
  onOpenMarketPanel?: () => void
  marketPanelOpen?: boolean
  /** 打开本对话文件预览全屏面板 */
  onOpenFilesPanel?: () => void
  filesPanelOpen?: boolean
  /** 无会话时禁用文件入口 */
  filesPanelDisabled?: boolean
}

export default function MobileTopBar({
  title,
  backendOk,
  drawerOpen = false,
  onOpenDrawer,
  onNewChat,
  onOpenMarketPanel,
  marketPanelOpen = false,
  onOpenFilesPanel,
  filesPanelOpen = false,
  filesPanelDisabled = false,
}: MobileTopBarProps) {
  const s = useStyles()

  return (
    <header className={s.bar}>
      <OpptrixButton
        className={s.menuBtn}
        variant="ghost"
        icon={drawerOpen
          ? <PanelLeftContractRegular fontSize={MOBILE_HEADER_ICON_SIZE} />
          : <PanelLeftExpandRegular fontSize={MOBILE_HEADER_ICON_SIZE} />}
        onClick={onOpenDrawer}
        aria-label={drawerOpen ? '收起侧栏' : '打开侧栏'}
        aria-pressed={drawerOpen}
      />
      <div className={s.center}>
        <span
          className={mergeClasses(s.statusDot, backendOk ? s.statusOk : s.statusErr)}
          aria-label={backendOk ? '服务已连接' : '服务未连接'}
        />
        <Text className={s.title}>{title || '新对话'}</Text>
      </div>
      <div className={s.actions}>
        <OpptrixButton
          className={s.actionBtn}
          variant="ghost"
          icon={<ChatAddRegular fontSize={MOBILE_HEADER_ICON_SIZE} />}
          onClick={onNewChat}
          aria-label="新对话"
        />
        {onOpenFilesPanel ? (
          <OpptrixButton
            className={mergeClasses(s.actionBtn, filesPanelOpen && s.actionBtnActive)}
            variant="ghost"
            icon={<FolderListRegular fontSize={MOBILE_HEADER_ICON_SIZE} />}
            onClick={onOpenFilesPanel}
            disabled={filesPanelDisabled}
            aria-label={filesPanelOpen ? '收起文件预览' : '打开文件预览'}
            aria-pressed={filesPanelOpen}
          />
        ) : null}
        {onOpenMarketPanel ? (
          <OpptrixButton
            className={mergeClasses(s.actionBtn, marketPanelOpen && s.actionBtnActive)}
            variant="ghost"
            icon={marketPanelOpen
              ? <PanelRightContractRegular fontSize={MOBILE_HEADER_ICON_SIZE} />
              : <PanelRightExpandRegular fontSize={MOBILE_HEADER_ICON_SIZE} />}
            onClick={onOpenMarketPanel}
            aria-label={marketPanelOpen ? '收起关注与持仓' : '打开关注与持仓'}
            aria-pressed={marketPanelOpen}
          />
        ) : null}
      </div>
    </header>
  )
}
