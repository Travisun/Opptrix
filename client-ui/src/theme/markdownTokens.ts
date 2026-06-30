/**
 * Markdown render theme — customize colors & spacing in:
 *   client-ui/src/styles/markdown/tokens.css
 *
 * CSS variables on `.inno-md` mirror these defaults for quick overrides.
 */
export const markdownTokens = {
  /** Base typography */
  lineHeight: 1.58,
  blockGap: '0.45em',
  headingGapTop: '0.75em',
  headingGapBottom: '0.3em',
  listIndent: '1.15em',
  listItemGap: '0.15em',

  /** Text */
  text: '#1D1D1F',
  textMuted: '#6E6E73',
  textSubtle: '#AEAEB2',

  /** Links */
  link: '#1D1D1F',
  linkHover: '#000000',
  linkUnderline: 'rgba(60, 60, 67, 0.28)',

  /** Inline / block code */
  codeBg: 'rgba(29, 29, 31, 0.06)',
  codeFg: '#1D1D1F',
  preBg: 'rgba(60, 60, 67, 0.045)',
  prePadding: '10px 12px',

  /** Blockquote */
  blockquoteFg: '#6E6E73',
  blockquoteBorder: 'rgba(60, 60, 67, 0.14)',
  blockquoteBg: 'rgba(60, 60, 67, 0.03)',
  blockquoteBorderNested: 'rgba(60, 60, 67, 0.1)',

  /** Divider */
  hr: 'rgba(60, 60, 67, 0.1)',

  /** Table — borderless, compact cells */
  tableHeaderWeight: 600,
  tableHeaderFg: '#1D1D1F',
  tableCellFg: '#1D1D1F',
  tableCellPaddingY: '3px',
  tableCellPaddingX: '0px',
  tableRowDivider: 'rgba(60, 60, 67, 0.1)',
  tableCopyIconSize: '18px',
  tableCopyFg: '#6E6E73',
  tableCopyFgHover: '#1D1D1F',

  /** Mermaid / diagram */
  mermaidBg: 'rgba(60, 60, 67, 0.03)',
  mermaidPadding: '10px',

  /** Error states */
  error: '#FF3B30',
  errorBorder: 'rgba(255, 59, 48, 0.22)',

  /** Semantic tag tones (strong / emphasis / highlight / strike) */
  strongFg: '#1D1D1F',
  emFg: '#6E6E73',
  markBg: 'rgba(255, 149, 0, 0.14)',
  markFg: '#1D1D1F',
  delFg: '#AEAEB2',
  underline: 'rgba(60, 60, 67, 0.36)',
  toneAccent: '#007AFF',
  preBorder: 'rgba(60, 60, 67, 0.08)',
  preLangFg: '#AEAEB2',
  kbdBg: 'rgba(29, 29, 31, 0.06)',
  kbdBorder: 'rgba(60, 60, 67, 0.12)',

  /** Optional badge-like tags in prose */
  tagNeutralBg: 'rgba(29, 29, 31, 0.06)',
  tagNeutralFg: '#6E6E73',
  tagInfoBg: 'rgba(29, 29, 31, 0.06)',
  tagInfoFg: '#1D1D1F',
  tagSuccessBg: 'rgba(52, 199, 89, 0.1)',
  tagSuccessFg: '#248A3D',
  tagWarningBg: 'rgba(255, 149, 0, 0.12)',
  tagWarningFg: '#C93400',
  tagErrorBg: 'rgba(255, 59, 48, 0.1)',
  tagErrorFg: '#D70015',

  /** Radius */
  radiusCode: '5px',
  radiusPre: '8px',
  radiusMermaid: '8px',
} as const

export type MarkdownTokens = typeof markdownTokens
