/**
 * Markdown render theme — customize colors & spacing in:
 *   client-ui/src/styles/markdown/tokens.css
 *
 * CSS variables on `.opptrix-md` mirror these defaults for quick overrides.
 */
export const markdownTokens = {
  /** Base typography */
  lineHeight: 1.47,
  blockGap: '0.45em',
  headingGapTop: '0.55em',
  headingGapBottom: '0.2em',
  listIndent: '1.15em',
  listItemGap: '0.15em',

  /** Text */
  text: '#141414',
  textMuted: 'rgba(20, 20, 20, 0.74)',
  textSubtle: 'rgba(20, 20, 20, 0.60)',

  /** Links */
  link: '#141414',
  linkHover: '#000000',
  linkUnderline: 'rgba(20, 20, 20, 0.28)',

  /** Inline / block code */
  codeBg: 'rgba(20, 20, 20, 0.06)',
  codeFg: '#141414',
  preBg: 'rgba(20, 20, 20, 0.045)',
  prePadding: '10px 12px',

  /** Blockquote */
  blockquoteFg: 'rgba(20, 20, 20, 0.74)',
  blockquoteBorder: 'rgba(20, 20, 20, 0.14)',
  blockquoteBg: 'rgba(20, 20, 20, 0.03)',
  blockquoteBorderNested: 'rgba(20, 20, 20, 0.1)',

  /** Divider */
  hr: 'rgba(20, 20, 20, 0.1)',

  /** Table — borderless, compact cells */
  tableHeaderWeight: 600,
  tableHeaderFg: '#141414',
  tableCellFg: '#141414',
  tableCellPaddingY: '3px',
  tableCellPaddingX: '0px',
  tableRowDivider: 'rgba(20, 20, 20, 0.1)',
  tableCopyIconSize: '18px',
  tableCopyFg: 'rgba(20, 20, 20, 0.74)',
  tableCopyFgHover: '#141414',

  /** Mermaid / diagram */
  mermaidBg: 'rgba(20, 20, 20, 0.03)',
  mermaidPadding: '10px',

  /** Error states */
  error: '#FF3B30',
  errorBorder: 'rgba(255, 59, 48, 0.22)',

  /** Semantic tag tones (strong / emphasis / highlight / strike) */
  strongFg: '#141414',
  emFg: 'rgba(20, 20, 20, 0.74)',
  markBg: 'rgba(255, 149, 0, 0.14)',
  markFg: '#141414',
  delFg: 'rgba(20, 20, 20, 0.60)',
  underline: 'rgba(20, 20, 20, 0.36)',
  toneAccent: '#007AFF',
  preBorder: 'rgba(20, 20, 20, 0.08)',
  preLangFg: 'rgba(20, 20, 20, 0.60)',
  kbdBg: 'rgba(20, 20, 20, 0.06)',
  kbdBorder: 'rgba(20, 20, 20, 0.12)',

  /** Optional badge-like tags in prose */
  tagNeutralBg: 'rgba(20, 20, 20, 0.06)',
  tagNeutralFg: 'rgba(20, 20, 20, 0.74)',
  tagInfoBg: 'rgba(20, 20, 20, 0.06)',
  tagInfoFg: '#141414',
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
