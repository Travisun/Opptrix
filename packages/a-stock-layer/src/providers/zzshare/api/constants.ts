/** 自在量化 API 默认基地址 */
export const DEFAULT_BASE_URL = 'https://api.zizizaizai.com'

/**
 * 自在量化 API 鉴权等级。
 * - open:  免费接口，无需 Token（匿名模式可用）
 * - token: 付费接口，需配置有效 Token
 */
export type ZzshareAuthTier = 'open' | 'token'

/**
 * 自在量化快捷端点参数定义 — 支持数组和对象两种格式。
 * - string[]: 按位置索引映射到端点路径参数
 * - Record:   按参数名映射，支持默认值
 */
export type ZzshareParamNames = string[] | Record<string, string | number | boolean>

/**
 * 自在量化快捷端点定义 — 映射到具体 API 路径和参数。
 *
 * 用途：ZzshareClient 自动注册快捷方法，无需手动构造 URL。
 * 数据源：自在量化开放平台 https://quant.zizizaizai.com
 */
export interface ZzshareShortcut {
  /** API 路径模板（如 "market/trade/days"、"v3/market/kline/day/{code}"） */
  path: string
  /** 参数定义：数组格式按位置映射，对象格式按名称映射（含默认值） */
  params: ZzshareParamNames
  /** 端点功能描述 */
  description: string
  /** 鉴权等级：open=免费、token=需付费 Token */
  auth: ZzshareAuthTier
}

