"""
统一数据 Schema 定义
所有 driver 的输出都会被转换成这里的模型。
"""

from __future__ import annotations

import sys
from dataclasses import dataclass, field, asdict
from datetime import datetime
from enum import Enum
from typing import Optional


# ── 能力枚举 ──────────────────────────────────────────────────────────

class Capability(str, Enum):
    STOCK_REALTIME  = "stock_realtime"   # 个股实时行情
    STOCK_KLINE     = "stock_kline"      # 个股K线
    STOCK_MONEY_FLOW= "stock_money_flow" # 个股资金流
    INDEX_REALTIME  = "index_realtime"   # 大盘指数实时
    INDEX_KLINE     = "index_kline"      # 大盘指数K线
    MARKET_MONEY_FLOW="market_money_flow"# 北向/南向资金流
    SECTOR_MONEY_FLOW="sector_money_flow"# 行业/板块资金流
    SECTOR_LIST     = "sector_list"      # 板块列表
    STOCK_BASIC     = "stock_basic"      # 股票基本信息
    STOCK_PROFILE   = "stock_profile"    # 个股背景/公司概况
    SHAREHOLDER     = "shareholder"      # 股东数据
    FINANCIAL_SUMMARY = "financial_summary" # 财报摘要
    NEWS            = "news"             # 新闻公告
    SENTIMENT       = "sentiment"        # 舆情动态
    DRAGON_TIGER    = "dragon_tiger"     # 龙虎榜
    MARGIN_TRADE    = "margin_trade"     # 融资融券
    DIVIDEND        = "dividend"         # 分红送配
    BALANCE_SHEET   = "balance_sheet"    # 资产负债表
    INCOME_STMT     = "income_statement" # 利润表(详细)
    CASH_FLOW       = "cash_flow"        # 现金流量表
    INST_HOLDING    = "inst_holding"     # 机构持仓
    BLOCK_TRADE     = "block_trade"      # 大宗交易
    LOCKUP_EXPIRY   = "lockup_expiry"    # 限售解禁
    SHARE_PLEDGE    = "share_pledge"     # 股权质押
    INTRADAY_TICK   = "intraday_tick"    # 日内分时
    STOCK_LIST      = "stock_list"       # 全市场股票列表
    INDEX_CONST     = "index_constituent"# 指数成分股
    INSIDER_TRADE   = "insider_trade"    # 高管持股变动
    PERF_FORECAST   = "performance_forecast" # 业绩预告
    TRADE_CALENDAR  = "trade_calendar"   # 交易日历
    LIMIT_UPDOWN    = "limit_updown"    # 涨停跌停
    MARKET_BREADTH  = "market_breadth"  # 市场情绪/涨跌家数
    IPO_DATA        = "ipo_data"        # 新股IPO
    CONVERTIBLE_BOND= "convertible_bond"# 可转债
    ETF_DATA        = "etf_data"        # ETF数据
    MANAGER_INFO    = "manager_info"    # 管理层信息
    SHAREHOLDER_PLAN= "shareholder_plan"# 股东增减持计划
    BUYBACK         = "buyback"         # 股票回购
    GLOBAL_INDEX    = "global_index"    # 全球指数
    EXCHANGE_RATE   = "exchange_rate"   # 汇率
    MACRO_INDICATOR = "macro_indicator" # 宏观经济指标
    TECH_INDICATOR  = "tech_indicator"  # 技术指标(计算)
    MAIN_BUSINESS       = "main_business"        # 主营构成(分产品/分地区)
    TOP_CUSTOMER        = "top_customer"         # 前五大客户
    TOP_SUPPLIER        = "top_supplier"         # 前五大供应商
    ACTUAL_CONTROLLER   = "actual_controller"    # 实际控制人
    SUBSIDIARY          = "subsidiary"           # 子公司信息
    RELATED_PARTY       = "related_party"        # 关联交易
    RD_INVESTMENT       = "rd_investment"        # 研发投入
    MERGER_ACQUISITION  = "merger_acquisition"   # 并购事件
    EMPLOYEE_COMP       = "employee_composition" # 员工构成
    INSTITUTIONAL_VISIT = "institutional_visit"  # 机构调研
    PEER_COMPANY        = "peer_company"         # 可比公司


# ── 辅助 ──────────────────────────────────────────────────────────────

def _to_dict(obj):
    """将 dataclass 转为 dict，过滤 None 值。"""
    return {k: v for k, v in asdict(obj).items() if v is not None}

def _dt_fmt(dt=None) -> str:
    """返回 ISO 格式时间戳字符串。"""
    return (dt or datetime.now()).strftime("%Y-%m-%d %H:%M:%S")


# ── 个股实时行情 ──────────────────────────────────────────────────────

