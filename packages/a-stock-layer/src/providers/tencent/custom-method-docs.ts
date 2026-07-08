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

  tencentCnIndexSnapshot: {
    method: 'tencentCnIndexSnapshot',
    description: 'A 股主要指数 / mstats 首页滚动指数快照（qt.gtimg.cn 批量行情）',
    sourceUrl: 'https://qt.gtimg.cn/q=sh000001,sz399001,sz399006,...',
    pageUrl: `${MSTATS}/#`,
    params: [
      { name: 'preset', type: 'string', description: 'major（默认 7 只 A 股主要指数）/ mstats_home（首页滚动条 12 只）/ custom（配合 codes）', default: 'major' },
      { name: 'includeBoardRanks', type: 'boolean', description: '是否附带上证/深证指数成分涨跌榜（bkqtRank_A_sh/sz）', default: false },
      { name: 'codes', type: 'string', description: '可选，逗号分隔 qt 代码覆盖 preset，如 sh000001,sz399300', default: '' },
      { name: 'boardRankPageSize', type: 'number', description: '指数成分榜条数，最大 50', default: 10 },
    ],
    returns: '[{ preset, symbols, items: [{ code, qtCode, name, price, changePct, changeAmt, open, high, low, volume, amount, quoteTime, market }], boardRanks?: { shanghai, shenzhen }, source }]',
    usage: INVOKE('tencentCnIndexSnapshot', '["major",false]'),
    notes: '与 tencentGlobalIndexList（indexRankDetail2 全球股指）不同；本接口为实时 qt 文本行情，含 A 股/港股/美股/期货首页条。成分榜仅交易时段有数据。',
    example: '{"provider":"tencent","method":"tencentCnIndexSnapshot","args":["mstats_home",false]}',
  },

  tencentHkStockList: {
    method: 'tencentHkStockList',
    description: '港股排行列表（mstats HK：主板/创业板/恒指成分等）',
    sourceUrl: 'https://stock.gtimg.cn/data/hk_rank.php?board=main_all&metric=change_rate&pageSize=20&reqPage=1&order=0&var_name=list_data',
    pageUrl: `${MSTATS}/#mod=list&id=hk_mb&module=hk&type=MB`,
    params: [
      { name: 'board', type: 'string', description: 'mstats type：MB（主板）、GEM（创业板）、HSI、HSCEI、AH 等；或直接传 main_all/gem_all', default: 'MB' },
      { name: 'page', type: 'number', description: '页码，从 1 开始', default: 1 },
      { name: 'pageSize', type: 'number', description: '每页条数，最大 100', default: 20 },
      { name: 'sortType', type: 'string', description: '列序号 3 最新价 / 32 涨跌幅，或 price/change_rate/volume 等', default: 32 },
      { name: 'order', type: 'string', description: 'desc|down 降序，asc|up 升序', default: 'desc' },
    ],
    returns: '[{ board, boardKey, boardLabel, page, pageSize, total, items: [{ code, name, price, changePct, changeAmt, buy, sell, volume, amount, market }], source }]',
    usage: INVOKE('tencentHkStockList', '["MB",1,20,32,"desc"]'),
    notes: '优先 hk_rank.php JSONP；盘前或非交易时段可能返回空，自动回退 proxy rank/hk/getList（board_type）。港股代码 5 位如 00700。',
    example: '{"provider":"tencent","method":"tencentHkStockList","args":["GEM",1,20,32,"desc"]}',
  },

  tencentHkMainBoardStockList: {
    method: 'tencentHkMainBoardStockList',
    description: '港股主板股票列表（mstats hk_mb，含行情摘要，服务端分页）',
    sourceUrl: 'https://stock.gtimg.cn/data/hk_rank.php?board=main_all&metric=price&pageSize=20&reqPage=1&order=0&var_name=list_data',
    pageUrl: `${MSTATS}/#mod=list&id=hk_mb&module=HK&type=MB&sort=3&page=1&max=20`,
    params: [
      { name: 'page', type: 'number', description: '页码，从 1 开始（对应 mstats page）', default: 1 },
      { name: 'pageSize', type: 'number', description: '每页条数，最大 100（对应 mstats max）', default: 20 },
      { name: 'sortType', type: 'string', description: '列序号 3 最新价（mstats 默认）/ 32 涨跌幅，或 price/change_rate', default: 3 },
      { name: 'order', type: 'string', description: 'desc|down 降序，asc|up 升序', default: 'desc' },
    ],
    returns: '[{ board: "main_all", boardKey: "MB", boardLabel: "港股主板", page, pageSize, total, items: [{ code, name, price, changePct, changeAmt, preClose, open, high, low, buy, sell, volume, amount, market }], source }]',
    usage: INVOKE('tencentHkMainBoardStockList', '[1,20,3,"desc"]'),
    notes: '等价于 tencentHkStockList("MB", ...)；默认 sort=3 与 mstats 主板页一致。共约 1000+ 只，按 stock_count 分页。',
    example: '{"provider":"tencent","method":"tencentHkMainBoardStockList","args":[1,20,3,"desc"]}',
  },

  tencentHkAhStockList: {
    method: 'tencentHkAhStockList',
    description: 'A+H 股列表（港股侧 AH 溢价排行，含行情摘要，服务端分页）',
    sourceUrl: 'https://stock.gtimg.cn/data/hk_rank.php?board=A_H&metric=change_rate&pageSize=20&reqPage=1&order=0&var_name=list_data',
    pageUrl: `${MSTATS}/#mod=list&id=hk_ah&module=HK&type=AH`,
    params: [
      { name: 'page', type: 'number', description: '页码，从 1 开始', default: 1 },
      { name: 'pageSize', type: 'number', description: '每页条数，最大 100', default: 20 },
      { name: 'sortType', type: 'string', description: '列序号 3 最新价 / 32 涨跌幅（默认）/ 36 成交量，或 price/change_rate', default: 32 },
      { name: 'order', type: 'string', description: 'desc|down 降序，asc|up 升序', default: 'desc' },
    ],
    returns: '[{ board: "A_H", boardKey: "AH", boardLabel: "AH股", page, pageSize, total, items: [{ code, name, price, changePct, changeAmt, preClose, open, high, low, buy, sell, volume, amount, market }], source }]',
    usage: INVOKE('tencentHkAhStockList', '[1,20,32,"desc"]'),
    notes: '等价于 tencentHkStockList("AH", ...)；上游 board=A_H。列表含 AH 溢价率等字段（page_data 末位）。',
    example: '{"provider":"tencent","method":"tencentHkAhStockList","args":[1,20,32,"desc"]}',
  },

  tencentHkMbHsceiStockList: {
    method: 'tencentHkMbHsceiStockList',
    description: '港股主板国企股列表（含行情摘要，服务端分页）',
    sourceUrl: 'https://stock.gtimg.cn/data/hk_rank.php?board=main_China&metric=change_rate&pageSize=20&reqPage=1&order=0&var_name=list_data',
    pageUrl: `${MSTATS}/#mod=list&id=hk_mb_hscei&module=HK&type=MBHSCEI`,
    params: [
      { name: 'page', type: 'number', description: '页码，从 1 开始', default: 1 },
      { name: 'pageSize', type: 'number', description: '每页条数，最大 100', default: 20 },
      { name: 'sortType', type: 'string', description: '列序号 3 最新价 / 32 涨跌幅（默认），或 price/change_rate', default: 32 },
      { name: 'order', type: 'string', description: 'desc|down 降序，asc|up 升序', default: 'desc' },
    ],
    returns: '[{ board: "main_China", boardKey: "MBHSCEI", boardLabel: "主板国企股", page, pageSize, total, items, source }]',
    usage: INVOKE('tencentHkMbHsceiStockList', '[1,20,32,"desc"]'),
    notes: '等价于 tencentHkStockList("MBHSCEI", ...)；上游 board=main_China。',
    example: '{"provider":"tencent","method":"tencentHkMbHsceiStockList","args":[1,20,32,"desc"]}',
  },

  tencentHkMbHscciStockList: {
    method: 'tencentHkMbHscciStockList',
    description: '港股主板红筹股列表（含行情摘要，服务端分页）',
    sourceUrl: 'https://stock.gtimg.cn/data/hk_rank.php?board=main_red&metric=change_rate&pageSize=20&reqPage=1&order=0&var_name=list_data',
    pageUrl: `${MSTATS}/#mod=list&id=hk_mb_hscci&module=HK&type=MBHSCCI`,
    params: [
      { name: 'page', type: 'number', description: '页码，从 1 开始', default: 1 },
      { name: 'pageSize', type: 'number', description: '每页条数，最大 100', default: 20 },
      { name: 'sortType', type: 'string', description: '列序号 3 最新价 / 32 涨跌幅（默认），或 price/change_rate', default: 32 },
      { name: 'order', type: 'string', description: 'desc|down 降序，asc|up 升序', default: 'desc' },
    ],
    returns: '[{ board: "main_red", boardKey: "MBHSCCI", boardLabel: "主板红筹", page, pageSize, total, items, source }]',
    usage: INVOKE('tencentHkMbHscciStockList', '[1,20,32,"desc"]'),
    notes: '等价于 tencentHkStockList("MBHSCCI", ...)；上游 board=main_red。',
    example: '{"provider":"tencent","method":"tencentHkMbHscciStockList","args":[1,20,32,"desc"]}',
  },

  tencentHkBullWarrantList: {
    method: 'tencentHkBullWarrantList',
    description: '港股牛证列表（含行情摘要，服务端分页）',
    sourceUrl: 'https://stock.gtimg.cn/data/hk_rank.php?board=niuxiong_niu&metric=change_rate&pageSize=20&reqPage=1&order=0&var_name=list_data',
    pageUrl: `${MSTATS}/#mod=list&id=hk_cbbc_pull&module=HK&type=BULL`,
    params: [
      { name: 'page', type: 'number', description: '页码，从 1 开始', default: 1 },
      { name: 'pageSize', type: 'number', description: '每页条数，最大 100', default: 20 },
      { name: 'sortType', type: 'string', description: '列序号 3 最新价 / 32 涨跌幅（默认），或 price/change_rate', default: 32 },
      { name: 'order', type: 'string', description: 'desc|down 降序，asc|up 升序', default: 'desc' },
    ],
    returns: '[{ board: "niuxiong_niu", boardKey: "BULL", boardLabel: "牛证", page, pageSize, total, items, source }]',
    usage: INVOKE('tencentHkBullWarrantList', '[1,20,32,"desc"]'),
    notes: '等价于 tencentHkStockList("BULL", ...)；上游 board=niuxiong_niu。牛熊证代码常为 5 位数字。',
    example: '{"provider":"tencent","method":"tencentHkBullWarrantList","args":[1,20,32,"desc"]}',
  },

  tencentHkBearWarrantList: {
    method: 'tencentHkBearWarrantList',
    description: '港股熊证列表（含行情摘要，服务端分页）',
    sourceUrl: 'https://stock.gtimg.cn/data/hk_rank.php?board=niuxiong_xiong&metric=change_rate&pageSize=20&reqPage=1&order=0&var_name=list_data',
    pageUrl: `${MSTATS}/#mod=list&id=hk_cbbc_bear&module=HK&type=BEAR`,
    params: [
      { name: 'page', type: 'number', description: '页码，从 1 开始', default: 1 },
      { name: 'pageSize', type: 'number', description: '每页条数，最大 100', default: 20 },
      { name: 'sortType', type: 'string', description: '列序号 3 最新价 / 32 涨跌幅（默认），或 price/change_rate', default: 32 },
      { name: 'order', type: 'string', description: 'desc|down 降序，asc|up 升序', default: 'desc' },
    ],
    returns: '[{ board: "niuxiong_xiong", boardKey: "BEAR", boardLabel: "熊证", page, pageSize, total, items, source }]',
    usage: INVOKE('tencentHkBearWarrantList', '[1,20,32,"desc"]'),
    notes: '等价于 tencentHkStockList("BEAR", ...)；上游 board=niuxiong_xiong。',
    example: '{"provider":"tencent","method":"tencentHkBearWarrantList","args":[1,20,32,"desc"]}',
  },

  tencentUsTechStockList: {
    method: 'tencentUsTechStockList',
    description: '美股科技股排行列表（含最新价、涨跌幅、市值、市盈率等行情摘要）',
    sourceUrl: `${PROXY}/cgi/cgi-bin/rank/us/getList?board_type=tec&sort_type=priceRatio&direct=down&offset=0&count=20`,
    pageUrl: `${MSTATS}/#mod=list&id=us_kjg&module=US&type=tec`,
    params: [
      { name: 'page', type: 'number', description: '页码，从 1 开始（服务端分页）', default: 1 },
      { name: 'pageSize', type: 'number', description: '每页条数，最大 100', default: 20 },
      { name: 'sortType', type: 'string', description: '列序号 3 最新价 / 32 涨跌幅 / 36 成交量 / 4 总市值，或 price/priceRatio/volume/marketValue', default: 32 },
      { name: 'order', type: 'string', description: 'desc|down 降序，asc|up 升序', default: 'desc' },
    ],
    returns: '[{ board: "tec", boardLabel, page, pageSize, total, items: [{ code, symbol, name, price, changePct, changeAmt, turnoverRate, amplitude, volume, turnover, peTtm, pb, marketCap, floatMarketCap, market }], source }]',
    usage: INVOKE('tencentUsTechStockList', '[1,20,32,"desc"]'),
    notes: '上游 board_type=tec；symbol 为 usTICKER.EX 格式，code 为纯 ticker。延迟约 15 分钟。',
    example: '{"provider":"tencent","method":"tencentUsTechStockList","args":[1,20,32,"desc"]}',
  },

  tencentUsChinaAdrList: {
    method: 'tencentUsChinaAdrList',
    description: '中概股排行列表（含最新价、涨跌幅、市值、市盈率等行情摘要）',
    sourceUrl: `${PROXY}/cgi/cgi-bin/rank/us/getList?board_type=cdr&sort_type=priceRatio&direct=down&offset=0&count=20`,
    pageUrl: `${MSTATS}/#mod=list&id=us_zgg&module=US&type=cdr`,
    params: [
      { name: 'page', type: 'number', description: '页码，从 1 开始（服务端分页）', default: 1 },
      { name: 'pageSize', type: 'number', description: '每页条数，最大 100', default: 20 },
      { name: 'sortType', type: 'string', description: '列序号 3 最新价 / 32 涨跌幅 / 36 成交量 / 4 总市值，或 price/priceRatio/volume/marketValue', default: 32 },
      { name: 'order', type: 'string', description: 'desc|down 降序，asc|up 升序', default: 'desc' },
    ],
    returns: '[{ board: "cdr", boardLabel: "中概股", page, pageSize, total, items: [{ code, symbol, name, price, changePct, changeAmt, turnoverRate, amplitude, volume, turnover, peTtm, pb, marketCap, floatMarketCap, market }], source }]',
    usage: INVOKE('tencentUsChinaAdrList', '[1,20,32,"desc"]'),
    notes: '上游 board_type=cdr（mstats type=cdr / id=us_zgg）。与科技股共用 rank/us/getList。',
    example: '{"provider":"tencent","method":"tencentUsChinaAdrList","args":[2,20,32,"desc"]}',
  },

  tencentIndustryHeatRank: {
    method: 'tencentIndustryHeatRank',
    description: 'mstats 首页行业热度排行（板块平均涨跌幅 + 领涨股）',
    sourceUrl: `${PROXY}/ifzqgtimg/appstock/app/mktHs/rank?l=10&p=1&t=averatio&o=0`,
    pageUrl: `${MSTATS}/#`,
    params: [
      { name: 'type', type: 'string', description: 'averatio（行业平均涨跌幅）或 01/averatio（沪深 A 股行业平均，首页市场一览）', default: 'averatio' },
      { name: 'page', type: 'number', description: '页码，从 1 开始', default: 1 },
      { name: 'pageSize', type: 'number', description: '每页条数，最大 50', default: 10 },
      { name: 'order', type: 'string', description: 'desc/down → 涨幅榜（o=0）；asc/up → 跌幅榜（o=1）', default: 'desc' },
    ],
    returns: '[{ type, page, pageSize, order, total, items: [{ industryCode, industryName, changePct, changePct5d, changePct20d, leadingStock: { code, name, changePct }, ... }], source }]',
    usage: INVOKE('tencentIndustryHeatRank', '["averatio",1,10,"desc"]'),
    notes: 't=01 单独使用会 TYPE_ERROR；请用 averatio 或 01/averatio。',
    example: '{"provider":"tencent","method":"tencentIndustryHeatRank","args":["01/averatio",1,10,"desc"]}',
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
