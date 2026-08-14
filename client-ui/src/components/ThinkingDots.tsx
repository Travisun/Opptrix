import { mergeClasses } from '@fluentui/react-components'

/**
 * Inline three-dot thinking spinner (horizontal row).
 *
 * Canvas height tracks surrounding text (~1em). Classic staggered bounce;
 * styles live in global.css under `.opptrix-thinking-dots` /
 * `.opptrix-thinking-dots__dot`.
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
    </span>
  )
}