@dataclass
class StockRealtime:
    """统一个股实时行情"""
    code: str                  # 股票代码，如 "600519"
    name: str = ""             # 股票名称
    price: Optional[float] = None       # 当前价
    open: Optional[float] = None        # 今开
    high: Optional[float] = None        # 最高
    low: Optional[float] = None         # 最低
    pre_close: Optional[float] = None   # 昨收
    volume: Optional[float] = None      # 成交量(手)
    amount: Optional[float] = None      # 成交额(元)
    change: Optional[float] = None      # 涨跌额
    change_pct: Optional[float] = None  # 涨跌幅(%)
    turnover_rate: Optional[float] = None # 换手率(%)
    pe: Optional[float] = None          # 市盈率
    pb: Optional[float] = None          # 市净率
    market_cap: Optional[float] = None  # 总市值(元)
    amplitude: Optional[float] = None   # 振幅(%)
    volume_ratio: Optional[float] = None# 量比
    timestamp: str = ""                 # 数据时间

    def to_dict(self):
        return _to_dict(self)


# ── 个股K线 ───────────────────────────────────────────────────────────

@dataclass
class StockKline:
    """统一个股K线数据"""
    code: str                  # 股票代码
    date: str                  # 日期 "2024-01-15"
    open: float                # 开盘价
    close: float               # 收盘价
    high: float                # 最高价
    low: float                 # 最低价
    volume: float = 0.0        # 成交量(手)
    amount: float = 0.0        # 成交额(元)
    change_pct: Optional[float] = None # 涨跌幅(%)
    turnover_rate: Optional[float] = None # 换手率(%)

    def to_dict(self):
        return _to_dict(self)


# ── 个股资金流 ────────────────────────────────────────────────────────

@dataclass
class MoneyFlow:
    """统一个股资金流"""
    code: str                  # 股票代码
    date: str                  # 日期
    main_net: Optional[float] = None     # 主力净流入(元)
    super_large_net: Optional[float] = None # 超大单净流入
    large_net: Optional[float] = None    # 大单净流入
    medium_net: Optional[float] = None   # 中单净流入
    small_net: Optional[float] = None    # 小单净流入
    main_net_pct: Optional[float] = None # 主力净流入占比(%)
    close: Optional[float] = None        # 收盘价
    change_pct: Optional[float] = None   # 涨跌幅(%)

    def to_dict(self):
        return _to_dict(self)


# ── 大盘指数实时 ──────────────────────────────────────────────────────

@dataclass
class IndexRealtime:
    """统一大盘指数实时行情"""
    code: str                  # 指数代码，如 "000001"
    name: str = ""             # 指数名称
    price: Optional[float] = None
    open: Optional[float] = None
    high: Optional[float] = None
    low: Optional[float] = None
    pre_close: Optional[float] = None
    change: Optional[float] = None
    change_pct: Optional[float] = None
    volume: Optional[float] = None
    amount: Optional[float] = None
    timestamp: str = ""

    def to_dict(self):
        return _to_dict(self)


# ── 大盘指数K线 ──────────────────────────────────────────────────────

@dataclass
class IndexKline:
    """统一大盘指数K线"""
    code: str
    date: str
    open: float
    close: float
    high: float
    low: float
    volume: float = 0.0
    amount: float = 0.0
    change_pct: Optional[float] = None

    def to_dict(self):
        return _to_dict(self)


# ── 市场资金流（北向/南向） ──────────────────────────────────────────

@dataclass
class MarketMoneyFlow:
    """北向/南向资金流"""
    direction: str             # "north" 北向 / "south" 南向
    date: str
    net_amount: float          # 净流入(元)
    sh_net: Optional[float] = None  # 沪股通净流入
    sz_net: Optional[float] = None  # 深股通净流入
    cumulative: Optional[float] = None # 累计净流入

    def to_dict(self):
        return _to_dict(self)


# ── 行业/板块资金流 ──────────────────────────────────────────────────

@dataclass
class SectorMoneyFlow:
    """行业板块资金流"""
    sector_name: str           # 板块名称
    date: str
    main_net: Optional[float] = None     # 主力净流入(元)
    main_net_pct: Optional[float] = None # 主力净流入占比(%)
    top_stocks: list = field(default_factory=list)  # 领涨股列表[(code, name, change_pct)]

    def to_dict(self):
        return _to_dict(self)


# ── 查询结果包装 ─────────────────────────────────────────────────────

@dataclass
class QueryResult:
    """统一查询结果"""
    success: bool
    data: list = field(default_factory=list)
    source: str = ""            # 数据来源 driver 名称
    error: Optional[str] = None
    cached: bool = False
    timestamp: str = ""

    def __post_init__(self):
        if not self.timestamp:
            self.timestamp = _dt_fmt()


# ══════════════════════════════════════════════════════════════════════
# 新数据维度 — 投资研究
# ══════════════════════════════════════════════════════════════════════


# ── 个股背景/公司概况 ────────────────────────────────────────────────

