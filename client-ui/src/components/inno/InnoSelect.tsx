import { Dropdown, Option, type DropdownProps } from '@fluentui/react-components'

type Props = Omit<DropdownProps, 'appearance' | 'size'>

export default function InnoSelect({ children, ...props }: Props) {
  return (
    <Dropdown appearance="filled-darker" size="medium" style={{ width: '100%', ...props.style }} {...props}>
      {children}
    </Dropdown>
  )
}

export { Option as InnoOption }
