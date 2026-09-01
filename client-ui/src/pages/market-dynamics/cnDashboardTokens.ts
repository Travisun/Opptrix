/** A 股市场动态 Dashboard 排版常量（对齐 Stocky 类金融看板密度） */
export const CN_DASH = {
  pagePad: '16px',
  pageGap: '16px',
  cardGap: '12px',
  cardRadius: '12px',
  cardPad: '14px 16px',
  cardBorder: '1px solid var(--opptrix-separator)',
  headPad: '14px 16px 10px',
  bodyPad: '0 16px 16px',
  labelSize: '10px',
  labelTracking: '0.08em',
  heroPriceSize: '26px',
  tableRowPad: '10px 4px',
  tableHeadTracking: '0.06em',
} as const

/** 移动 Web 市场动态：更紧的页边距与卡片 */
export const CN_DASH_MOBILE = {
  pagePad: '10px',
  pageGap: '10px',
  cardGap: '8px',
  headPad: '10px 12px 8px',
  /** 加宽指数卡，便于完整展示名称 */
  heroCardMin: '200px',
  chartHeight: 'min(58vw, 300px)',
} as const