@dataclass
class StockProfile:
    """个股背景/公司概况"""
    code: str                          # 股票代码
    name: str = ""                     # 公司名称
    industry: str = ""                 # 所属行业
    concepts: list = field(default_factory=list)  # 概念板块列表
    listing_date: str = ""             # 上市日期 "2001-08-27"
    main_business: str = ""            # 主营业务
    registered_capital: Optional[float] = None  # 注册资本
    total_shares: Optional[float] = None       # 总股本
    circulating_shares: Optional[float] = None # 流通股本
    total_market_cap: Optional[float] = None   # 总市值
    circulating_market_cap: Optional[float] = None # 流通市值
    employees: Optional[int] = None            # 员工数
    province: str = ""                 # 省份
    city: str = ""                     # 城市
    website: str = ""                  # 公司网址
    business_scope: str = ""           # 经营范围
    timestamp: str = ""

    def to_dict(self):
        return _to_dict(self)


# ── 股东数据 ──────────────────────────────────────────────────────────

@dataclass
class ShareholderItem:
    """单个股东信息"""
    rank: int = 0                     # 排名
    name: str = ""                    # 股东名称
    shares_held: Optional[float] = None   # 持股数
    share_pct: Optional[float] = None     # 持股比例
    change: Optional[float] = None        # 变动数量


@dataclass
class ShareholderData:
    """历史股东数据"""
    code: str                          # 股票代码
    report_date: str = ""              # 报告期 "2024-06-30"
    shareholder_count: Optional[int] = None     # 股东总人数
    shareholder_count_change: Optional[float] = None  # 股东数变动(%)
    avg_holding_value: Optional[float] = None   # 户均持股市值
    top_10_shareholders: list = field(default_factory=list)  # list[ShareholderItem]
    institutional_holding_pct: Optional[float] = None  # 机构持股比例
    timestamp: str = ""

    def to_dict(self):
        return _to_dict(self)


# ── 财报摘要 ──────────────────────────────────────────────────────────

@dataclass
class FinancialSummary:
    """财报摘要 — 利润表核心指标"""
    code: str                          # 股票代码
    report_date: str = ""              # 报告期 "2024-12-31"
    report_type: str = ""              # 年报/中报/一季报/三季报
    revenue: Optional[float] = None             # 营业收入
    revenue_yoy: Optional[float] = None         # 营收同比(%)
    net_profit: Optional[float] = None          # 净利润
    net_profit_yoy: Optional[float] = None      # 净利润同比(%)
    eps: Optional[float] = None                 # 每股收益
    roe: Optional[float] = None                 # 净资产收益率(%)
    gross_margin: Optional[float] = None        # 销售毛利率(%)
    debt_ratio: Optional[float] = None          # 资产负债率(%)
    operating_cash_flow: Optional[float] = None # 经营活动现金流
    total_assets: Optional[float] = None        # 总资产
    total_liabilities: Optional[float] = None   # 总负债
    timestamp: str = ""

    def to_dict(self):
        return _to_dict(self)


# ── 新闻公告 ──────────────────────────────────────────────────────────

@dataclass
class NewsItem:
    """新闻公告"""
    code: str                          # 股票代码
    date: str = ""                     # 日期 "2024-12-20"
    title: str = ""                    # 标题
    summary: str = ""                  # 摘要
    url: str = ""                      # 原文链接
    source: str = ""                   # 来源 (东方财富/证券时报/上证报等)
    content_type: str = ""             # "news" 新闻 / "announcement" 公告
    is_important: bool = False         # 是否重要公告
    timestamp: str = ""

    def to_dict(self):
        return _to_dict(self)


# ── 舆情动态 ──────────────────────────────────────────────────────────

@dataclass
class SentimentData:
    """舆情动态数据"""
    code: str                          # 股票代码
    date: str = ""                     # 日期
    sentiment_score: Optional[float] = None   # 舆情评分 -1~1 (负->正)
    hot_score: Optional[float] = None        # 热度评分 0~100
    mention_count: Optional[int] = None      # 提及次数
    avg_sentiment: Optional[float] = None    # 平均情感值
    related_news_count: Optional[int] = None # 相关新闻数
    bull_ratio: Optional[float] = None       # 看涨比例(%)
    bear_ratio: Optional[float] = None       # 看跌比例(%)
    timestamp: str = ""

    def to_dict(self):
        return _to_dict(self)


# ══════════════════════════════════════════════════════════════════════
# 第三批 — 交易衍生/持股/参考/宏观
# ══════════════════════════════════════════════════════════════════════


# ── 龙虎榜 ────────────────────────────────────────────────────────────

@dataclass
class DragonTiger:
    """龙虎榜数据"""
    code: str
    date: str = ""
    name: str = ""
    reason: str = ""                     # 上榜原因（日涨幅偏离值7%等）
    rank: int = 0                        # 排名
    total_buy: Optional[float] = None    # 总买入额
    total_sell: Optional[float] = None   # 总卖出额
    net_amount: Optional[float] = None   # 净买入额
    buy_count: Optional[int] = None      # 买入席位数量
    sell_count: Optional[int] = None     # 卖出席位数量
    buy_detail: list = field(default_factory=list)  # 买入席位详情
    sell_detail: list = field(default_factory=list) # 卖出席位详情

    def to_dict(self):
        return _to_dict(self)


