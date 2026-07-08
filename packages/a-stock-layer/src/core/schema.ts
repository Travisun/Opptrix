/**
 * A-Stock 统一数据 Schema — 定义所有数据 Provider 返回的标准结构。
 * extends @opptrix/shared 中的基础类型（StockRealtime, StockKline 等）。
 *
 * 数据源说明：
 *   - 东方财富 (EastMoney): https://quote.eastmoney.com/
 *   - 巨潮资讯 (Cninfo):    https://www.cninfo.com.cn/
 *   - 自在量化 (Zzshare):    https://api.zizizaizai.com
 *   - BaoStock:              http://baostock.com/
 *   - TickFlow:              https://tickflow.com
 */
export type {
  FinancialSummary, QueryResult, StockKline, StockListItem, StockRealtime,
} from '@opptrix/shared'

/**
 * 个股资金流向 — 按单笔金额分档统计主力/超大单/大单/中单/小单净流入额。
 *
 * 用途：资金面分析、判断主力进出方向、辅助短线决策。
 * 数据源：东方财富资金流向接口 https://push2.eastmoney.com/api/qt/stock/fflow/kline/get
 */
export interface MoneyFlow {
  /** 股票代码，6 位纯数字（如 600519） */
  code: string
  /** 交易日期 YYYY-MM-DD */
  date: string
  /** 主力净流入额（元），正数为净流入，null 表示无数据 */
  mainNet?: number | null
  /** 超大单净流入额（元），单笔成交金额 ≥100 万元 */
  superLargeNet?: number | null
  /** 大单净流入额（元），单笔成交金额 20–100 万元 */
  largeNet?: number | null
  /** 中单净流入额（元），单笔成交金额 4–20 万元 */
  mediumNet?: number | null
  /** 小单净流入额（元），单笔成交金额 <4 万元 */
  smallNet?: number | null
  /** 主力净流入占比（%），即主力净流入额 / 当日总成交额 × 100 */
  mainNetPct?: number | null
  /** 当日收盘价（元） */
  close?: number | null
  /** 当日涨跌幅（%），如 3.5 表示 +3.5% */
  changePct?: number | null
}

/**
 * 指数实时行情 — 上证指数、深证成指、创业板指等主要指数的实时快照。
 *
 * 用途：大盘行情展示、市场情绪判断、指数对比分析。
 * 数据源：东方财富指数行情 https://push2.eastmoney.com/api/qt/ulist.np/get
 */
export interface IndexRealtime {
  /** 指数代码（如 000001 上证指数、399001 深证成指、399006 创业板指） */
  code: string
  /** 指数名称（如"上证指数"） */
  name?: string
  /** 最新点位 */
  price?: number | null
  /** 今开盘点位 */
  open?: number | null
  /** 最高点位 */
  high?: number | null
  /** 最低点位 */
  low?: number | null
  /** 昨收盘点位，用于计算涨跌幅 */
  preClose?: number | null
  /** 涨跌点数 = price - preClose */
  change?: number | null
  /** 涨跌幅（%），正数上涨、负数下跌 */
  changePct?: number | null
  /** 成交量（手），1 手 = 100 股 */
  volume?: number | null
  /** 成交额（元） */
  amount?: number | null
  /** 数据更新时间戳 ISO 8601 */
  timestamp?: string
}

/**
 * 指数日 K 线 — 单根日 K 线的 OHLC 与成交量。
 *
 * 用途：指数趋势分析、技术形态判断、历史走势回溯。
 * 数据源：东方财富 K 线 https://push2his.eastmoney.com/api/qt/stock/kline/get
 */
export interface IndexKline {
  /** 指数代码 */
  code: string
  /** 交易日期 YYYY-MM-DD */
  date: string
  /** 开盘点位 */
  open: number
  /** 收盘点位 */
  close: number
  /** 最高点位 */
  high: number
  /** 最低点位 */
  low: number
  /** 成交量（手） */
  volume?: number
  /** 成交额（元） */
  amount?: number
  /** 涨跌幅（%），首日无前值时为 null */
  changePct?: number | null
}

/**
 * 大盘资金流向 — 按方向统计上证、深证的当日净流入额与累计值。
 *
 * 用途：判断市场整体资金面、大盘多空情绪。
 * 数据源：东方财富大盘资金流向 https://push2.eastmoney.com/api/qt/stock/fflow/kline/get
 */
