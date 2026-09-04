/**
 * @opptrix/ui-kit — standardized component namespace for Opptrix and
 * third-party extensions (Phase B).
 *
 * This is the STABLE component surface: extension authors should import from
 * here (bundled apps may deep-import, but only this namespace is a supported
 * contract). Every export is theme-token-driven — no raw colors/px in the
 * implementations; `tests/ui-token-lint.test.mjs` enforces this zone.
 *
 * Typography contract (consumes `opptrixCssVars`):
 *   pageTitle 17/500 · pageSubtitle 13/400 · sectionLabel 12/600 uppercase
 *   body 14/400 · bodyStrong 14/600 · caption 12/400
 *
 * Spacing/radius/motion: consume `designTokens` (theme/design-tokens) —
 * semantic layer first (`semantic.*`), primitives only in ui-kit internals.
 */

// Standardized interactive / input components (existing Opptrix wrappers —
// single source of truth; deep imports remain for legacy call sites).
export { default as Button } from '../components/opptrix/OpptrixButton'
export { default as Input } from '../components/opptrix/OpptrixInput'
export { default as Textarea } from '../components/opptrix/OpptrixTextarea'
export { default as Select } from '../components/opptrix/OpptrixSelect'
export { default as Field } from '../components/opptrix/OpptrixField'
export { default as InlineEdit } from '../components/opptrix/OpptrixInlineEdit'
export { default as SegmentedControl } from '../components/opptrix/OpptrixSegmentedControl'
export { default as Spinner } from '../components/opptrix/OpptrixSpinner'
export { default as Surface } from '../components/opptrix/OpptrixSurface'
export {
  OpptrixDialogAlert as DialogAlert,
  OpptrixDialogAlertProvider as DialogAlertProvider,
  useOpptrixDialogAlert as useDialogAlert,
} from '../components/opptrix/OpptrixDialogAlert'
export { OpptrixDropdownPanel as DropdownPanel } from '../components/opptrix/OpptrixDropdownPanel'

// Settings-form standardized blocks (rows, groups, section labels, empty
// states) — the canonical panel layout vocabulary.
export {
  SettingsGroup,
  SettingsCard,
  SettingsSectionHeader,
  SettingsSectionLabel,
  SettingsEmptyState,
  SettingsRow,
  SettingsStaticBlock,
} from '../pages/settings/SettingsPrimitives'

// Theme + design tokens (the extension theming contract).
export {
  opptrixCssVars,
  FONT_SCALES,
} from '../theme/tokens'
export {
  designTokens,
  SPACING,
  RADIUS,
  Z,
  MOTION,
  CONTROL,
  semantic,
  designTokenCssVars,
} from '../theme/design-tokens'
export type { ThemePreference, ColorScheme, FontScaleName } from '../theme/tokens'

// Toast + dialog UX flows (never window.alert/confirm — repo rule).
export { useSettingsToast } from '../pages/settings/SettingsToast'