@dataclass
class DragonTigerSeat:
    """龙虎榜席位"""
    name: str = ""                       # 营业部名称
    buy: Optional[float] = None          # 买入额
    sell: Optional[float] = None         # 卖出额
    net: Optional[float] = None          # 净额


# ── 融资融券 ──────────────────────────────────────────────────────────

@dataclass
class MarginTrade:
    """融资融券数据"""
    code: str
    date: str = ""
    margin_balance: Optional[float] = None    # 融资余额
    margin_buy: Optional[float] = None        # 融资买入额
    margin_refund: Optional[float] = None     # 融资偿还额
    margin_net: Optional[float] = None        # 融资净买入
    short_balance: Optional[float] = None     # 融券余额
    short_sell: Optional[float] = None        # 融券卖出量
    short_refund: Optional[float] = None      # 融券偿还量
    short_net: Optional[float] = None         # 融券净卖出

    def to_dict(self):
        return _to_dict(self)


# ── 分红送配 ──────────────────────────────────────────────────────────

@dataclass
class Dividend:
    """分红送配历史"""
    code: str
    announcement_date: str = ""          # 公告日
    ex_date: str = ""                    # 除权除息日
    record_date: str = ""                # 股权登记日
    cash_bonus: Optional[float] = None   # 每股现金红利(元)
    share_transfer: Optional[float] = None  # 每股送转股数
    rights_issue: Optional[float] = None    # 每股配股数
    rights_price: Optional[float] = None    # 配股价
    bonus_total: Optional[float] = None     # 分红总额
    year: str = ""                       # 分红年度

    def to_dict(self):
        return _to_dict(self)


# ── 详细三张表 ────────────────────────────────────────────────────────

@dataclass
class BalanceSheet:
    """资产负债表"""
    code: str
    report_date: str = ""
    report_type: str = ""                # 年报/中报/一季报/三季报
    total_assets: Optional[float] = None
    total_liabilities: Optional[float] = None
    equity: Optional[float] = None
    current_assets: Optional[float] = None
    non_current_assets: Optional[float] = None
    current_liabilities: Optional[float] = None
    non_current_liabilities: Optional[float] = None
    cash: Optional[float] = None
    accounts_receivable: Optional[float] = None
    inventory: Optional[float] = None
    fixed_assets: Optional[float] = None
    intangible_assets: Optional[float] = None
    short_term_borrowing: Optional[float] = None
    long_term_borrowing: Optional[float] = None

    def to_dict(self):
        return _to_dict(self)


@dataclass
class IncomeStatement:
    """利润表（详细）"""
    code: str
    report_date: str = ""
    report_type: str = ""
    revenue: Optional[float] = None
    cost: Optional[float] = None         # 营业成本
    gross_profit: Optional[float] = None
    selling_expense: Optional[float] = None
    admin_expense: Optional[float] = None
    rnd_expense: Optional[float] = None
    finance_expense: Optional[float] = None
    operating_profit: Optional[float] = None
    total_profit: Optional[float] = None
    net_profit: Optional[float] = None
    net_profit_parent: Optional[float] = None
    eps_basic: Optional[float] = None
    eps_diluted: Optional[float] = None

    def to_dict(self):
        return _to_dict(self)


@dataclass
class CashFlow:
    """现金流量表"""
    code: str
    report_date: str = ""
    report_type: str = ""
    operating_cash_inflow: Optional[float] = None
    operating_cash_outflow: Optional[float] = None
    operating_net_cash: Optional[float] = None
    investing_cash_inflow: Optional[float] = None
    investing_cash_outflow: Optional[float] = None
    investing_net_cash: Optional[float] = None
    financing_cash_inflow: Optional[float] = None
    financing_cash_outflow: Optional[float] = None
    financing_net_cash: Optional[float] = None
    net_cash_change: Optional[float] = None
    free_cash_flow: Optional[float] = None

    def to_dict(self):
        return _to_dict(self)


# ── 机构持仓 ──────────────────────────────────────────────────────────

@dataclass
class InstitutionalHolding:
    """机构持仓数据"""
    code: str
    report_date: str = ""
    institution_type: str = ""           # 基金/券商/保险/QFII/社保等
    shares_held: Optional[float] = None
    share_pct: Optional[float] = None
    market_value: Optional[float] = None
    shares_change: Optional[float] = None
    institution_count: Optional[int] = None  # 机构家数

    def to_dict(self):
        return _to_dict(self)


# ── 大宗交易 ──────────────────────────────────────────────────────────

@dataclass
class BlockTrade:
    """大宗交易"""
    code: str
    date: str = ""
    name: str = ""
    price: Optional[float] = None
    volume: Optional[float] = None       # 成交量(股)
    amount: Optional[float] = None       # 成交额(元)
    premium_discount: Optional[float] = None  # 折溢价率(%)
    buyer: str = ""                      # 买入营业部
    seller: str = ""                     # 卖出营业部

    def to_dict(self):
        return _to_dict(self)