export interface MarketMoneyFlow {
  /** 资金方向标识（如"流入"、"流出"、"北向"、"南向"） */
  direction: string
  /** 交易日期 YYYY-MM-DD */
  date: string
  /** 净流入额（元），正数为净流入 */
  netAmount: number
  /** 上证净流入额（元） */
  shNet?: number | null
  /** 深证净流入额（元） */
  szNet?: number | null
  /** 累计净流入额（元），可选 */
  cumulative?: number | null
}

/**
 * 行业板块资金流向 — 按行业板块统计当日资金净流入额与涨跌幅。
 *
 * 用途：行业轮动分析、板块资金热度排名。
 * 数据源：东方财富板块资金 https://push2.eastmoney.com/api/qt/clist/get
 */
export interface SectorMoneyFlow {
  /** 板块代码（如 BK0477 电子信息、BK0733 白酒） */
  sectorCode: string
  /** 板块名称（如"电子信息"、"白酒"） */
  sectorName: string
  /** 交易日期 YYYY-MM-DD */
  date: string
  /** 板块净流入额（元），正数为净流入 */
  netAmount?: number | null
  /** 板块涨跌幅（%） */
  changePct?: number | null
}

/**
 * 个股基本面资料 — 公司的工商注册、行业分类、主营业务、地域、资本结构等综合信息。
 *
 * 用途：个股详情页展示、基本面筛选、公司研究。
 * 数据源：
 *   - 东方财富 F10 https://emweb.securities.eastmoney.com/PC_HSF10/CompanySurvey/Index?type=web&code=SH600519
 *   - 巨潮资讯 http://www.cninfo.com.cn/new/data/szse_stock.json
 */
export interface StockProfile {
  /** 股票代码，6 位纯数字（如 600519） */
  code: string
  /** 股票简称（如"贵州茅台"） */
  name?: string
  /** 公司全称（如"贵州茅台酒股份有限公司"） */
  orgName?: string
  /** 公司英文名称 */
  orgNameEn?: string
  /** 所属行业（如"白酒"、"银行"、"半导体"） */
  industry?: string
  /** 二级行业分类（如"酿酒行业"） */
  industrySecondary?: string
  /** 证监会行业分类代码与名称 */
  industryCsrc?: string
  /** 所属概念板块列表（如 ["锂电池", "人工智能", "新能源"]） */
  concepts?: string[]
  /** 上市日期 YYYY-MM-DD */
  listingDate?: string
  /** 公司成立日期 YYYY-MM-DD */
  foundDate?: string
  /** 主营业务简述（如"白酒生产与销售"） */
  mainBusiness?: string
  /** 公司简介长文本 */
  orgProfile?: string
  /** 经营范围描述 */
  businessScope?: string
  /** 总市值（元），null 表示未获取到 */
  totalMarketCap?: number | null
  /** 流通市值（元），即可在二级市场自由交易的市值 */
  circulatingMarketCap?: number | null
  /** 员工人数 */
  employees?: number | null
  /** 注册省份（如"贵州省"） */
  province?: string
  /** 注册城市（如"遵义市"） */
  city?: string
  /** 注册地址 */
  address?: string
  /** 办公地址 */
  officeAddress?: string
  /** 公司官网 URL */
  website?: string
  /** 公司电子邮箱 */
  orgEmail?: string
  /** 公司传真 */
  orgFax?: string
  /** IPO 主承销商 */
  leadUnderwriter?: string
  /** 注册资本（万元） */
  regCapital?: number | null
  /** 董事长姓名 */
  chairman?: string
  /** 法定代表人 */
  legalPerson?: string
  /** 董事会秘书姓名 */
  secretary?: string
  /** 公司联系电话 */
  orgTel?: string
  /** 证券类型（如"主板"、"创业板"、"科创板"） */
  securityType?: string
  /** 公司曾用名（如有） */
  formerName?: string
  /** 首次发行价（元） */
  issuePrice?: number | null
  /** 简况页最新指标报告期标签（如"2026一季报"） */
  metricsReportDate?: string
  /** 简况页最新财务/估值指标快照 */
  profileMetrics?: Array<{ label: string; value: string }>
}

/**
 * 新闻/公告条目 — 个股相关新闻或交易所公告的基本信息。
 *
 * 用途：个股资讯展示、公告筛选、舆情追踪。
 * 数据源：
 *   - 巨潮资讯公告 https://www.cninfo.com.cn/new/hisAnnouncement/query
 *   - 东财新闻 https://search-api-web.eastmoney.com/search/jsonp
 */
