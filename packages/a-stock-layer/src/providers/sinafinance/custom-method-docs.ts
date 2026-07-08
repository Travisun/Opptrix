import type { CustomMethodApiDoc, CustomMethodParam } from '../common/custom-method-doc-types.js'
import { toCustomMethodDef } from '../common/custom-method-doc-types.js'

const CORP = 'https://vip.stock.finance.sina.com.cn/corp/go.php'
const INVEST = 'https://vip.stock.finance.sina.com.cn/q/go.php/vInvestConsult/kind'
const FUND_API = 'https://stock.finance.sina.com.cn/fundInfo/api/openapi.php'
const MC = 'https://vip.stock.finance.sina.com.cn/quotes_service/api/json_v2.php/Market_Center.getHQNodeData'
const STOCK_PAGE = 'http://finance.sina.com.cn/realstock/company/{symbol}/nc.shtml'
const FUND_PAGE = 'https://finance.sina.com.cn/fund/quotes/{code}/bc.shtml'
const ETF_PAGE = 'https://vip.stock.finance.sina.com.cn/fund_center/index.html#jjhqetf'

const INVOKE = (method: string, args = '["600519"]') =>
  `engine.invokeCustomMethod("sinafinance", "${method}", ${args})`

function sinaDoc(
  method: string,
  description: string,
  sourceUrl: string,
  pageUrl: string,
  params: CustomMethodParam[],
  returns: string,
  extra?: Partial<Pick<CustomMethodApiDoc, 'notes' | 'example' | 'usage'>>,
): CustomMethodApiDoc {
  return {
    method,
    description,
    sourceUrl,
    pageUrl,
    params,
    returns,
    usage: extra?.usage ?? INVOKE(method),
    notes: extra?.notes ?? 'Referer 须为 http://finance.sina.com.cn/（已在 sinafinance HTTP 客户端默认）。无数据时返回 null。',
    example: extra?.example ?? `{"provider":"sinafinance","method":"${method}","args":["600519"]}`,
  }
}

const CODE_PARAM: CustomMethodParam = {
  name: 'code', type: 'string', description: '6 位 A 股/基金代码', required: true,
}