# ── 限售解禁 ──────────────────────────────────────────────────────────

@dataclass
class LockupExpiry:
    """限售解禁"""
    code: str
    date: str = ""
    name: str = ""
    shares_unlock: Optional[float] = None    # 解禁数量(股)
    share_pct: Optional[float] = None        # 解禁占总股本比例
    market_value: Optional[float] = None     # 解禁市值
    holder_type: str = ""                  # 解禁股东类型

    def to_dict(self):
        return _to_dict(self)


# ── 股权质押 ──────────────────────────────────────────────────────────

@dataclass
class SharePledge:
    """股权质押"""
    code: str
    date: str = ""
    pledger: str = ""                    # 出质人
    pledgee: str = ""                    # 质权人
    shares_pledged: Optional[float] = None  # 质押股数
    share_pct: Optional[float] = None       # 质押占总股本比例
    pledge_date: str = ""                # 质押起始日
    release_date: str = ""               # 质押到期日
    status: str = ""                     # 状态

    def to_dict(self):
        return _to_dict(self)


# ── 日内分时 ──────────────────────────────────────────────────────────

@dataclass
class IntradayTick:
    """日内分时数据"""
    code: str
    time: str = ""                       # "09:31" / "14:59"
    price: Optional[float] = None
    avg_price: Optional[float] = None    # 均价
    volume: Optional[float] = None       # 成交量
    amount: Optional[float] = None       # 成交额
    change_pct: Optional[float] = None   # 涨跌幅
    volume_pct: Optional[float] = None   # 成交量占比

    def to_dict(self):
        return _to_dict(self)


# ── 全市场股票列表 ────────────────────────────────────────────────────

@dataclass
class StockListItem:
    """全市场股票列表条目"""
    code: str
    name: str = ""
    market: str = ""                     # "SH" / "SZ" / "BJ"
    industry: str = ""
    listing_date: str = ""
    total_market_cap: Optional[float] = None
    total_shares: Optional[float] = None

    def to_dict(self):
        return _to_dict(self)


# ── 指数/板块成分股 ──────────────────────────────────────────────────

@dataclass
class IndexConstituent:
    """指数/板块成分股"""
    index_code: str
    index_name: str = ""
    stock_code: str = ""
    stock_name: str = ""
    weight: Optional[float] = None       # 权重(%)
    industry: str = ""

    def to_dict(self):
        return _to_dict(self)


# ── 高管持股变动 ──────────────────────────────────────────────────────

@dataclass
class InsiderTrade:
    """高管持股变动"""
    code: str
    date: str = ""
    name: str = ""                       # 高管姓名
    position: str = ""                   # 职务
    change_type: str = ""                # "增持" / "减持"
    shares_changed: Optional[float] = None  # 变动股数
    shares_after: Optional[float] = None    # 变动后持股
    price: Optional[float] = None        # 成交均价

    def to_dict(self):
        return _to_dict(self)


# ── 业绩预告 ──────────────────────────────────────────────────────────

@dataclass
class PerformanceForecast:
    """业绩预告"""
    code: str
    report_date: str = ""                # 预告对应的报告期
    forecast_type: str = ""              # 预增/预减/扭亏/续盈/略增/略减/首亏/续亏/不确定
    profit_lower: Optional[float] = None # 净利润下限
    profit_upper: Optional[float] = None # 净利润上限
    change_lower: Optional[float] = None # 变动幅度下限(%)
    change_upper: Optional[float] = None # 变动幅度上限(%)
    announcement_date: str = ""          # 预告公告日
    summary: str = ""                    # 业绩变动原因

    def to_dict(self):
        return _to_dict(self)


# ── 交易日历 ──────────────────────────────────────────────────────────

@dataclass
class TradeCalendar:
    """交易日历"""
    date: str = ""
    is_trading_day: bool = True
    day_type: str = ""                   # "交易日" / "周末" / "节假日"
    market: str = "A"                    # A股

    def to_dict(self):
        return _to_dict(self)


# ══════════════════════════════════════════════════════════════════════
# 第四批 — 交易衍生/公司深度/跨市场/宏观/技术指标
# ══════════════════════════════════════════════════════════════════════


# ── 涨停跌停 ──────────────────────────────────────────────────────────

@dataclass
class LimitUpDown:
    """涨停跌停数据"""
    code: str
    date: str = ""
    name: str = ""
    limit_type: str = ""               # "涨停" / "跌停" / "炸板"
    consecutive_days: int = 0          # 连板天数
    price: Optional[float] = None
    change_pct: Optional[float] = None
    block_amount: Optional[float] = None  # 封单额(元)
    block_ratio: Optional[float] = None   # 封单比(%)
    turnover_rate: Optional[float] = None # 换手率
    reason: str = ""                   # 涨停原因/概念

    def to_dict(self):
        return _to_dict(self)


