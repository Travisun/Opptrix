import { ArrowLeftRegular } from '@fluentui/react-icons'
import { makeStyles, mergeClasses } from '@fluentui/react-components'
import { SIDEBAR_TOP_MENU_ICON_SIZE, sidebarTopMenuIcon, sidebarTopMenuRow } from '../../theme/mixins'
import OpptrixButton from '../../components/opptrix/OpptrixButton'

const useStyles = makeStyles({
  row: sidebarTopMenuRow,
  icon: sidebarTopMenuIcon,
})

interface Props {
  onClick: () => void
  className?: string
}

export default function SettingsBackRow({ onClick, className }: Props) {
  const s = useStyles()
  return (
    <OpptrixButton
      variant="ghost"
      block
      className={mergeClasses(s.row, 'opptrix-focusable', className)}
      onClick={onClick}
    >
      <ArrowLeftRegular className={s.icon} fontSize={SIDEBAR_TOP_MENU_ICON_SIZE} />
      <span>返回应用</span>
    </OpptrixButton>
  )
}
