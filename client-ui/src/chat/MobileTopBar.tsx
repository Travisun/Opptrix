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
import { ghostInteractive, hairlineBottom } from '../theme/mixins'
import OpptrixButton from '../components/opptrix/OpptrixButton'

const useStyles = makeStyles({
  bar: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    padding: '6px 8px',
    paddingTop: 'max(6px, env(safe-area-inset-top))',
    backgroundColor: opptrixCssVars.surface,
    ...hairlineBottom,
    flexShrink: 0,
    zIndex: 10,
    minHeight: '44px',
  },
  menuBtn: {
    ...ghostInteractive,
    minWidth: '44px',
    height: '44px',
    color: opptrixCssVars.textPrimary,
    flexShrink: 0,
  },
  center: {
    flex: 1,
    minWidth: 0,
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    padding: '0 4px',
  },
  title: {
    flex: 1,
    minWidth: 0,
    fontSize: 'var(--opptrix-font-2xl)',
    fontWeight: 600,
    color: opptrixCssVars.textPrimary,
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
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
    minWidth: '44px',
    height: '44px',
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
          ? <PanelLeftContractRegular fontSize={22} />
          : <PanelLeftExpandRegular fontSize={22} />}
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
          icon={<ChatAddRegular fontSize={22} />}
          onClick={onNewChat}
          aria-label="新对话"
        />
        {onOpenMarketPanel ? (
          <OpptrixButton
            className={mergeClasses(s.actionBtn, marketPanelOpen && s.actionBtnActive)}
            variant="ghost"
            icon={marketPanelOpen
              ? <PanelRightContractRegular fontSize={22} />
              : <PanelRightExpandRegular fontSize={22} />}
            onClick={onOpenMarketPanel}
            aria-label={marketPanelOpen ? '收起关注与持仓' : '打开关注与持仓'}
            aria-pressed={marketPanelOpen}
          />
        ) : null}
        {onOpenFilesPanel ? (
          <OpptrixButton
            className={mergeClasses(s.actionBtn, filesPanelOpen && s.actionBtnActive)}
            variant="ghost"
            icon={<FolderListRegular fontSize={22} />}
            onClick={onOpenFilesPanel}
            disabled={filesPanelDisabled}
            aria-label={filesPanelOpen ? '收起文件预览' : '打开文件预览'}
            aria-pressed={filesPanelOpen}
          />
        ) : null}
      </div>
    </header>
  )
}