# ── 市场情绪/涨跌家数 ────────────────────────────────────────────────

@dataclass
class MarketBreadth:
    """市场情绪概况"""
    date: str = ""
    advance: int = 0                   # 上涨家数
    decline: int = 0                   # 下跌家数
    flat: int = 0                      # 平盘家数
    limit_up: int = 0                  # 涨停家数
    limit_down: int = 0                # 跌停家数
    total_volume: Optional[float] = None  # 总成交量(股)
    total_amount: Optional[float] = None  # 总成交额(元)
    new_high: int = 0                  # 创年内新高
    new_low: int = 0                   # 创年内新低
    advance_pct: Optional[float] = None   # 上涨占比(%)
    description: str = ""              # 市场描述

    def to_dict(self):
        return _to_dict(self)

    def __post_init__(self):
        total = self.advance + self.decline + self.flat
        if total > 0 and self.advance_pct is None:
            self.advance_pct = round(self.advance / total * 100, 2)


# ── 新股/IPO ──────────────────────────────────────────────────────────

@dataclass
class IPOData:
    """新股/IPO数据"""
    code: str
    name: str = ""
    issue_date: str = ""               # 发行日
    listing_date: str = ""             # 上市日
    issue_price: Optional[float] = None    # 发行价
    issue_pe: Optional[float] = None       # 发行市盈率
    lottery_rate: Optional[float] = None   # 中签率(%)
    first_day_return: Optional[float] = None  # 首日涨幅(%)
    subscription_amount: Optional[float] = None # 募资额(元)
    industry: str = ""                 # 所属行业
    board: str = ""                    # 板块 主板/科创板/创业板/北交所
    status: str = ""                   # 状态

    def to_dict(self):
        return _to_dict(self)


# ── 可转债 ────────────────────────────────────────────────────────────

@dataclass
class ConvertibleBond:
    """可转债数据"""
    bond_code: str                     # 转债代码
    bond_name: str = ""                # 转债名称
    stock_code: str = ""               # 正股代码
    stock_name: str = ""               # 正股名称
    bond_price: Optional[float] = None     # 转债价格
    stock_price: Optional[float] = None    # 正股价格
    premium_ratio: Optional[float] = None  # 转股溢价率(%)
    conversion_price: Optional[float] = None  # 转股价
    pure_bond_value: Optional[float] = None   # 纯债价值
    ytm: Optional[float] = None       # 到期收益率(%)
    remaining_size: Optional[float] = None # 剩余规模(元)
    rating: str = ""                   # 评级 AAA/AA+/AA
    call_condition: str = ""           # 强赎条件
    put_condition: str = ""            # 回售条件
    next_call_date: str = ""           # 下一个计息日
    bond_type: str = ""                # 转债类型

    def to_dict(self):
        return _to_dict(self)


# ── ETF数据 ──────────────────────────────────────────────────────────

@dataclass
class ETFData:
    """ETF基金数据"""
    etf_code: str                      # ETF代码
    etf_name: str = ""                 # ETF名称
    nav: Optional[float] = None        # 净值
    price: Optional[float] = None      # 交易价
    premium_discount: Optional[float] = None  # 折溢价率(%)
    tracking_index: str = ""           # 跟踪指数
    scale: Optional[float] = None      # 基金规模(元)
    daily_volume: Optional[float] = None  # 日成交量
    daily_amount: Optional[float] = None  # 日成交额
    tracking_error: Optional[float] = None # 跟踪误差
    management_fee: Optional[float] = None # 管理费率(%)
    established_date: str = ""         # 成立日期
    fund_manager: str = ""             # 基金公司

    def to_dict(self):
        return _to_dict(self)


# ── 管理层信息 ──────────────────────────────────────────────────────

@dataclass
class ManagerInfo:
    """管理层信息"""
    code: str
    name: str = ""
    position: str = ""                 # 职务
    gender: str = ""
    age: Optional[int] = None
    education: str = ""                # 学历
    background: str = ""               # 简历
    compensation: Optional[float] = None   # 年度薪酬
    shares_held: Optional[float] = None    # 持股数
    start_date: str = ""               # 任职起始日

    def to_dict(self):
        return _to_dict(self)


# ── 股东增减持计划 ──────────────────────────────────────────────────

@dataclass
class ShareholderPlan:
    """股东增减持计划"""
    code: str
    announcement_date: str = ""        # 公告日
    shareholder_name: str = ""         # 股东名称
    plan_type: str = ""                # "增持" / "减持"
    planned_shares: Optional[float] = None # 计划变动股数
    planned_pct: Optional[float] = None    # 计划变动比例(%)
    price_range: str = ""              # 价格区间
    deadline: str = ""                 # 实施截止日
    completed_shares: Optional[float] = None  # 已完成股数
    completed_pct: Optional[float] = None     # 完成比例(%)
    status: str = ""                   # 进行中/已完成/已终止

    def to_dict(self):
        return _to_dict(self)


