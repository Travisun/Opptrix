import { forwardRef, type ComponentPropsWithoutRef, type CSSProperties } from 'react'
import { PopoverSurface, mergeClasses, type DropdownProps, type PopoverSurfaceProps } from '@fluentui/react-components'
import { opptrixTokens } from '../../theme/tokens'
import {
  OPPTRIX_GLASS_DROPDOWN_LISTBOX_CLASS,
  OPPTRIX_GLASS_PANEL_CLASS,
  glassDropdown,
} from '../../theme/mixins'

export { OPPTRIX_GLASS_PANEL_CLASS, OPPTRIX_GLASS_DROPDOWN_LISTBOX_CLASS }

/** Fluent Dropdown `listbox` slot — 毛玻璃浮层（见 docs/UI-DESIGN-SYSTEM.md §5.1） */
export function mergeOpptrixDropdownListboxProps(
  listbox?: DropdownProps['listbox'],
  extraClassName?: string,
): DropdownProps['listbox'] {
  if (listbox != null && typeof listbox !== 'object') {
    return listbox
  }
  const base = listbox ?? {}
  return {
    ...base,
    className: mergeClasses(
      OPPTRIX_GLASS_DROPDOWN_LISTBOX_CLASS,
      extraClassName,
      base.className,
    ),
  }
}

type OpptrixDropdownPanelProps = ComponentPropsWithoutRef<'div'> & {
  maxHeight?: CSSProperties['maxHeight']
  scroll?: boolean
}

/**
 * 自定义锚定下拉面板（策略选择、聊天 @ 菜单等）— 统一毛玻璃样式。
 */
export function OpptrixDropdownPanel({
  className,
  maxHeight = 'min(280px, 42vh)',
  scroll = true,
  style,
  children,
  ...props
}: OpptrixDropdownPanelProps) {
  return (
    <div
      className={mergeClasses(
        OPPTRIX_GLASS_PANEL_CLASS,
        scroll && 'opptrix-scroll',
        className,
      )}
      style={{
        ...glassDropdown,
        display: 'flex',
        flexDirection: 'column',
        gap: '2px',
        padding: '4px',
        borderRadius: opptrixTokens.radiusLg,
        boxSizing: 'border-box',
        maxHeight,
        overflowY: 'auto',
        ...style,
      }}
      {...props}
    >
      {children}
    </div>
  )
}

/** Fluent Popover 浮层 — 日期选择器等 */
export const OpptrixPopoverPanel = forwardRef<HTMLDivElement, PopoverSurfaceProps>(
  function OpptrixPopoverPanel({ className, children, ...props }, ref) {
    return (
      <PopoverSurface
        ref={ref}
        className={mergeClasses(OPPTRIX_GLASS_PANEL_CLASS, className)}
        {...props}
      >
        {children}
      </PopoverSurface>
    )
  },
)