export const SINA_METHOD_DOCS: Record<string, CustomMethodApiDoc> = {
  sinaCorpInfo: sinaDoc(
    'sinaCorpInfo', '公司完整资料（简介、行业、概念等 F10 聚合）',
    `${CORP}/vCI_CorpInfo/stockid/{code}.phtml 等多页 HTML 解析`,
    `${CORP}/vCI_CorpInfo/stockid/{code}.phtml`,
    [CODE_PARAM],
    'Record<string, unknown> 含 orgProfile、industry、concept 等字段',
    { notes: '聚合公司简介、概念、相关证券等 HTML 页。' },
  ),

  sinaExecutives: sinaDoc(
    'sinaExecutives', '公司高管 / 董事会成员',
    `${CORP}/vCI_CorpManager/stockid/{code}.phtml`,
    `${CORP}/vCI_CorpManager/stockid/{code}.phtml`,
    [CODE_PARAM], 'SinaExecutiveRow[]',
  ),

  sinaMajorShareholders: sinaDoc(
    'sinaMajorShareholders', '主要股东持股明细',
    `${CORP}/vCI_StockHolder/stockid/{code}/displaytype/30.phtml`,
    `${CORP}/vCI_StockHolder/stockid/{code}/displaytype/30.phtml`,
    [CODE_PARAM], 'SinaShareholderRow[]',
  ),

  sinaCirculateShareholders: sinaDoc(
    'sinaCirculateShareholders', '流通股东持股明细',
    `${CORP}/vCI_CirculateStockHolder/stockid/{code}/displaytype/30.phtml`,
    `${CORP}/vCI_CirculateStockHolder/stockid/{code}/displaytype/30.phtml`,
    [CODE_PARAM], 'SinaShareholderRow[]',
  ),

  sinaFundHoldings: sinaDoc(
    'sinaFundHoldings', '基金持股明细（含多期截止日）',
    `${CORP}/vCI_FundStockHolder/stockid/{code}/displaytype/30.phtml`,
    `${CORP}/vCI_FundStockHolder/stockid/{code}/displaytype/30.phtml`,
    [CODE_PARAM], 'SinaFundHoldingBlock[]',
  ),

  sinaConceptPlates: sinaDoc(
    'sinaConceptPlates', '所属概念板块（含行情中心 node）',
    `${CORP}/vCI_CorpOtherInfo/stockid/{code}/menu_num/5.phtml`,
    'https://vip.stock.finance.sina.com.cn/mkt/#chgn_{node}',
    [CODE_PARAM], 'SinaConceptPlateRow[]',
  ),

  sinaRelatedSecurities: sinaDoc(
    'sinaRelatedSecurities', '相关证券（AH/B 股等）',
    `${CORP}/vCI_CorpXiangGuan/stockid/{code}.phtml`,
    `${CORP}/vCI_CorpXiangGuan/stockid/{code}.phtml`,
    [CODE_PARAM], 'SinaRelatedSecurityRow[]',
  ),

  sinaIndexMembership: sinaDoc(
    'sinaIndexMembership', '所属指数 / 系别',
    `${CORP}/vCI_CorpXiangGuan/stockid/{code}.phtml`,
    `${CORP}/vCI_CorpXiangGuan/stockid/{code}.phtml`,
    [CODE_PARAM], 'SinaIndexMembershipRow[]',
  ),

  sinaDividends: sinaDoc(
    'sinaDividends', '分红送转历史',
    `${CORP}/vISSUE_ShareBonus/stockid/{code}.phtml`,
    `${CORP}/vISSUE_ShareBonus/stockid/{code}.phtml`,
    [CODE_PARAM], 'Dividend[]',
  ),

  sinaFinancialPivot: sinaDoc(
    'sinaFinancialPivot', '财务透视表（主要指标/利润/资产负债/现金流/杜邦）',
    `${CORP}/vFD_FinanceSummary/stockid/{code}.phtml 等（sheet 切换）`,
    `${CORP}/vFD_FinanceSummary/stockid/{code}.phtml`,
    [
      CODE_PARAM,
      { name: 'sheet', type: 'string', description: 'guide|profit|balance|cashflow|dupont', default: 'guide' },
    ],
    'Record<string, unknown> 原始透视表行列',
  ),

  sinaStockStructure: sinaDoc(
    'sinaStockStructure', '股本结构历史',
    `${CORP}/vCI_StockStructure/stockid/{code}.phtml`,
    `${CORP}/vCI_StockStructure/stockid/{code}.phtml`,
    [CODE_PARAM], '股本变动记录[]',
  ),

  sinaCorpRule: sinaDoc(
    'sinaCorpRule', '公司章程',
    `${CORP}/vCI_CorpRule/stockid/{code}.phtml`,
    `${CORP}/vCI_CorpRule/stockid/{code}.phtml`,
    [CODE_PARAM], '{ title, content }',
  ),

  sinaAnnualBulletins: sinaDoc(
    'sinaAnnualBulletins', '年度报告列表（旧版分类页）',
    `${CORP}/vCB_Bulletin/stockid/{code}/page_type/ndbg.phtml`,
    `${CORP}/vCB_Bulletin/stockid/{code}/page_type/ndbg.phtml`,
    [CODE_PARAM], '公告摘要行[]',
  ),

  sinaBulletins: sinaDoc(
    'sinaBulletins', '分类公告列表（年报/中报/一季报/三季报）',
    `${CORP}/vCB_Bulletin/stockid/{code}/page_type/{pageType}.phtml`,
    `${CORP}/vCB_Bulletin/stockid/{code}/page_type/ndbg.phtml`,
    [
      CODE_PARAM,
      { name: 'pageType', type: 'string', description: 'ndbg|zqbg|yjdbg|sjdbg', default: 'ndbg' },
    ],
    '公告摘要行[]',
  ),

  sinaAllBulletins: sinaDoc(
    'sinaAllBulletins', '全部公告分页（含 total/page）',
    `${CORP}/vCB_AllBulletin/stockid/{code}.phtml?page={page}`,
    `${CORP}/vCB_AllBulletin/stockid/{code}.phtml`,
    [
      CODE_PARAM,
      { name: 'page', type: 'number', description: '页码', default: 1 },
    ],
    '{ page, total, items: 公告行[] }',
  ),

  sinaBulletinDetail: sinaDoc(
    'sinaBulletinDetail', '公告正文详情',
    `${CORP}/vCB_AllBulletinDetail/stockid/{code}/id/{bulletinId}.phtml`,
    `${CORP}/vCB_AllBulletinDetail/stockid/{code}/id/{bulletinId}.phtml`,
    [
      CODE_PARAM,
      { name: 'bulletinId', type: 'string', description: '公告 id', required: true },
    ],
    '{ title, date, content, url }',
    {
      example: '{"provider":"sinafinance","method":"sinaBulletinDetail","args":["600519","1234567"]}',
      usage: INVOKE('sinaBulletinDetail', '["600519","1234567"]'),
    },
  ),

  sinaInsiderTrades: sinaDoc(
    'sinaInsiderTrades', '内部人交易 / 高管持股变动',
    `${INVEST}/nbjy/index.phtml?symbol={symbol}&bdate=&edate=`,
    `${INVEST}/nbjy/index.phtml`,
    [
      CODE_PARAM,
      { name: 'bdate', type: 'string', description: '开始日期 YYYY-MM-DD', default: '' },
      { name: 'edate', type: 'string', description: '结束日期 YYYY-MM-DD', default: '' },
    ],
    '内部人交易记录[]',
  ),

  sinaStockComment: sinaDoc(
    'sinaStockComment', '千股千评 / 个股点评',
    `${INVEST}/stockcomment/index.phtml?symbol={symbol}`,
    `${INVEST}/stockcomment/index.phtml`,
    [CODE_PARAM], '{ score, comment, ... }',
  ),

  sinaPriceHistory: sinaDoc(
    'sinaPriceHistory', '历史价格与成交（分价表）',
    'http://market.finance.sina.com.cn/pricehis.php?symbol={symbol}&startdate=&enddate=',
    STOCK_PAGE.replace('{symbol}', 'sh600519'),
    [
      CODE_PARAM,
      { name: 'startDate', type: 'string', description: 'YYYY-MM-DD', default: '' },
      { name: 'endDate', type: 'string', description: 'YYYY-MM-DD', default: '' },
    ],
    '{ levels: 分价统计行[] }',
  ),

  sinaIpoInfo: sinaDoc(
    'sinaIpoInfo', '新股发行 / 上市信息',
    `${CORP}/vISSUE_NewStock/stockid/{code}.phtml`,
    `${CORP}/vISSUE_NewStock/stockid/{code}.phtml`,
    [CODE_PARAM], 'IPO 信息对象',
  ),

  sinaAddStockHistory: sinaDoc(
    'sinaAddStockHistory', '增发历史',
    `${CORP}/vISSUE_AddStock/stockid/{code}.phtml`,
    `${CORP}/vISSUE_AddStock/stockid/{code}.phtml`,
    [CODE_PARAM], '增发记录[]',
  ),

  sinaShareUnlock: sinaDoc(
    'sinaShareUnlock', '限售解禁计划',
    `${INVEST}/xsjj/index.phtml?symbol={symbol}`,
    `${INVEST}/xsjj/index.phtml`,
    [CODE_PARAM], 'SinaShareUnlockRow[]',
  ),

  sinaMarginTrading: sinaDoc(
    'sinaMarginTrading', '融资融券快照（个股在全市场表中的最近记录）',
    `${INVEST}/rzrq/index.phtml?symbol={symbol}`,
    `${INVEST}/rzrq/index.phtml`,
    [CODE_PARAM], 'SinaMarginTradingRow[]',
    { notes: '全市场 rzrq 页体积大；仅提取目标股最近若干条。' },
  ),

  sinaDragonTigerStock: sinaDoc(
    'sinaDragonTigerStock', '个股龙虎榜（指定交易日）',
    `${INVEST}/lhb/index.phtml?tradedate={date}`,
    `${INVEST}/lhb/index.phtml`,
    [
      CODE_PARAM,
      { name: 'date', type: 'string', description: '交易日 YYYY-MM-DD，默认今日', default: '' },
    ],
    'DragonTiger[]',
    { notes: '若当日未上榜返回空；建议配合 DRAGON_TIGER capability。' },
  ),

  sinaPriceDistribution: sinaDoc(
    'sinaPriceDistribution', '分价统计 / 筹码分布',
    'https://vip.stock.finance.sina.com.cn/quotes_service/view/cn_price_list.php?symbol={symbol}',
    STOCK_PAGE.replace('{symbol}', 'sh600519'),
    [CODE_PARAM], 'SinaPriceLevelRow[]',
  ),

  sinaLargeOrders: sinaDoc(
    'sinaLargeOrders', '大单追踪',
    'https://vip.stock.finance.sina.com.cn/quotes_service/view/CN_TransListV2.php?symbol={symbol}',
    STOCK_PAGE.replace('{symbol}', 'sh600519'),
    [CODE_PARAM], '大单明细行[]',
  ),

  sinaPerfForecast: sinaDoc(
    'sinaPerfForecast', '业绩预告',
    `${CORP}/vFD_AchievementNotice/stockid/{code}.phtml`,
    `${CORP}/vFD_AchievementNotice/stockid/{code}.phtml`,
    [CODE_PARAM], '业绩预告行[]',
  ),

  sinaEtfList: sinaDoc(
    'sinaEtfList', 'ETF 列表（分页）',
    `${MC}?node=etf_hq_fund&page={page}&num={pageSize}`,
    ETF_PAGE,
    [
      { name: 'page', type: 'number', description: '页码', default: 1 },
      { name: 'pageSize', type: 'number', description: '每页条数', default: 40 },
    ],
    '{ page, pageSize, total, items: ETF 行情行[] }',
  ),

  sinaFundQuote: sinaDoc(
    'sinaFundQuote', '基金/ETF 实时行情',
    'https://hq.sinajs.cn/list=of{code}|f_{code}|{market}{code}',
    FUND_PAGE,
    [CODE_PARAM], 'SinaFundQuoteRaw',
  ),

  sinaFundProfile: sinaDoc(
    'sinaFundProfile', '基金基本信息（类型、经理、成立日等）',
    `${FUND_API}/FundPageInfoService.tabjjgk?symbol={code}`,
    FUND_PAGE,
    [CODE_PARAM], 'SinaFundProfileRaw',
  ),

  sinaFundNav: sinaDoc(
    'sinaFundNav', '基金历史净值（分页）',
    `${FUND_API}/CaihuiFundInfoService.getNav?symbol={code}&page={page}&num={n}`,
    FUND_PAGE,
    [
      CODE_PARAM,
      { name: 'page', type: 'number', description: '页码', default: 1 },
      { name: 'pageSize', type: 'number', description: '每页条数', default: 20 },
    ],
    '{ rows: 净值行[], page, total }',
  ),

  sinaFundFees: sinaDoc(
    'sinaFundFees', '基金费率与交易规则',
    `${FUND_API}/FundPageInfoService.tabfl + FdFundService.getDealRule`,
    FUND_PAGE,
    [CODE_PARAM], '费率与规则对象',
  ),

  sinaFundDistributions: sinaDoc(
    'sinaFundDistributions', '基金分红与折算',
    `${FUND_API}/FdFundService.getJJFHAll?symbol={code}`,
    FUND_PAGE,
    [CODE_PARAM], '分红/折算记录',
  ),

  sinaFundAnnouncements: sinaDoc(
    'sinaFundAnnouncements', '基金公告列表',
    `${FUND_API}/CaihuiFundInfoService.getGG?symbol={code}&page={page}`,
    FUND_PAGE,
    [
      CODE_PARAM,
      { name: 'page', type: 'number', description: '页码', default: 1 },
      { name: 'type', type: 'string', description: '公告类型筛选，默认可空', default: '' },
    ],
    '{ items: 公告行[], page }',
  ),

  sinaFundDocuments: sinaDoc(
    'sinaFundDocuments', '基金法律文件（招募说明书等）',
    `${FUND_API}/FundPageInfoService.tabflwj?symbol={code}`,
    FUND_PAGE,
    [CODE_PARAM], 'SinaFundDocumentRow[]',
  ),

  sinaFundShareChange: sinaDoc(
    'sinaFundShareChange', '申购赎回份额变动',
    `${FUND_API}/FundPageInfoService.tabsgsh?symbol={code}`,
    FUND_PAGE,
    [CODE_PARAM], '份额变动行[]',
  ),

  sinaFundAgencies: sinaDoc(
    'sinaFundAgencies', '销售机构',
    `${FUND_API}/FundPageInfoService.tabxsjg?symbol={code}`,
    FUND_PAGE,
    [CODE_PARAM], '销售机构列表',
  ),

  sinaFundDividends: sinaDoc(
    'sinaFundDividends', '基金分红历史（结构化）',
    `${FUND_API}/FdFundService.getJJFHAll?symbol={code}`,
    FUND_PAGE,
    [CODE_PARAM], '分红记录',
  ),

  sinaFundTopHolders: sinaDoc(
    'sinaFundTopHolders', '基金十大持有人',
    `${FUND_API}/FundPageInfoService.tabsdcyr?symbol={code}&date={date}`,
    FUND_PAGE,
    [
      CODE_PARAM,
      { name: 'date', type: 'string', description: '报告期 YYYY-MM-DD，默认可空', default: '' },
    ],
    '十大持有人列表',
  ),

  sinaFundHolderStructure: sinaDoc(
    'sinaFundHolderStructure', '持有人结构（机构/个人占比）',
    `${FUND_API}/FundPageInfoService.tabcyrjg?symbol={code}&date={date}`,
    FUND_PAGE,
    [
      CODE_PARAM,
      { name: 'date', type: 'string', description: '报告期', default: '' },
    ],
    '持有人结构对象',
  ),

  sinaFundHolderStructureHistory: sinaDoc(
    'sinaFundHolderStructureHistory', '持有人结构历史变动',
    `${FUND_API}/FundPageInfoService.tabsdcyrbd?symbol={code}`,
    FUND_PAGE,
    [CODE_PARAM], '历史结构行[]',
  ),

  sinaFundFinancialIndicators: sinaDoc(
    'sinaFundFinancialIndicators', '基金主要财务指标',
    `${FUND_API}/FundPageInfoService.tabcwzb?symbol={code}`,
    FUND_PAGE,
    [CODE_PARAM], '财务指标表',
  ),

  sinaFundIncomeStatement: sinaDoc(
    'sinaFundIncomeStatement', '基金利润表',
    `${FUND_API}/FundPageInfoService.tablrb?symbol={code}`,
    FUND_PAGE,
    [CODE_PARAM], '利润表行列',
  ),

  sinaFundBalanceSheet: sinaDoc(
    'sinaFundBalanceSheet', '基金资产负债表',
    `${FUND_API}/FundPageInfoService.tabfzb?symbol={code}`,
    FUND_PAGE,
    [CODE_PARAM], '资产负债表行列',
  ),
}

export const SINA_CUSTOM = Object.values(SINA_METHOD_DOCS).map(toCustomMethodDef)
