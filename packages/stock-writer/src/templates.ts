export type ArticleType = 'value' | 'technical' | 'chain' | 'earnings' | 'event' | 'compare' | 'review'

export interface ArticleTemplate {
  name: string
  required: string[]
  recommended: string[]
}

export const DATA_TEMPLATES: Record<ArticleType, ArticleTemplate> = {
  value: {
    name: '价值分析',
    required: ['realtime', 'financials', 'dividend', 'main_business', 'profile'],
    recommended: ['balance_sheet', 'cash_flow', 'inst_holding', 'peer_companies'],
  },
  technical: {
    name: '技术分析',
    required: ['realtime', 'kline', 'tech_indicator', 'money_flow'],
    recommended: ['intraday_tick', 'market_breadth', 'sector_money_flow', 'dragon_tiger'],
  },
  chain: {
    name: '产业链分析',
    required: ['main_business', 'top_customer', 'top_supplier', 'subsidiaries', 'rd_investment'],
    recommended: ['actual_controller', 'related_party', 'peer_companies', 'profile'],
  },
  earnings: {
    name: '财报解读',
    required: ['income_statement', 'balance_sheet', 'cash_flow', 'financials', 'realtime'],
    recommended: ['perf_forecast', 'dividend', 'rd_investment', 'shareholders'],
  },
  event: {
    name: '事件驱动',
    required: ['news', 'realtime', 'sentiment', 'money_flow'],
    recommended: ['insider_trade', 'lockup_expiry', 'share_pledge', 'intraday_tick'],
  },
  compare: {
    name: '对比分析',
    required: ['profile', 'financials', 'main_business', 'realtime'],
    recommended: ['peer_companies', 'rd_investment', 'inst_holding'],
  },
  review: {
    name: '实盘复盘',
    required: ['realtime', 'kline', 'portfolio_trades'],
    recommended: ['money_flow', 'news'],
  },
}

export const ARTICLE_TYPES = Object.keys(DATA_TEMPLATES) as ArticleType[]

export function listArticleTypes() {
  return ARTICLE_TYPES.map(k => ({ type: k, name: DATA_TEMPLATES[k].name }))
}
