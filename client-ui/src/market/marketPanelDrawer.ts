/** 右栏底部抽屉（持仓录入 / 管理分组等）统一最大宽度 */
export const MARKET_PANEL_DRAWER_MAX_WIDTH = 440

/**
 * 移动端勿用 %（父级高度不定时失效会撑满屏，无法点遮罩关闭）。
 * 用 dvh 限制高度，顶部留出可点的 scrim。
 */
export const MARKET_PANEL_DRAWER_MAX_HEIGHT = 'min(80dvh, 640px)'

/**
 * 市场动态个股走势 sheet：固定占位高度（勿仅设 maxHeight，否则加载态会缩成矮条贴底）。
 * 约半屏偏上（60dvh）：留出列表上下文与可点遮罩，主区仍够画图，底部可放名称等信息。
 */
export const MARKET_INSIGHT_CHART_DRAWER_HEIGHT = '60dvh'

export const MARKET_PANEL_DRAWER_CLOSE_MS = 220
