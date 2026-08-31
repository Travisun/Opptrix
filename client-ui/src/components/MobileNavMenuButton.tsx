import { makeStyles, mergeClasses } from '@fluentui/react-components'
import { NavigationRegular } from '@fluentui/react-icons'
import OpptrixButton from './opptrix/OpptrixButton'
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
  className?: string
  /** 默认「打开导航」 */
  'aria-label'?: string
}

/** Web 移动顶栏：打开会话侧栏抽屉的汉堡按钮（≥44×44 触控目标） */
export default function MobileNavMenuButton({
  onClick,
  className,
  'aria-label': ariaLabel = '打开导航',
}: Props) {
  const s = useStyles()

  return (
    <OpptrixButton
      className={mergeClasses(s.btn, className)}
      variant="ghost"
      icon={<NavigationRegular fontSize={22} />}
      onClick={onClick}
      aria-label={ariaLabel}
    />
  )
}