# ── 股票回购 ──────────────────────────────────────────────────────────

@dataclass
class ShareBuyback:
    """股票回购"""
    code: str
    announcement_date: str = ""        # 公告日
    planned_amount_lower: Optional[float] = None  # 计划金额下限
    planned_amount_upper: Optional[float] = None  # 计划金额上限
    planned_shares: Optional[float] = None        # 计划回购股数
    planned_pct: Optional[float] = None           # 计划回购比例(%)
    price_limit: Optional[float] = None         # 回购价格上限
    completed_amount: Optional[float] = None       # 已回购金额
    completed_shares: Optional[float] = None       # 已回购股数
    progress: Optional[float] = None               # 完成进度(%)
    purpose: str = ""                  # 回购目的
    status: str = ""
    deadline: str = ""

    def to_dict(self):
        return _to_dict(self)


# ── 全球指数 ─────────────────────────────────────────────────────────

@dataclass
class GlobalIndex:
    """全球市场指数"""
    code: str
    name: str = ""
    market: str = ""                   # US/HK/JP/EU/UK...
    price: Optional[float] = None
    change: Optional[float] = None
    change_pct: Optional[float] = None
    open: Optional[float] = None
    high: Optional[float] = None
    low: Optional[float] = None
    pre_close: Optional[float] = None
    timestamp: str = ""

    def to_dict(self):
        return _to_dict(self)


# ── 汇率 ──────────────────────────────────────────────────────────────

@dataclass
class ExchangeRate:
    """汇率数据"""
    currency_pair: str                 # "USDCNY" / "EURCNY" / "HKDCNY"
    rate: Optional[float] = None
    change_pct: Optional[float] = None
    timestamp: str = ""

    def to_dict(self):
        return _to_dict(self)


# ── 宏观经济指标 ──────────────────────────────────────────────────────

@dataclass
class MacroIndicator:
    """宏观经济指标"""
    indicator_name: str                # "GDP" / "CPI" / "PPI" / "PMI" / "M2" / "社融"
    date: str = ""                     # 数据期 "2026-03"
    value: Optional[float] = None
    yoy_change: Optional[float] = None # 同比(%)
    mom_change: Optional[float] = None # 环比(%)
    unit: str = ""                     # "%" / "万亿元" / "亿元"
    source: str = ""                   # 数据来源

    def to_dict(self):
        return _to_dict(self)


# ── 技术指标（计算产生） ────────────────────────────────────────────

@dataclass
class TechnicalIndicator:
    """技术指标（从K线计算）"""
    code: str
    date: str
    # 移动均线
    ma5: Optional[float] = None
    ma10: Optional[float] = None
    ma20: Optional[float] = None
    ma60: Optional[float] = None
    ma120: Optional[float] = None
    # MACD
    macd: Optional[float] = None       # DIF
    macd_signal: Optional[float] = None # DEA
    macd_hist: Optional[float] = None  # MACD柱
    # RSI
    rsi_6: Optional[float] = None
    rsi_12: Optional[float] = None
    rsi_24: Optional[float] = None
    # KDJ
    kdj_k: Optional[float] = None
    kdj_d: Optional[float] = None
    kdj_j: Optional[float] = None
    # BOLL
    boll_up: Optional[float] = None
    boll_mid: Optional[float] = None
    boll_low: Optional[float] = None
    # 成交量
    volume_ma5: Optional[float] = None
    volume_ma10: Optional[float] = None

    def to_dict(self):
        return _to_dict(self)

# ══════════════════════════════════════════════════════════════════════
# ══════════════════════════════════════════════════════════════════════
@dataclass
class BusinessLineItem:
    """主营构成单一行（产品/地区/行业）"""
    name: str = ""
    revenue: Optional[float] = None
    revenue_pct: Optional[float] = None
    cost: Optional[float] = None
    gross_margin: Optional[float] = None
    gross_margin_change: Optional[float] = None


@dataclass
class CustomerSupplierItem:
    """前五大客户或供应商单一条目"""
    rank: int = 0
    name: str = ""
    amount: Optional[float] = None
    amount_pct: Optional[float] = None
    is_new: Optional[bool] = None


# ══════════════════════════════════════════════════════════════════════
# 第五批 — 产业链挖掘深度数据维度
# ══════════════════════════════════════════════════════════════════════


# ── 主营构成（分产品/分地区/分行业）───────────────────────────────

@dataclass
class MainBusinessData:
    """主营构成：分产品/分地区/分行业 三个维度"""
    code: str
    report_date: str = ""
    report_type: str = ""                  # 年报/中报
    products: list = field(default_factory=list)   # list[BusinessLineItem]
    regions: list = field(default_factory=list)    # list[BusinessLineItem]
    industries: list = field(default_factory=list) # list[BusinessLineItem]
    total_revenue: Optional[float] = None
    timestamp: str = ""

    def to_dict(self):
        return _to_dict(self)


