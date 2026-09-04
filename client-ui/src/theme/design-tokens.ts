/**
 * Opptrix Design Tokens — three-layer architecture (Phase B).
 *
 *   L1 Primitives   : raw scales (spacing, radius, z-index, motion, control
 *                     sizes) — never used directly in components.
 *   L2 Semantic     : intent-based aliases bound to CSS vars (theme-aware);
 *                     the existing `opptrixCssVars` covers colors/fonts —
 *                     this module adds the structural semantic layer.
 *   L3 Component    : `ui-kit` consumes L2 to expose standardized components
 *                     (see client-ui/src/ui-kit/index.ts).
 *
 * Rules for component code:
 *   - spacing/radius/z/duration come from this module (or its CSS vars) —
 *     never hardcoded values. `tests/ui-token-lint.test.mjs` ratchets raw
 *     hex/px usage and fails when it grows.
 *   - Third-party extensions import from `@opptrix/ui-kit` surface
 *     (client-ui/src/ui-kit) — a stable, versioned subset.
 */

// ── L1 · Primitives ─────────────────────────────────────────────────────────

/** 4px-base spacing scale (Fibonacci-adjacent, aligned to Fluent density). */
export const SPACING = {
  /** 2px — hairline gaps, icon-to-label */
  xxs: 2,
  /** 4px — inline chip padding */
  xs: 4,
  /** 8px — compact element padding */
  sm: 8,
  /** 12px — default element padding */
  md: 12,
  /** 16px — card/panel padding */
  lg: 16,
  /** 20px — section padding */
  xl: 20,
  /** 24px — page-section gaps */
  xxl: 24,
  /** 32px — major layout separation */
  xxxl: 32,
} as const

/** Corner-radius scale (CSS values). */
export const RADIUS = {
  /** Chips, tiny badges */
  xs: '4px',
  /** Buttons, inputs */
  sm: '6px',
  /** Cards, rows */
  md: '8px',
  /** Panels, dialogs */
  lg: '12px',
  /** Sheets, large surfaces */
  xl: '16px',
  /** Pills, avatars */
  full: '9999px',
} as const

/** Z-index bands — single source of truth for stacking. */
export const Z = {
  base: 0,
  raised: 10,
  sticky: 100,
  sidebarOverlay: 200,
  dropdown: 300,
  popover: 400,
  rightPanel: 500,
  dialog: 600,
  toast: 700,
  tooltip: 800,
} as const

/** Motion durations (ms) + the two approved easings. */
export const MOTION = {
  instant: 0,
  fast: 120,
  base: 200,
  slow: 320,
  slide: 480,
  panel: 640,
  easingStandard: 'cubic-bezier(0.4, 0, 0.2, 1)',
  easingDecelerate: 'cubic-bezier(0.32, 0.72, 0, 1)',
} as const

/** Interactive control metrics (touch-target compliance ≥ 28px visual). */
export const CONTROL = {
  heightSm: '24px',
  heightMd: '28px',
  heightLg: '32px',
  iconSm: '16px',
  iconMd: '20px',
  iconLg: '24px',
} as const

// ── L2 · Semantic (structural) ──────────────────────────────────────────────

/** Semantic layout tokens — components consume THESE, not L1 literals. */
export const semantic = {
  gapInline: SPACING.xs,
  gapStack: SPACING.sm,
  gapCard: SPACING.md,
  paddingCard: SPACING.lg,
  paddingPanel: SPACING.xl,
  gutterPage: SPACING.xxl,

  radiusControl: RADIUS.sm,
  radiusCard: RADIUS.md,
  radiusPanel: RADIUS.lg,
  radiusPill: RADIUS.full,

  focusRing: `0 0 0 2px var(--opptrix-focus-border)`,
} as const

export const designTokens = {
  SPACING,
  RADIUS,
  Z,
  MOTION,
  CONTROL,
  semantic,
} as const

/** CSS custom properties mirror (for non-Fluent styles / extension theming). */
export function designTokenCssVars(): Record<string, string> {
  const vars: Record<string, string> = {}
  for (const [k, v] of Object.entries(SPACING)) vars[`--opptrix-space-${k}`] = `${v}px`
  for (const [k, v] of Object.entries(RADIUS)) vars[`--opptrix-radius-${k}`] = v
  for (const [k, v] of Object.entries(Z)) vars[`--opptrix-z-${k}`] = String(v)
  for (const [k, v] of Object.entries(MOTION)) {
    vars[`--opptrix-motion-${k}`] = typeof v === 'number' ? `${v}ms` : v
  }
  return vars
}