/** Shortcut endpoints mirrored from zzshare Python `DataApi.SHORTCUTS` */
export const SHORTCUTS: Record<string, ZzshareShortcut> = {
  uplimit_hot: {
    path: 'open/review/uplimit/hot',
    params: ['date1', 'board'],
    description: '获取当日涨停热点板块及其连板梯队数据',
    auth: 'open',
  },
  uplimit_stocks: {
    path: 'open/review/uplimit/stocks/{date1}',
    params: ['date1'],
    description: '获取指定日期所有涨停股票的列表',
    auth: 'open',
  },
  market_plate_stocks: {
    path: 'v3/market/plates/{plate_type}/{plate_code}/stocks/rank',
    params: ['plate_type', 'plate_code', 'date1', 'is_real', 'limit'],
    description: '获取特定板块内的成分股,按照人气排名',
    auth: 'open',
  },
  market_plate_popular_reason: {
    path: 'v3/market/plate/popular/reason',
    params: ['plate_code', 'date2'],
    description: '获取板块题材的爆点/原因列表',
    auth: 'open',
  },
  market_sentiment: {
    path: 'v3/market/sentiment/0/kline',
    params: ['date1', 'date2'],
    description: '综合市场情绪数据量化出来的 K 线数据',
    auth: 'open',
  },
  market_hot_sentiment: {
    path: 'v3/market/sentiment/20/kline',
    params: ['date1', 'date2'],
    description: '市场热度数据量化出来的 K 线数据',
    auth: 'open',
  },
  market_style: {
    path: 'v2/api/timing/market/style',
    params: ['date1'],
    description: '市场风格评估数据,适合什么风格的市场,量化出来的K线数据',
    auth: 'open',
  },
  open_sentiment_data: {
    path: 'v3/sentiment/data',
    params: ['date1', 'date2'],
    description: '多维情绪聚合数据接口',
    auth: 'open',
  },
  sentiment_timing: {
    path: 'v3/sentiment/timing',
    params: ['date1', 'date2'],
    description: '获取 VIP 择时信号数据（需 sentiment_vip 权限）',
    auth: 'token',
  },
  daily: {
    path: 'open/kline/d/{code}',
    params: ['code', 'date1', 'date2'],
    description: '获取日线行情数据',
    auth: 'open',
  },
  plate_kline: {
    path: 'v3/market/kline/plate/{b_code}',
    params: ['b_code', 'date1', 'date2'],
    description: '获取指定板块的日线行情数据（例如同花顺全A 883957，主要用来查看全市场成交量）',
    auth: 'open',
  },
  trade_days: {
    path: 'market/trade/days',
    params: ['day_start', 'day_end', 'days'],
    description: '查询 A 股交易日历（识别交易日与假期）',
    auth: 'open',
  },
  ths_hot_top: {
    path: 'open/sentiment/media/ths2/top',
    params: ['date1', 'top_n'],
    description: '获取同花顺热搜榜前 N 名龙头的实时排名',
    auth: 'open',
  },
  stock_ths_hot: {
    path: 'v2/api/sentiment/media/ths/symbol/{code}',
    params: ['code', 'date1'],
    description: '查询特定股票在同花顺平台的热度趋势',
    auth: 'open',
  },
  sentiment_market_hot_day: {
    path: 'v3/api/sentiment/market/hot/day',
    params: ['date'],
    description: '每日市场核心热点数据统计',
    auth: 'open',
  },
  sentiment_trend: {
    path: 'v3/api/sentiment/trend/{model}',
    params: ['model', 'date1'],
    description: '基于特定模型计算的市场情绪分时数据(单日)',
    auth: 'open',
  },
  sentiment_trend_range: {
    path: 'v3/api/sentiment/trend/{model}/range',
    params: ['model', 'date1', 'date2'],
    description: '基于特定模型计算的市场情绪分时数据(多日区间)',
    auth: 'open',
  },
  review_uplimit_reason: {
    path: 'v3/api/review/uplimit/reason',
    params: ['date1', 'group', 'page', 'page_size'],
    description: '全市场涨停复盘：包含个股具体的涨停原因与逻辑分析',
    auth: 'open',
  },
  review_uplimit_hot_step: {
    path: 'v3/open/review/uplimit/hot',
    params: ['date1', 'board', 'limit'],
    description: '指定板块下的涨停梯队',
    auth: 'open',
  },
  stock_uplimit_reason: {
    path: 'v3/open/stock/uplimit/reason/{stock_code}',
    params: ['stock_code', 'date'],
    description: '查询单只股票指定日期的涨停原因',
    auth: 'open',
  },
  stock_uplimit_reason_history: {
    path: 'v3/open/stock/uplimit/reason/history/{stock_code}',
    params: ['stock_code', 'page', 'pageSize'],
    description: '查询个股历史所有涨停记录及原因',
    auth: 'open',
  },
  review_uplimit_reason_open: {
    path: 'v3/open/review/uplimit/reason',
    params: ['date1'],
    description: '指定日期全部涨停个股的涨停数据和原因汇总',
    auth: 'open',
  },
  stock_info: {
    path: 'v3/open/stock/info',
    params: ['stock_id', 'info_type'],
    description: '获取股票的基础信息扩展字段',
    auth: 'open',
  },
  lhb_list: {
    path: 'market/lhb/list',
    params: ['date1'],
    description: '龙虎榜每日上榜股票概览列表',
    auth: 'open',
  },
  lhb_detail: {
    path: 'market/lhb/detail',
    params: ['date1', 'stock_code'],
    description: '查询特定股票的龙虎榜席位买卖详情',
    auth: 'open',
  },
  lhb_stock_history: {
    path: 'market/lhb/stock/history',
    params: ['stock_code', 'trader_name'],
    description: '查询个股或特定营业部的历史龙虎榜表现',
    auth: 'open',
  },
  lhb_trader_history: {
    path: 'market/lhb/trader/history',
    params: ['trader_name', 'trader_id', 'stock_code', 'page', 'per_page'],
    description: '龙虎榜知名游资/席位的历史交易轨迹',
    auth: 'open',
  },
  plates_list: {
    path: 'market/plates/{plate_type}',
    params: ['plate_type'],
    description: '获取指定类型（17(题材)/15(概念)/14(行业)）的所有板块列表',
    auth: 'open',
  },
  plates_rank: {
    path: 'v3/market/plates/{plate_type}/rank',
    params: ['plate_type', 'date1', 'limit'],
    description: '获取全市场所有板块（17(题材)/15(概念)/14(行业)）的热度排名',
    auth: 'open',
  },
  plates_trend: {
    path: 'market/plates/{plate_type}/trend',
    params: ['plate_type', 'plate_code', 'day_start', 'day_end'],
    description: '指定板块的分时数据',
    auth: 'open',
  },
  plates_rank_days: {
    path: 'v3/market/plates/{plate_type}/rank/days',
    params: ['plate_type', 'date2', 'n_days', 'n_type', 'limit'],
    description: '查询板块类型在过去 N 天内的区间涨跌幅排名（如近5日、10日价格/热度区间排名）',
    auth: 'open',
  },
  plates_rank_days_new: {
    path: 'v3/market/plates/{plate_type}/rank/days/new',
    params: ['plate_type', 'date2', 'n_days', 'n_type', 'limit', 'prev_days'],
    description: '获取指定板块Top N，并标记是否是前几天新进的（区间排名+新进标记）',
    auth: 'open',
  },
  plates_stocks: {
    path: 'market/plates/{plate_type}/{plate_code}/stocks',
    params: ['plate_type', 'plate_code', 'date'],
    description: '查询特定板块包含的所有个股详情',
    auth: 'open',
  },
  updown_distribution: {
    path: 'open/sentiment/updown/disctribution',
    params: ['date1'],
    description: '全市场每日上涨、下跌家数分布及涨停/跌停总数统计',
    auth: 'open',
  },
  uplimit_trend: {
    path: 'open/sentiment/uplimit/trend',
    params: ['date1'],
    description: '全市场涨停家数趋势及赚钱效应分析',
    auth: 'open',
  },
  sentiment_hot_day: {
    path: 'open/sentiment/hot/day',
    params: ['index', 'st'],
    description: '市场每日核心人气热点排名',
    auth: 'open',
  },
  sentiment_bull_data: {
    path: 'open/sentiment/bull/data',
    params: ['date1', 'date2'],
    description: '多空情绪对比及牛市指标参考',
    auth: 'open',
  },
  stock_moneyflow: {
    path: 'open/stock/{stock_id}/moneyflow',
    params: ['stock_id', 'm_type'],
    description: '个股实时主力主力资金流向（超大单/大单等）',
    auth: 'open',
  },
  market_mf: {
    path: 'open/market/mf',
    params: ['stock', 'date', 'wm', 'default_v'],
    description: '全量市场资金流分布概览（分钟级）',
    auth: 'open',
  },
  sentiment_market_top_n: {
    path: 'v2/api/sentiment/market/top/n',
    params: ['modal_id', 'date1', 'date2'],
    description: '市场最热的前 N 名热点概念动态跟踪',
    auth: 'open',
  },
  uplimit_market_value: {
    path: 'v2/api/uplimit/market/value',
    params: ['date1', 'date2'],
    description: '基于市值的涨停板个股分布统计',
    auth: 'open',
  },
  movement_alerts: {
    path: 'market/movement/alerts',
    params: ['date1', 'type', 'limit', 'is_real'],
    description: '沪深涨幅触发监管以及距离触发的空间',
    auth: 'open',
  },
  zdjk_get: {
    path: 'open/zdjk/get',
    params: ['date1', 'date2'],
    description: '已经触发监管的股票列表',
    auth: 'open',
  },
  ai_report_list: {
    path: 'v3/ai-report/list',
    params: ['type', 'page', 'page_size'],
    description: '获取 AI 每日收盘/盘前报告列表',
    auth: 'open',
  },
  ai_report_detail: {
    path: 'v3/ai-report/detail/{post_id}',
    params: ['post_id'],
    description: '获取 AI 报告的具体详情内容',
    auth: 'open',
  },
  topic_table_list: {
    path: 'v3/topic/tables',
    params: { page: 1, limit: 20, brief: 1 },
    description: '获取题材库表格列表',
    auth: 'open',
  },
  topic_table_detail: {
    path: 'v3/topic/table/{tid}',
    params: ['tid'],
    description: '获取题材库表格的详细行数据内容',
    auth: 'open',
  },
  topic_table_stocks: {
    path: 'v3/topic/table/{tid}/stocks',
    params: ['tid'],
    description: '获取题材库下关联的个股列表',
    auth: 'open',
  },
  topic_kline: {
    path: 'v3/topic/table/{tid}/kline',
    params: ['tid', 'start_date'],
    description: '获取题材合成指数的 K 线数据',
    auth: 'open',
  },
}

/** Custom methods with dedicated implementations (not auto-registered from SHORTCUTS) */
export const CUSTOM_METHOD_NAMES = new Set([
  'daily',
  'plates_rank',
  'plates_rank_days',
  'plates_rank_days_new',
  'rt_k',
  'stk_mins',
  'stock_basic',
])

export const SHORTCUT_ENDPOINT_COUNT = Object.keys(SHORTCUTS).length
