/**
 * @opptrix/canvas — curated React components for Agent analysis panels.
 *
 * Design principles (apply across all exports):
 * - Flat and restrained: no gradients, heavy shadows, or decorative glyphs
 * - Colors only via useCanvasTheme() / semantic tokens (theme.ts); avoid ad-hoc hex in UI code
 * - Prefer open chapters (Stack + headings) with sparse cards — not every block needs Card
 * - Default layout is fluid width, not a fixed paper size
 * - Type scale: h1 24/30, h2 18/24, h3 16/22, body 14/20, small 12/16 (weight 590 / 400)
 *
 * Host must import `@opptrix/canvas/styles.css` once.
 *
 * @example
 * ```tsx
 * import { Surface, Stack, H1, Text, Stat, Grid } from '@opptrix/canvas'
 * import '@opptrix/canvas/styles.css'
 *
 * export default function Report() {
 *   return (
 *     <Surface>
 *       <Stack gap="24px">
 *         <H1>营收概览</H1>
 *         <Text tone="secondary">近四季表现</Text>
 *         <Grid columns={2}>
 *           <Stat value="12.4 亿" label="营收" tone="info" />
 *           <Stat value="3.1 亿" label="净利" />
 *         </Grid>
 *       </Stack>
 *     </Surface>
 *   )
 * }
 * ```
 */

export { cx } from './cx.js'

export {
  canvasTokensLight,
  canvasTokensDark,
  canvasTypeScale,
  canvasSpaceScale,
  canvasRadiusScale,
  getCanvasTokens,
  groupCanvasTokens,
  tokensToCssVars,
  type CanvasColorScheme,
  type CanvasSemanticTokens,
  type CanvasTokenGroups,
  type CanvasTypeScale,
} from './theme.js'

export {
  useCanvasTheme,
  type UseCanvasThemeOptions,
  type CanvasThemeValue,
} from './useCanvasTheme.js'

export { Surface, type SurfaceProps } from './components/Surface.js'
export { Stack, type StackProps } from './components/Stack.js'
export { Row, type RowProps } from './components/Row.js'
export { Grid, type GridProps } from './components/Grid.js'
export { Spacer, type SpacerProps } from './components/Spacer.js'
export { Divider, type DividerProps } from './components/Divider.js'
export { Text, type TextProps, type TextTone, type TextSize, type TextAlign } from './components/Text.js'
export { H1, type HeadingProps as H1Props } from './components/H1.js'
export { H2, type HeadingProps as H2Props } from './components/H2.js'
export { H3, type HeadingProps as H3Props } from './components/H3.js'
export { Card, type CardProps, type CardVariant, type CardSize } from './components/Card.js'
export { CardHeader, type CardHeaderProps } from './components/CardHeader.js'
export { CardBody, type CardBodyProps } from './components/CardBody.js'
export { Stat, type StatProps, type StatTone } from './components/Stat.js'
export {
  Table,
  type TableProps,
  type TableColumn,
  type TableColumnAlign,
  type TableRowTone,
} from './components/Table.js'
export {
  Callout,
  type CalloutProps,
  type CalloutTone,
  type CalloutVariant,
  type CalloutSize,
} from './components/Callout.js'
export {
  Quote,
  type QuoteProps,
  type QuoteTone,
  type QuoteSize,
} from './components/Quote.js'
export { Pill, type PillProps, type PillTone, type PillSize } from './components/Pill.js'
export { Button, type ButtonProps, type ButtonVariant } from './components/Button.js'
export { Code, type CodeProps } from './components/Code.js'
export { Link, type LinkProps } from './components/Link.js'
export {
  Chart,
  type ChartProps,
  type ChartDatum,
  type ChartType,
} from './components/Chart.js'