export interface NewsItem {
  /** 关联股票代码 */
  code: string
  /** 新闻/公告标题 */
  title: string
  /** 发布日期 YYYY-MM-DD */
  date: string
  /** 新闻链接 URL（网页版） */
  url?: string
  /** 公告 PDF 文件完整 URL */
  pdfUrl?: string
  /** 信息来源（如"巨潮资讯"、"东方财富"、"同花顺"） */
  source?: string
  /** 类型标识（如"公告"、"新闻"、"研报"） */
  type?: string
  /** 分类（如"定期报告"、"重大事项"、"股权激励"） */
  category?: string
}

/**
 * 舆情/情感评分 — 基于 NLP 分析的个股市场情绪数据。
 *
 * 用途：情绪面辅助判断、舆情预警、市场温度感知。
 * 数据源：东财/同花顺舆情接口
 */
export interface SentimentData {
  /** 股票代码 */
  code: string
  /** 情感分数，范围通常 0–100 或 -1~1，值越高越正面 */
  score?: number | null
  /** 情感标签（如"正面"、"负面"、"中性"） */
  label?: string
  /** 情感分析摘要文本 */
  summary?: string
  /** 分析时间戳 ISO 8601 */
  timestamp?: string
}

/**
 * 分红送转记录 — 上市公司历次现金分红、股票分红及实施进度。
 *
 * 用途：股息率计算、分红策略筛选、长期投资收益估算。
 * 数据源：
 *   - BaoStock query_dividend_data http://baostock.com/baostock_index.php
 *   - 东方财富分红送转 https://data.eastmoney.com/yjfp/
 */
export interface Dividend {
  /** 股票代码 */
  code: string
  /** 分红年度（如"2024"、"2023"） */
  year?: string
  /** 每 10 股现金分红金额（元） */
  cashBonus?: number | null
  /** 每 10 股送股或转增数量 */
  stockBonus?: number | null
  /** 除权除息日 YYYY-MM-DD */
  exDate?: string
  /** 股权登记日 YYYY-MM-DD */
  recordDate?: string
  /** 现金派息到账日 YYYY-MM-DD */
  payDate?: string
  /** 分配方案摘要（如"10派15元"、"10转3派2元"） */
  plan?: string
  /** 实施进度（如"预案"、"股东大会通过"、"实施"、"完成"） */
  progress?: string
}

/**
 * 龙虎榜上榜记录 — 沪深交易所公开的异常交易营业部买卖详情。
 *
 * 用途：游资动向追踪、机构席位分析、短线异动研判。
 * 数据源：
 *   - 东方财富龙虎榜 https://data.eastmoney.com/stock/lhb.html
 *   - 自在量化龙虎榜 https://api.zizizaizai.com/market/lhb/list
 */
export interface DragonTiger {
  /** 股票代码 */
  code: string
  /** 股票名称 */
  name: string
  /** 上榜日期 YYYY-MM-DD */
  date: string
  /** 上榜原因（如"日涨幅偏离值达7%"、"连续三个交易日涨停"） */
  reason?: string
  /** 买入总额（元）：龙虎榜买方席位合计 */
  buyAmount?: number | null
  /** 卖出总额（元）：龙虎榜卖方席位合计 */
  sellAmount?: number | null
  /** 净买入额（元）= buyAmount - sellAmount */
  netAmount?: number | null
  /** 当日涨跌幅（%） */
  changePct?: number | null
}

/**
 * 涨跌停记录 — 每日涨停/跌停个股列表及涨停原因。
 *
 * 用途：涨停板复盘、连板统计、市场赚钱效应判断。
 * 数据源：
 *   - 东方财富涨停板 https://data.eastmoney.com/stock/tradedetail.html
 *   - 自在量化涨停 https://api.zizizaizai.com/open/review/uplimit/hot
 */
export interface LimitUpDown {
  /** 股票代码 */
  code: string
  /** 股票名称 */
  name: string
  /** 日期 YYYY-MM-DD */
  date: string
  /** 涨停/跌停类型标识 */
  type: 'limit_up' | 'limit_down'
  /** 涨跌幅（%），涨停通常 +10% 或 +20%（创业板/科创板），跌停反之 */
  changePct?: number | null
  /** 涨停/跌停原因（如"锂电池概念"、"业绩预增"、"并购重组"） */
  reason?: string
}

