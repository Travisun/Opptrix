import { Children, isValidElement, useMemo, type ReactElement, type ReactNode } from 'react'
import { Dropdown, Option, type DropdownProps } from '@fluentui/react-components'
import { mergeOpptrixDropdownListboxProps } from './OpptrixDropdownPanel'

type Props = Omit<DropdownProps, 'appearance'>

type OptionLikeProps = {
  value?: string
  text?: string
  children?: ReactNode
}

function isOptionElement(child: ReactElement): boolean {
  if (child.type === Option) return true
  const type = child.type as { displayName?: string }
  return type.displayName === 'Option'
}

function readOptionEntry(props: OptionLikeProps): { value: string; label: string } | null {
  const { value, text, children } = props
  if (value === undefined && text === undefined && children === undefined) return null

  const optionValue = value !== undefined ? String(value) : (
    typeof children === 'string' || typeof children === 'number' ? String(children) : (text ?? '')
  )

  let label = ''
  if (typeof children === 'string' || typeof children === 'number') {
    label = String(children)
  } else if (text) {
    label = text
  } else if (value !== undefined) {
    label = String(value)
  }

  return { value: optionValue, label }
}

function collectOptionLabels(children: ReactNode): Map<string, string> {
  const map = new Map<string, string>()
  for (const child of Children.toArray(children)) {
    if (!isValidElement<OptionLikeProps>(child)) continue
    if (!isOptionElement(child)) continue
    const entry = readOptionEntry(child.props)
    if (entry) map.set(entry.value, entry.label)
  }
  return map
}

export default function OpptrixSelect({
  children,
  size = 'medium',
  value,
  selectedOptions,
  listbox,
  style,
  ...props
}: Props) {
  const labels = useMemo(() => collectOptionLabels(children), [children])

  const displayValue = useMemo(() => {
    if (selectedOptions?.length) {
      const label = labels.get(String(selectedOptions[0]))
      if (label) return label
    }
    if (value !== undefined && !labels.has(String(value))) return value
    return undefined
  }, [labels, selectedOptions, value])

  return (
    <Dropdown
      appearance="filled-darker"
      size={size}
      style={{ width: '100%', ...style }}
      selectedOptions={selectedOptions}
      listbox={mergeOpptrixDropdownListboxProps(listbox)}
      {...(displayValue !== undefined ? { value: displayValue } : {})}
      {...props}
    >
      {children}
    </Dropdown>
  )
}

export { Option as OpptrixOption }