# ── 前五大客户 / 前五大供应商 ──────────────────────────────────────

@dataclass
class TopCustomerSupplier:
    """前五大客户或供应商"""
    code: str
    report_date: str = ""
    report_type: str = ""
    direction: str = ""                    # "customer" / "supplier"
    items: list = field(default_factory=list)    # list[CustomerSupplierItem]
    total_pct: Optional[float] = None
    timestamp: str = ""

    def to_dict(self):
        return _to_dict(self)


# ── 实际控制人 ──────────────────────────────────────────────────────

@dataclass
class ActualController:
    """实际控制人"""
    code: str
    controller_name: str = ""
    shareholding_ratio: Optional[float] = None
    control_level: int = 0
    control_path: str = ""
    nature: str = ""                       # 个人/国资/境外/其他
    total_shares: Optional[float] = None
    report_date: str = ""
    timestamp: str = ""

    def to_dict(self):
        return _to_dict(self)


# ── 子公司信息 ──────────────────────────────────────────────────────

@dataclass
class SubsidiaryItem:
    """单个子公司"""
    name: str = ""
    shareholding_ratio: Optional[float] = None
    business_nature: str = ""
    total_assets: Optional[float] = None
    net_profit: Optional[float] = None
    registered_capital: Optional[float] = None
    established_date: str = ""
    is_consolidated: Optional[bool] = None


@dataclass
class SubsidiaryData:
    """子公司列表"""
    code: str
    report_date: str = ""
    subsidiaries: list = field(default_factory=list)  # list[SubsidiaryItem]
    total_count: int = 0
    timestamp: str = ""

    def to_dict(self):
        return _to_dict(self)


# ── 关联交易 ──────────────────────────────────────────────────────

@dataclass
class RelatedPartyTrade:
    """关联交易单条"""
    code: str
    report_date: str = ""
    related_party: str = ""
    relationship: str = ""                # 子公司/联营/管理人员等
    trade_type: str = ""                  # 采购/销售/租赁/担保/资金拆借
    trade_amount: Optional[float] = None
    trade_balance: Optional[float] = None
    pricing_policy: str = ""
    is_material: Optional[bool] = None
    timestamp: str = ""

    def to_dict(self):
        return _to_dict(self)


# ── 研发投入 ──────────────────────────────────────────────────────

@dataclass
class RDInvestment:
    """研发投入数据"""
    code: str
    report_date: str = ""
    report_type: str = ""
    rd_expense: Optional[float] = None
    rd_expense_pct: Optional[float] = None
    capitalized_rd: Optional[float] = None
    capitalized_rd_pct: Optional[float] = None
    rd_staff_count: Optional[int] = None
    rd_staff_ratio: Optional[float] = None
    timestamp: str = ""

    def to_dict(self):
        return _to_dict(self)


# ── 并购事件 ──────────────────────────────────────────────────────

@dataclass
class MAEvent:
    """并购/重组事件"""
    code: str
    announcement_date: str = ""
    target_company: str = ""
    target_industry: str = ""
    transaction_amount: Optional[float] = None
    transaction_method: str = ""          # 现金/股份/混合
    shareholding_after: Optional[float] = None
    purpose: str = ""                     # 横向整合/纵向整合/多元化
    progress: str = ""                    # 进行中/已完成/已终止
    goodwill: Optional[float] = None
    timestamp: str = ""

    def to_dict(self):
        return _to_dict(self)


# ── 员工构成 ──────────────────────────────────────────────────────

@dataclass
class EmployeeComposition:
    """员工构成"""
    code: str
    report_date: str = ""
    total_employees: Optional[int] = None
    # 按学历
    education_phd: Optional[int] = None
    education_master: Optional[int] = None
    education_bachelor: Optional[int] = None
    education_college: Optional[int] = None
    education_other: Optional[int] = None
    # 按职能
    func_production: Optional[int] = None
    func_sales: Optional[int] = None
    func_technology: Optional[int] = None
    func_finance: Optional[int] = None
    func_admin: Optional[int] = None
    timestamp: str = ""

    def to_dict(self):
        return _to_dict(self)


# ── 机构调研 ──────────────────────────────────────────────────────

@dataclass
class InstitutionalVisit:
    """机构调研记录"""
    code: str
    visit_date: str = ""
    organization: str = ""
    organization_type: str = ""           # 基金/券商/保险/QFII/私募
    visitor_count: Optional[int] = None
    research_category: str = ""           # 特定对象调研/分析师会议/业绩说明会
    main_content: str = ""
    timestamp: str = ""

    def to_dict(self):
        return _to_dict(self)


# ── 可比公司 ──────────────────────────────────────────────────────

@dataclass
class PeerCompany:
    """可比公司"""
    code: str
    peer_code: str = ""
    peer_name: str = ""
    industry: str = ""
    reason: str = ""
    timestamp: str = ""

    def to_dict(self):
        return _to_dict(self)
