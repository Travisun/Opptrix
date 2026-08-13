import { mergeClasses } from '@fluentui/react-components'

/**
 * Compact 3×3 "thinking" indicator.
 *
 * 9 dots arranged in a square grid. Each dot pulses independently with a
 * unique phase. Dormant dots keep a soft floor opacity so the field stays
 * dense; peaks overlap so roughly 6–8 dots read as lit at once.
 *
 * All animation / size styles live in global.css under
 * `.opptrix-thinking-dots` / `.opptrix-thinking-dots__dot`.
 */

export interface ThinkingDotsProps {
  className?: string
  /** Aria label; defaults to "正在思考". Pass empty string to hide from AT. */
  label?: string
}

export default function ThinkingDots({ className, label = '正在思考' }: ThinkingDotsProps) {
  return (
    <span
      className={mergeClasses('opptrix-thinking-dots', className)}
      role={label ? 'status' : undefined}
      aria-label={label || undefined}
      aria-hidden={label ? undefined : true}
    >
      <span className="opptrix-thinking-dots__dot" />
      <span className="opptrix-thinking-dots__dot" />
      <span className="opptrix-thinking-dots__dot" />
      <span className="opptrix-thinking-dots__dot" />
      <span className="opptrix-thinking-dots__dot" />
      <span className="opptrix-thinking-dots__dot" />
      <span className="opptrix-thinking-dots__dot" />
      <span className="opptrix-thinking-dots__dot" />
      <span className="opptrix-thinking-dots__dot" />
    </span>
  )
}
