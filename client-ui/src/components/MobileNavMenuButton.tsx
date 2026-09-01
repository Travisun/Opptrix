import { makeStyles, mergeClasses } from '@fluentui/react-components'
import OpptrixButton from './opptrix/OpptrixButton'
import { PanelLeftContractRegular, PanelLeftExpandRegular } from '../chat/chatIcons'
import { opptrixCssVars } from '../theme/tokens'
import { ghostInteractive } from '../theme/mixins'

const useStyles = makeStyles({
  btn: {
    ...ghostInteractive,
    minWidth: '44px',
    height: '44px',
    color: opptrixCssVars.textPrimary,
    flexShrink: 0,
  },
})

type Props = {
  onClick: () => void
  /** 侧栏是否已展开（切换 PanelLeft 图标） */
  open?: boolean
  className?: string
  'aria-label'?: string
}

/** Web 移动顶栏：开合会话侧栏（与聊天 MobileTopBar 同图标 / 触控目标） */
export default function MobileNavMenuButton({
  onClick,
  open = false,
  className,
  'aria-label': ariaLabel,
}: Props) {
  const s = useStyles()
  const label = ariaLabel ?? (open ? '收起侧栏' : '打开侧栏')

  return (
    <OpptrixButton
      className={mergeClasses(s.btn, className)}
      variant="ghost"
      icon={open
        ? <PanelLeftContractRegular fontSize={22} />
        : <PanelLeftExpandRegular fontSize={22} />}
      onClick={onClick}
      aria-label={label}
      aria-pressed={open}
    />
  )
}
