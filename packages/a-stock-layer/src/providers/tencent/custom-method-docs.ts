import type { CustomMethodApiDoc } from '../common/custom-method-doc-types.js'
import { toCustomMethodDef } from '../common/custom-method-doc-types.js'

const PROXY = 'https://proxy.finance.qq.com'
const MSTATS = 'https://stockapp.finance.qq.com/mstats'

const INVOKE = (method: string, args = '["300308"]') =>
  `engine.invokeCustomMethod("tencent", "${method}", ${args})`

export const TENCENT_METHOD_DOCS: Record<string, CustomMethodApiDoc> = {
  tencentGlobalFuturesList: {
    method: 'tencentGlobalFuturesList',
    description: '全球期货实时列表（能源/贵金属/农产品/利率/汇率/股指期货等）',
    sourceUrl: `${PROXY}/ifzqgtimg/appstock/app/rank/worldCommodities`,
    pageUrl: `${MSTATS}/#mod=list&id=qh_global&module=GQH&type=ALL`,
    params: [
      { name: 'category', type: 'string', description: '品类：ALL、energy、preciousMetal、agriculture、basicMetal、exchangeRate、interestRate、stockIndex；支持中文别名如「能源」', default: 'ALL' },
      { name: 'page', type: 'number', description: '页码，从 1 开始（客户端分页）', default: 1 },
      { name: 'pageSize', type: 'number', description: '每页条数，最大 200', default: 40 },
      { name: 'sortType', type: 'string', description: '排序：0 名称 / 1 最新价 / 2 涨跌额 / 3 涨跌幅，或字段名 zxj/zde/zdf', default: 1 },
      { name: 'order', type: 'string', description: 'desc|down 降序，asc|up 升序', default: 'desc' },
    ],
    returns: '[{ category, page, pageSize, total, items: [{ code, qtCode, name, price, changeAmt, changePct, exchange, tradeStateLabel, categoryLabel, ... }], source }]',
    usage: INVOKE('tencentGlobalFuturesList', '["ALL",1,40,3,"desc"]'),
    notes: '上游一次返回全部分类；筛选/排序/分页在本地完成。报价延迟约 15 分钟（与 mstats 页一致）。',
    example: '{"provider":"tencent","method":"tencentGlobalFuturesList","args":["ALL",1,40,3,"desc"]}',
  },

  tencentGlobalIndexList: {
    method: 'tencentGlobalIndexList',
    description: '全球股指列表（亚/欧/美/其他分区或 ALL 去重合并）',
    sourceUrl: `${PROXY}/ifzqgtimg/appstock/app/rank/indexRankDetail2`,
    pageUrl: `${MSTATS}/#mod=list&id=indices&module=GIDX&type=ALL`,
    params: [
      { name: 'region', type: 'string', description: '分区：ALL、EU、europe、AM、america、AS、asia、OA、other', default: 'ALL' },
      { name: 'page', type: 'number', description: '页码（客户端分页）', default: 1 },
      { name: 'pageSize', type: 'number', description: '每页条数', default: 40 },
      { name: 'sortType', type: 'string', description: '0 名称 / 1 最新价 / 2 涨跌幅', default: 1 },
      { name: 'order', type: 'string', description: 'desc|down 或 asc|up', default: 'desc' },
    ],
    returns: '[{ region, page, pageSize, total, items: [{ code, qtCode, name, price, changePct, location, tradeStateLabel, region, market }], source }]',
    usage: INVOKE('tencentGlobalIndexList', '["ALL",1,40,2,"desc"]'),
    notes: 'ALL 合并 common/america/europe/asia/other 并按 qtcode 去重。延迟约 15 分钟。',
    example: '{"provider":"tencent","method":"tencentGlobalIndexList","args":["EU",1,20,2,"desc"]}',
  },

  tencentExchangeRateList: {
    method: 'tencentExchangeRateList',
    description: '全球外汇汇率列表（mstats ER：基本汇率 + 交叉汇率）',
    sourceUrl: 'https://qt.gtimg.cn/?q=whUSDCNY,whEURUSD,...',
    pageUrl: `${MSTATS}/#mod=list&id=exchange&module=ER&type=ALL`,
    params: [
      { name: 'category', type: 'string', description: 'ALL、BASE（基本汇率）、CROSS（交叉汇率）；支持中文「基本汇率」', default: 'ALL' },
      { name: 'page', type: 'number', description: '页码，从 1 开始（客户端分页）', default: 1 },
      { name: 'pageSize', type: 'number', description: '每页条数，最大 200', default: 40 },
      { name: 'sortType', type: 'string', description: '0 名称 / 1 货币对 / 2 最新价 / 3 涨跌幅 / 4 涨跌额', default: 3 },
      { name: 'order', type: 'string', description: 'desc|down 降序，asc|up 升序', default: 'desc' },
    ],
    returns: '[{ category, page, pageSize, total, items: [{ code, qtCode, name, price, changeAmt, changePct, preClose, open, high, low, bid, ask, quoteTime, categoryLabel, market }], source }]',
    usage: INVOKE('tencentExchangeRateList', '["ALL",1,40,3,"desc"]'),
    notes: '数据源为 qt.gtimg.cn wh* 代码（与 mstats listTPL.ER 一致）；非 worldCommodities 的 exchangeRate 期货桶。Capability exchangeRate(pair) 亦走此接口。',
    example: '{"provider":"tencent","method":"tencentExchangeRateList","args":["BASE",1,20,3,"desc"]}',
  },

  tencentShenwanIndustryList: {
    method: 'tencentShenwanIndustryList',
    description: '申万行业板块列表（一级/二级，含阶段涨跌幅与领涨股）',
    sourceUrl: `${PROXY}/cgi/cgi-bin/rank/pt/getRank?board_type=hy|hy2&sort_type=...&offset=...&count=...`,
    pageUrl: `${MSTATS}/#mod=list&id=hy_first&module=hy&type=first`,
    params: [
      { name: 'level', type: 'string', description: 'first（申万一级，board_type=hy）或 second（二级，hy2）', default: 'first' },
      { name: 'page', type: 'number', description: '页码', default: 1 },
      { name: 'pageSize', type: 'number', description: '每页条数，最大 100', default: 20 },
      { name: 'sortType', type: 'string', description: 'sort_type 或列序号：2 最新价、3 涨跌幅、priceRatioD5 等', default: 'priceRatio' },
      { name: 'order', type: 'string', description: 'desc/down 或 asc/up → direct=down|up', default: 'desc' },
    ],
    returns: '[{ level, page, pageSize, total, items: [{ industryCode, name, price, changePct, changePct5d/20d/60d/52w/ytd, leadingStock, level, ... }], source }]',
    usage: INVOKE('tencentShenwanIndustryList', '["first",1,20,"priceRatio","desc"]'),
    notes: '一级约 31 条、二级约 124 条。行业代码格式 pt01801780，用于成分股接口。',
    example: '{"provider":"tencent","method":"tencentShenwanIndustryList","args":["first",2,20,3,"desc"]}',
  },

  tencentIndustryConstituents: {
    method: 'tencentIndustryConstituents',
    description: '申万行业成分股排行（点击行业进入的个股列表）',
    sourceUrl: `${PROXY}/cgi/cgi-bin/rank/hs/getBoardRankList?board_code={industryCode}&_appver=11.17.0&...`,
    pageUrl: `${MSTATS}/#mod=list&id=pt01801780&typename=银行&sign=web`,
    params: [
      { name: 'industryCode', type: 'string', description: '行业板块代码，来自 tencentShenwanIndustryList 的 industryCode', required: true },
      { name: 'page', type: 'number', description: '页码', default: 1 },
      { name: 'pageSize', type: 'number', description: '每页条数', default: 20 },
      { name: 'sortType', type: 'string', description: 'sort_type 或列序号，默认 priceRatio（涨跌幅）', default: 'priceRatio' },
      { name: 'order', type: 'string', description: 'desc/down 或 asc/up', default: 'desc' },
    ],
    returns: '[{ industryCode, page, pageSize, total, items: [{ code, name, price, changePct, peTtm, volume, turnover, ... }], source }]',
    usage: INVOKE('tencentIndustryConstituents', '["pt01801780",1,20,"priceRatio","desc"]'),
    notes: 'board_code 为行业 pt 代码，非股票代码。与沪深板块排行共用 getBoardRankList。',
    example: '{"provider":"tencent","method":"tencentIndustryConstituents","args":["pt01801780",1,20,"priceRatio","desc"]}',
  },

  tencentStockPlates: {
    method: 'tencentStockPlates',
    description: '个股行业/概念/地域标签',
    sourceUrl: `${PROXY}/ifzqgtimg/appstock/app/stockinfo/plateNew?code={symbol}&app=wzq&zdf=1`,
    pageUrl: 'https://gu.qq.com/{symbol}/gp',
    params: [{ name: 'code', type: 'string', description: '6 位 A 股代码', required: true }],
    returns: '[{ code, plateType: industry|concept|area, plateName, changePct, tag, source }]',
    usage: INVOKE('tencentStockPlates'),
    notes: 'symbol 自动补 sh/sz 前缀。',
    example: '{"provider":"tencent","method":"tencentStockPlates","args":["300308"]}',
  },

  tencentRelatedPlates: {
    method: 'tencentRelatedPlates',
    description: '个股关联板块列表',
    sourceUrl: `${PROXY}/ifzqgtimg/stock/relate/data/plate?code={symbol}`,
    pageUrl: 'https://gu.qq.com/{symbol}/gp',
    params: [{ name: 'code', type: 'string', description: '6 位 A 股代码', required: true }],
    returns: '[{ code, peerCode, peerName, source }]',
    usage: INVOKE('tencentRelatedPlates'),
    example: '{"provider":"tencent","method":"tencentRelatedPlates","args":["600519"]}',
  },

  tencentIndustryRank: {
    method: 'tencentIndustryRank',
    description: '个股在所属行业内的估值排名（PE/市值/每股收益）',
    sourceUrl: `${PROXY}/ifzqgtimg/appstock/hs/hypm/get?code={symbol}`,
    pageUrl: 'https://gu.qq.com/{symbol}/gp',
    params: [{ name: 'code', type: 'string', description: '6 位 A 股代码', required: true }],
    returns: '[{ code, industryCode, industryName, pe, marketCap, eps, peRank, marketCapRank, epsRank, industryAvgPe, source }]',
    usage: INVOKE('tencentIndustryRank'),
    notes: '与 tencentShenwanIndustryList（全市场行业榜）不同，此为单股行业内排名。',
    example: '{"provider":"tencent","method":"tencentIndustryRank","args":["300308"]}',
  },

  tencentInstitutionRating: {
    method: 'tencentInstitutionRating',
    description: '机构评级汇总、近期研报标题与目标价区间',
    sourceUrl: `${PROXY}/ifzqgtimg/appstock/app/investRate/getInvestRate + /ifzqgtimg/appstock/hs/jggd/get`,
    pageUrl: 'https://gu.qq.com/{symbol}/gp/yjbg',
    params: [{ name: 'code', type: 'string', description: '6 位 A 股代码', required: true }],
    returns: '[{ code, ratings, recentReports, monthly: { m1,m2,m3 }, targetPrice: { avg,high,low }, source }]',
    usage: INVOKE('tencentInstitutionRating'),
    example: '{"provider":"tencent","method":"tencentInstitutionRating","args":["600519"]}',
  },

  tencentStockSearch: {
    method: 'tencentStockSearch',
    description: '股票/基金搜索（smartbox）',
    sourceUrl: `${PROXY}/cgi/cgi-bin/smartbox/search?stockFlag=1&fundFlag=1&query={q}`,
    pageUrl: `${MSTATS}/`,
    params: [{ name: 'query', type: 'string', description: '代码或名称关键词', required: true }],
    returns: 'TencentSmartboxStock[] 原始搜索结果',
    usage: INVOKE('tencentStockSearch', '["茅台"]'),
    example: '{"provider":"tencent","method":"tencentStockSearch","args":["300308"]}',
  },

  tencentTradeDetails: {
    method: 'tencentTradeDetails',
    description: '逐笔成交明细（盘中有效）',
    sourceUrl: `${PROXY}/ifzqgtimg/appstock/app/dealinfo/getMingxiV2?code={symbol}`,
    pageUrl: 'https://gu.qq.com/{symbol}/gp',
    params: [{ name: 'code', type: 'string', description: '6 位 A 股代码', required: true }],
    returns: '[{ code, time, price, volume, side, ... }]',
    usage: INVOKE('tencentTradeDetails'),
    notes: '收盘后常返回空；仅交易时段有逐笔数据。',
    example: '{"provider":"tencent","method":"tencentTradeDetails","args":["300308"]}',
  },
}

export const TENCENT_CUSTOM = Object.values(TENCENT_METHOD_DOCS).map(toCustomMethodDef)
