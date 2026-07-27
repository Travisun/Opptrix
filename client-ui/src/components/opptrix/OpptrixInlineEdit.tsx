import {
  useEffect,
  useRef,
  type CSSProperties,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
  type MutableRefObject,
  type ReactNode,
} from 'react'
import { makeStyles, mergeClasses } from '@fluentui/react-components'
import { CheckmarkRegular, DismissRegular } from '@fluentui/react-icons'
import { opptrixCssVars, opptrixTokens } from '../../theme/tokens'
import { focusVisibleRing, motion } from '../../theme/mixins'
import OpptrixButton from './OpptrixButton'

const useStyles = makeStyles({
  root: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    minHeight: '28px',
    maxWidth: '100%',
    minWidth: 0,
    padding: '2px 4px',
    borderRadius: opptrixTokens.radiusMd,
    backgroundColor: opptrixCssVars.surfaceHover,
    boxSizing: 'border-box',
  },
  rootFill: {
    display: 'flex',
    width: '100%',
  },
  field: {
    position: 'relative',
    display: 'inline-grid',
    alignItems: 'center',
    maxWidth: '100%',
    minWidth: 0,
  },
  fieldFill: {
    flex: 1,
    display: 'block',
    width: '100%',
  },
  /** 隐形镜像：与输入同字体，撑开 auto 宽度 */
  sizer: {
    gridArea: '1 / 1',
    visibility: 'hidden',
    whiteSpace: 'pre',
    fontSize: 'var(--opptrix-font-base)',
    fontWeight: 500,
    fontFamily: 'inherit',
    lineHeight: '26px',
    padding: '0 8px',
    boxSizing: 'border-box',
    pointerEvents: 'none',
  },
  input: {
    gridArea: '1 / 1',
    width: '100%',
    minWidth: 0,
    height: '26px',
    margin: 0,
    padding: '0 8px',
    border: 'none',
    outline: 'none',
    borderRadius: opptrixTokens.radiusSm,
    backgroundColor: opptrixCssVars.surfaceMuted,
    color: opptrixCssVars.textPrimary,
    fontSize: 'var(--opptrix-font-base)',
    fontWeight: 500,
    fontFamily: 'inherit',
    lineHeight: '26px',
    boxSizing: 'border-box',
    transitionProperty: 'background-color',
    transitionDuration: motion.fast,
    ...focusVisibleRing,
  },
  inputFill: {
    display: 'block',
    width: '100%',
  },
  action: {
    display: 'inline-flex',
    alignItems: 'center',
    justifyContent: 'center',
    width: '26px',
    height: '26px',
    minWidth: '26px',
    padding: 0,
    flexShrink: 0,
    borderRadius: opptrixTokens.radiusMd,
    color: opptrixCssVars.textSecondary,
  },
})

export type OpptrixInlineEditSizeMode = 'auto' | 'fill'

export type OpptrixInlineEditProps = {
  value: string
  onChange: (value: string) => void
  onConfirm: () => void
  onCancel: () => void
  /** 输入框无障碍标签 */
  label: string
  placeholder?: string
  className?: string
  style?: CSSProperties
  /**
   * `auto`：宽度随文案伸缩（titlebar 重命名）
   * `fill`：占满父级剩余宽度（侧栏/归档行内）
   */
  sizeMode?: OpptrixInlineEditSizeMode
  /** auto 模式下的最小内容宽（px） */
  minWidth?: number
  /** 整体/输入最大宽（px）；未设则受父级 maxWidth 约束 */
  maxWidth?: number
  autoFocus?: boolean
  selectOnFocus?: boolean
  confirmLabel?: string
  cancelLabel?: string
  confirmIcon?: ReactNode
  cancelIcon?: ReactNode
  inputRef?: MutableRefObject<HTMLInputElement | null> | ((instance: HTMLInputElement | null) => void)
  onMouseDown?: (e: ReactMouseEvent<HTMLDivElement>) => void
}

/**
 * 行内编辑：输入 + 确认/取消。
 * titlebar 会话重命名用 `sizeMode="auto"`，宽度随标题伸缩。
 */
export default function OpptrixInlineEdit({
  value,
  onChange,
  onConfirm,
  onCancel,
  label,
  placeholder,
  className,
  style,
  sizeMode = 'auto',
  minWidth = 72,
  maxWidth,
  autoFocus = true,
  selectOnFocus = true,
  confirmLabel = '确认',
  cancelLabel = '取消',
  confirmIcon,
  cancelIcon,
  inputRef,
  onMouseDown,
}: OpptrixInlineEditProps) {
  const s = useStyles()
  const localRef = useRef<HTMLInputElement | null>(null)

  useEffect(() => {
    if (!autoFocus) return
    const el = localRef.current
    if (!el) return
    el.focus()
    if (selectOnFocus) el.select()
  }, [autoFocus, selectOnFocus])

  const setRefs = (node: HTMLInputElement | null) => {
    localRef.current = node
    if (!inputRef) return
    if (typeof inputRef === 'function') inputRef(node)
    else inputRef.current = node
  }

  const handleKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      onConfirm()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      onCancel()
    }
  }

  const fill = sizeMode === 'fill'
  const sizerText = value.length > 0 ? value : (placeholder || ' ')
  const fieldStyle: CSSProperties | undefined = fill
    ? undefined
    : {
        minWidth: `${minWidth}px`,
        ...(maxWidth != null ? { maxWidth: `${maxWidth}px` } : null),
      }

  return (
    <div
      className={mergeClasses(
        'opptrix-inline-edit',
        s.root,
        fill && s.rootFill,
        className,
      )}
      style={style}
      onMouseDown={onMouseDown}
    >
      <div
        className={mergeClasses(s.field, fill && s.fieldFill)}
        style={fieldStyle}
      >
        {!fill && (
          <span className={s.sizer} aria-hidden>
            {sizerText}
          </span>
        )}
        <input
          ref={setRefs}
          type="text"
          className={mergeClasses(
            'opptrix-inline-edit__input',
            'opptrix-focusable',
            s.input,
            fill && s.inputFill,
          )}
          value={value}
          placeholder={placeholder}
          aria-label={label}
          onChange={e => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
        />
      </div>
      <OpptrixButton
        variant="icon"
        className={mergeClasses('opptrix-inline-edit__action', s.action)}
        aria-label={confirmLabel}
        onClick={onConfirm}
      >
        {confirmIcon ?? <CheckmarkRegular fontSize={14} />}
      </OpptrixButton>
      <OpptrixButton
        variant="icon"
        className={mergeClasses('opptrix-inline-edit__action', s.action)}
        aria-label={cancelLabel}
        onClick={onCancel}
      >
        {cancelIcon ?? <DismissRegular fontSize={14} />}
      </OpptrixButton>
    </div>
  )
}
