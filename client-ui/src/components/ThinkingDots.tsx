import { mergeClasses } from '@fluentui/react-components'

/**
 * Compact 2×2 chase "thinking" indicator.
 *
 * Layout (clockwise order):
 *   dot1 top-left    dot2 top-right
 *   dot4 bottom-left dot3 bottom-right
 *
 * At any instant three dots are visible (opacities 1.0 / 0.5 / 0.25) and
 * one dot is off; the leader moves clockwise in discrete steps so the
 * brightness tiers read crisply. Sized to match ~13px body x-height so
 * it sits comfortably inline with regular text.
 *
 * All animation / size styles live in global.css under the
 * `.opptrix-thinking-dots` / `.opptrix-thinking-dots__dot` classes.
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
    </span>
  )
}
