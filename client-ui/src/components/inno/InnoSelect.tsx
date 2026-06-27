import { Dropdown, Option, type DropdownProps } from '@fluentui/react-components'

type Props = Omit<DropdownProps, 'appearance'>

export default function InnoSelect({ children, size = 'medium', ...props }: Props) {
  return (
    <Dropdown appearance="filled-darker" size={size} style={{ width: '100%', ...props.style }} {...props}>
      {children}
    </Dropdown>
  )
}

export { Option as InnoOption }
