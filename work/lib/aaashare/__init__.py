"""
aaashare — A股数据层（A-Share Data Layer）

统一API、多数据源自动回退、结构化驱动、缓存加速。

快速开始:
    from aaashare import AshareEngine

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