/**
 * 全球指数行情 — 道琼斯、纳斯达克、恒生、日经等全球主要指数的实时点位。
 *
 * 用途：全球市场概览、A 股与外围市场联动分析。
 * 数据源：东方财富全球指数 https://push2.eastmoney.com/api/qt/ulist.np/get
 */
export interface GlobalIndex {
  /** 指数代码（如 DJI 道琼斯、IXIC 纳斯达克、HSI 恒生、N225 日经） */
  code: string
  /** 指数名称（如"道琼斯"、"纳斯达克"） */
  name: string
  /** 最新点位 */
  price?: number | null
  /** 涨跌幅（%） */
  changePct?: number | null
  /** 所属市场标识（如"US"、"HK"、"JP"、"UK"） */
  market?: string
  /** 数据更新时间 ISO 8601 */
  timestamp?: string
}

/**
 * 技术指标 — 常用移动平均线、RSI、MACD 等技术分析指标的计算结果。
 *
 * 用途：策略信号计算、趋势判断、技术形态识别。
 * 数据源：基于 K 线数据本地计算，K 线来源为东方财富/BaoStock
 */
export interface TechnicalIndicator {
  /** 股票代码 */
  code: string
  /** 指标计算日期 YYYY-MM-DD */
  date: string
  /** 5 日简单移动平均线（短期趋势线） */
  ma5?: number | null
  /** 10 日简单移动平均线 */
  ma10?: number | null
  /** 20 日简单移动平均线（月线） */
  ma20?: number | null
  /** 60 日简单移动平均线（季线） */
  ma60?: number | null
  /** 6 日 RSI（相对强弱指数，0–100，>70 超买，<30 超卖） */
  rsi6?: number | null
  /** 12 日 RSI（相对强弱指数，0–100） */
  rsi12?: number | null
  /** MACD DIF 值（快速 EMA - 慢速 EMA） */
  macd?: number | null
  /** MACD DEA 信号线（DIF 的 EMA 平滑） */
  macdSignal?: number | null
  /** MACD 柱状图 = DIF - DEA，正值为红柱、负值为绿柱 */
  macdHist?: number | null
}

/**
 * 筹码分布（Chip Distribution）— 基于东财 K 线数据计算的持仓成本分布。
 *
 * 用途：判断套牢盘/获利盘比例、成本集中度、支撑压力位。
 * 数据源：东方财富筹码分布 https://data.eastmoney.com/zlsj/
 * 对齐 AKShare stock_cyq_em 接口。
 */
export interface ChipDistribution {
  /** 股票代码 */
  code: string
  /** 计算基准日期 YYYY-MM-DD */
  date: string
  /** 获利比例，0–1，如 0.65 表示 65% 的持仓筹码处于盈利状态 */
  benefitPart: number
  /** 平均持仓成本（元） */
  avgCost: number
  /** 90% 筹码分布下界价格（元）：90% 的筹码成本高于此价 */
  cost90Low: number
  /** 90% 筹码分布上界价格（元）：90% 的筹码成本低于此价 */
  cost90High: number
  /** 90% 集中度 = (cost90High - cost90Low) / (cost90High + cost90Low)，越小表示筹码越集中 */
  cost90Con: number
  /** 70% 筹码分布下界价格（元） */
  cost70Low: number
  /** 70% 筹码分布上界价格（元） */
  cost70High: number
  /** 70% 集中度 */
  cost70Con: number
}

/**
 * 筹码价位档位 — 某一具体价位上的标准化筹码权重。
 *
 * 用途：绘制筹码分布直方图/山峰图，辅助判断支撑压力位。
 */
export interface ChipPriceLevel {
  /** 价位（元） */
  price: number
  /** 标准化筹码权重，0–1，值越大表示该价位筹码越密集 */
  weight: number
}

/**
 * 完整筹码分布 — 包含当前价格和各价位档位的完整分布数据。
 *
 * 用途：筹码分布图渲染、获利盘分析、成本区间判断。
 * 继承 ChipDistribution 基础属性，增加价位级别细节。
 */
export interface ChipDistributionProfile extends ChipDistribution {
  /** 当前股票最新价格（元），用于在分布图上标记当前位置 */
  currentPrice: number
  /** 各价位档位的筹码权重数组，按价位升序排列，用于绘制分布曲线 */
  levels: ChipPriceLevel[]
}
