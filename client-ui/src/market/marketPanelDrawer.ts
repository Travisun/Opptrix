/** 右栏底部抽屉（持仓录入 / 管理分组等）统一最大宽度 */
export const MARKET_PANEL_DRAWER_MAX_WIDTH = 440

/**
 * 移动端勿用 %（父级高度不定时失效会撑满屏，无法点遮罩关闭）。
 * 用 dvh 限制高度，顶部留出可点的 scrim。
 */
export const MARKET_PANEL_DRAWER_MAX_HEIGHT = 'min(80dvh, 640px)'

export const MARKET_PANEL_DRAWER_CLOSE_MS = 220
