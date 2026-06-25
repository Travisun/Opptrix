"""
a_stock_layer — AStockLayer 数据层

统一API、多数据源自动回退、结构化驱动、缓存加速。

快速开始:
    from a_stock_layer import AshareEngine

    engine = AshareEngine()
    df = engine.realtime("600519")       # 贵州茅台实时行情
    df = engine.kline("600519")          # 日K线
    df = engine.money_flow("600519")     # 资金流
    df = engine.profile("600519")        # 公司概况
    df = engine.shareholders("600519")   # 股东数据
    df = engine.financials("600519")     # 财报摘要
    df = engine.news("600519")           # 新闻公告
    df = engine.sentiment("600519")      # 舆情动态
"""

from .portfolio import PortfolioManager, TradeRecord, HoldingPosition, PnLSummary
from .core.engine import AshareEngine
from .core.schema import (
    StockRealtime, StockKline, MoneyFlow,
    IndexRealtime, IndexKline,
    MarketMoneyFlow, SectorMoneyFlow,
    StockProfile, ShareholderData, ShareholderItem,
    FinancialSummary, NewsItem, SentimentData,
    DragonTiger, DragonTigerSeat,
    MarginTrade, Dividend,
    BalanceSheet, IncomeStatement, CashFlow,
    InstitutionalHolding, BlockTrade,
    LockupExpiry, SharePledge,
    IntradayTick, StockListItem,
    IndexConstituent, InsiderTrade,
    PerformanceForecast, TradeCalendar,
        LimitUpDown, MarketBreadth,
    IPOData, ConvertibleBond,
    ETFData, ManagerInfo,
    ShareholderPlan, ShareBuyback,
    GlobalIndex, ExchangeRate,
    MacroIndicator, TechnicalIndicator,
    MainBusinessData, TopCustomerSupplier,
    ActualController, SubsidiaryData, SubsidiaryItem,
    RelatedPartyTrade, RDInvestment, MAEvent,
    EmployeeComposition, InstitutionalVisit, PeerCompany,
    BusinessLineItem, CustomerSupplierItem,
    Capability,
)
from .core.registry import DriverRegistry

__version__ = "1.0.0"
__all__ = [
    "AshareEngine", "DriverRegistry",
    "Capability",
    "StockRealtime", "StockKline", "MoneyFlow",
    "IndexRealtime", "IndexKline",
    "MarketMoneyFlow", "SectorMoneyFlow",
    "StockProfile", "ShareholderData", "ShareholderItem",
    "FinancialSummary", "NewsItem", "SentimentData",
    "DragonTiger", "DragonTigerSeat",
    "MarginTrade", "Dividend",
    "BalanceSheet", "IncomeStatement", "CashFlow",
    "InstitutionalHolding", "BlockTrade",
    "LockupExpiry", "SharePledge",
    "IntradayTick", "StockListItem",
    "IndexConstituent", "InsiderTrade",
    "PerformanceForecast", "TradeCalendar",
        "LimitUpDown", "MarketBreadth",
    "IPOData", "ConvertibleBond",
    "ETFData", "ManagerInfo",
    "ShareholderPlan", "ShareBuyback",
    "GlobalIndex", "ExchangeRate",
    "MacroIndicator", "TechnicalIndicator",
]

# ── 策略引擎 (t-strategy) ──────────────────────────────────────────────
from a_stock_layer.strategies import (
    SignalEngine, quick_assess, scan_portfolio, generate_report,
    indicators, factors,
    list_strategies, get_strategy,
)
__all__ = [x for x in dir() if not x.startswith('_')]

