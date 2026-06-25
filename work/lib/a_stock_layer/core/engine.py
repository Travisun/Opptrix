"""
AshareEngine — 统一查询引擎。

核心逻辑:
1. 按优先级依次尝试 driver
2. 失败后自动回退到下一个 driver
3. 非实时数据优先走缓存
4. 返回统一 QueryResult
"""

from __future__ import annotations

import logging
import time
from typing import List, Optional, Union

from .cache import Cache
from .registry import DriverRegistry
from .schema import (
    Capability, IndexKline, IndexRealtime, MarketMoneyFlow,
    MoneyFlow, QueryResult, SectorMoneyFlow, StockKline, StockRealtime,
    DragonTiger, MarginTrade, Dividend,
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
    ActualController, SubsidiaryData, RelatedPartyTrade,
    RDInvestment, MAEvent, EmployeeComposition,
    InstitutionalVisit, PeerCompany,
)

logger = logging.getLogger("a_stock_layer.engine")

# 标记数据类型（用于缓存）
CACHE_TYPE = {
    "realtime":       "stock_realtime",
    "kline":          "stock_kline",
    "money_flow":     "stock_money_flow",
    "index_realtime": "index_realtime",
    "index_kline":    "index_kline",
    "market_money_flow": "market_money_flow",
    "sector_money_flow": "sector_money_flow",
}


def _sec_id(code: str) -> str:
    """统一证券代码格式，补全6位 + 标注交易所。

    返回: "1.600519" (上交所) / "0.000001" (深交所)
    内部使用东财格式以便 driver 间通用。
    """
    code = code.strip().zfill(6)
    # 深交所: 000, 001, 002, 003, 004, 200, 300, 301
    if code.startswith(("6", "9")):
        return f"1.{code}"
    else:
        return f"0.{code}"


class AshareEngine:
    """A 股统一查询引擎。

    用法:
        engine = AshareEngine()
        result = engine.realtime("600519")
        if result.success:
            for row in result.data:
                print(row.name, row.price)
    """

    def __init__(self, auto_discover: bool = True):
        self.registry = DriverRegistry()
        self.cache = Cache()
        if auto_discover:
            count = self.registry.discover_and_register_all()
            logger.info("引擎初始化完毕，已注册 %s 个 driver", count)

    # ── 内部查询方法 ──────────────────────────────────────────────────

    def _query(
        self,
        cap: Capability,
        method: str,
        cache_type: str,
        use_cache: bool = True,
        **kwargs,
    ) -> QueryResult:
        """通用查询逻辑：尝试 cache → driver 链。"""
        # 1. 尝试读缓存
        cache_key = cache_type
        if use_cache and cache_type in CACHE_TYPE.values():
            cached = self.cache.get(cache_type, method=method, **kwargs)
            if cached is not None:
                return QueryResult(
                    success=True,
                    data=cached,
                    source="cache",
                    cached=True,
                )

        # 2. 按优先级遍历 driver
        drivers = self.registry.get_drivers_for_capability(cap)
        if not drivers:
            return QueryResult(
                success=False,
                error=f"没有可用的 driver 支持 [{cap.value}]",
            )

        last_error = ""
        for driver in drivers:
            try:
                driver_method = getattr(driver, method, None)
                if driver_method is None:
                    continue
                data = driver_method(**kwargs)
                if data is None:
                    continue
                data_list = list(data) if isinstance(data, (list, tuple)) else [data]
                if not data_list:
                    continue

                # 3. 写入缓存（非实时类型）
                if use_cache and cache_type in CACHE_TYPE.values():
                    self.cache.set(cache_type, [r.to_dict() for r in data_list],
                                   method=method, **kwargs)

                return QueryResult(
                    success=True,
                    data=data_list,
                    source=driver.name(),
                )
            except Exception as e:
                last_error = f"{driver.name()}: {e}"
                logger.warning("Driver [%s] 查询失败 (%s): %s",
                               driver.name(), method, e)
                continue

        return QueryResult(
            success=False,
            error=f"所有 driver 均失败: {last_error}",
        )

    def _to_df(self, result: QueryResult):
        """将结果转为 DataFrame（pandas 可选）。"""
        try:
            import pandas as pd
            if result.success and result.data:
                dicts = [r.to_dict() if hasattr(r, 'to_dict') else r for r in result.data]
                return pd.DataFrame(dicts)
            return pd.DataFrame()
        except ImportError:
            return result.data

    # ── 公开 API ──────────────────────────────────────────────────────

    def realtime(self, code: str, as_df: bool = False) -> Union[QueryResult, "pd.DataFrame"]:
        """查询个股实时行情。"""
        result = self._query(
            Capability.STOCK_REALTIME, "realtime",
            cache_type="stock_realtime",
            use_cache=False,
            code=code,
        )
        return self._to_df(result) if as_df else result

    def batch_realtime(self, codes: List[str], as_df: bool = False) -> Union[QueryResult, "pd.DataFrame"]:
        """批量查询个股实时行情。"""
        result = self._query(
            Capability.STOCK_REALTIME, "batch_realtime",
            cache_type="stock_realtime",
            use_cache=False,
            codes=codes,
        )
        return self._to_df(result) if as_df else result

    def kline(self, code: str, period: str = "daily",
              start: str = "", end: str = "",
              as_df: bool = False) -> Union[QueryResult, "pd.DataFrame"]:
        """查询个股K线。

        Args:
            code: 股票代码, 如 "600519"
            period: "daily" / "weekly" / "monthly" / "60m" / "30m" / "5m" / "1m"
            start: 起始日期 "2024-01-01"
            end: 结束日期 "2024-12-31"
        """
        result = self._query(
            Capability.STOCK_KLINE, "kline",
            cache_type="stock_kline",
            code=code, period=period, start=start, end=end,
        )
        return self._to_df(result) if as_df else result

    def money_flow(self, code: str, as_df: bool = False) -> Union[QueryResult, "pd.DataFrame"]:
        """查询个股资金流。"""
        result = self._query(
            Capability.STOCK_MONEY_FLOW, "money_flow",
            cache_type="stock_money_flow",
            code=code,
        )
        return self._to_df(result) if as_df else result

    def index_realtime(self, code: str, as_df: bool = False) -> Union[QueryResult, "pd.DataFrame"]:
        """查询大盘指数实时行情。"""
        result = self._query(
            Capability.INDEX_REALTIME, "index_realtime",
            cache_type="index_realtime",
            use_cache=False,
            code=code,
        )
        return self._to_df(result) if as_df else result

    def index_kline(self, code: str, period: str = "daily",
                    start: str = "", end: str = "",
                    as_df: bool = False) -> Union[QueryResult, "pd.DataFrame"]:
        """查询指数K线。"""
        result = self._query(
            Capability.INDEX_KLINE, "index_kline",
            cache_type="index_kline",
            code=code, period=period, start=start, end=end,
        )
        return self._to_df(result) if as_df else result

    def market_money_flow(self, direction: str = "north",
                          as_df: bool = False) -> Union[QueryResult, "pd.DataFrame"]:
        """查询北向/南向资金流。"""
        result = self._query(
            Capability.MARKET_MONEY_FLOW, "market_money_flow",
            cache_type="market_money_flow",
            direction=direction,
        )
        return self._to_df(result) if as_df else result

    def sector_money_flow(self, sector_type: str = "industry",
                          as_df: bool = False) -> Union[QueryResult, "pd.DataFrame"]:
        """查询行业/板块资金流。"""
        result = self._query(
            Capability.SECTOR_MONEY_FLOW, "sector_money_flow",
            cache_type="sector_money_flow",
            sector_type=sector_type,
        )
        return self._to_df(result) if as_df else result

    # ── 缓存管理 ──────────────────────────────────────────────────────

    def clear_cache(self, data_type: Optional[str] = None) -> int:
        """清除缓存。"""
        if data_type:
            return self.cache.clear_type(data_type)
        return self.cache.clear_all()

    def cache_stats(self) -> dict:
        """缓存统计。"""
        import sqlite3
        stats = {}
        try:
            conn = self.cache._get_conn()
            rows = conn.execute(
                "SELECT data_type, COUNT(*), MIN(created_at), MAX(created_at) "
                "FROM cache GROUP BY data_type"
            ).fetchall()
            for row in rows:
                stats[row[0]] = {
                    "count": row[1],
                    "oldest": row[2],
                    "newest": row[3],
                }
        except Exception:
            pass
        return stats

    # ── Driver 热管理 ─────────────────────────────────────────────────

    def list_drivers(self) -> List[dict]:
        """列出所有注册的 driver 及其能力。"""
        result = []
        for name in self.registry.list_drivers():
            d = self.registry.get(name)
            if d:
                result.append({
                    "name": name,
                    "priority": d.priority(),
                    "capabilities": [c.value for c in d.capabilities()],
                })
        return result

    def register_driver(self, driver_instance) -> None:
        """运行时注册一个 driver（热插拔）。"""
        self.registry.register(driver_instance)

    def unregister_driver(self, name: str) -> None:
        """运行时注销一个 driver。"""
        self.registry.unregister(name)

    # ══════════════════════════════════════════════════════════════════
    # 扩展数据维度 — 投资研究
    # ══════════════════════════════════════════════════════════════════

    def profile(self, code: str, as_df: bool = False) -> Union[QueryResult, "pd.DataFrame"]:
        """查询个股背景/公司概况。"""
        result = self._query(
            Capability.STOCK_PROFILE, "profile",
            cache_type="stock_profile", code=code,
        )
        return self._to_df(result) if as_df else result

    def shareholders(self, code: str, report_date: str = "",
                     as_df: bool = False) -> Union[QueryResult, "pd.DataFrame"]:
        """查询股东数据（股东人数、十大股东等）。

        Args:
            code: 股票代码
            report_date: 报告期，如 "2024-06-30"，留空取最新
        """
        result = self._query(
            Capability.SHAREHOLDER, "shareholders",
            cache_type="shareholder", code=code, report_date=report_date,
        )
        return self._to_df(result) if as_df else result

    def financials(self, code: str, report_date: str = "",
                   report_type: str = "annual",
                   as_df: bool = False) -> Union[QueryResult, "pd.DataFrame"]:
        """查询财报摘要。

        Args:
            code: 股票代码
            report_date: 报告期如 "2024-12-31"，留空取最新
            report_type: "annual" 年报 / "semi" 中报 / "q1" 一季报 / "q3" 三季报
        """
        result = self._query(
            Capability.FINANCIAL_SUMMARY, "financials",
            cache_type="financial_summary",
            code=code, report_date=report_date, report_type=report_type,
        )
        return self._to_df(result) if as_df else result

    def news(self, code: str, page: int = 1, page_size: int = 20,
             news_type: str = "all",
             as_df: bool = False) -> Union[QueryResult, "pd.DataFrame"]:
        """查询新闻公告。

        Args:
            code: 股票代码
            page: 页码
            page_size: 每页条数
            news_type: "all" 全部 / "news" 新闻 / "announcement" 公告
        """
        result = self._query(
            Capability.NEWS, "news",
            cache_type="news", use_cache=page <= 2,
            code=code, page=page, page_size=page_size, news_type=news_type,
        )
        return self._to_df(result) if as_df else result

    def sentiment(self, code: str, as_df: bool = False) -> Union[QueryResult, "pd.DataFrame"]:
        """查询舆情动态。"""
        result = self._query(
            Capability.SENTIMENT, "sentiment",
            cache_type="sentiment", use_cache=False,
            code=code,
        )
        return self._to_df(result) if as_df else result

    # ══════════════════════════════════════════════════════════════════
    # 第三批 — 交易衍生/持股/参考/宏观（14维度）
    # ══════════════════════════════════════════════════════════════════

    def dragon_tiger(self, date: str = "",
                     as_df: bool = False) -> Union[QueryResult, "pd.DataFrame"]:
        """查询龙虎榜。

        Args:
            date: 日期 "2024-12-20"，留空取最新
        """
        result = self._query(
            Capability.DRAGON_TIGER, "dragon_tiger",
            cache_type="dragon_tiger", date=date,
        )
        return self._to_df(result) if as_df else result

    def margin_trade(self, code: str,
                     as_df: bool = False) -> Union[QueryResult, "pd.DataFrame"]:
        """查询个股融资融券数据。"""
        result = self._query(
            Capability.MARGIN_TRADE, "margin_trade",
            cache_type="margin_trade", code=code,
        )
        return self._to_df(result) if as_df else result

    def dividend(self, code: str,
                 as_df: bool = False) -> Union[QueryResult, "pd.DataFrame"]:
        """查询分红送配历史。"""
        result = self._query(
            Capability.DIVIDEND, "dividend",
            cache_type="dividend", code=code,
        )
        return self._to_df(result) if as_df else result

    def balance_sheet(self, code: str, report_date: str = "",
                      as_df: bool = False) -> Union[QueryResult, "pd.DataFrame"]:
        """查询资产负债表。"""
        result = self._query(
            Capability.BALANCE_SHEET, "balance_sheet",
            cache_type="balance_sheet", code=code, report_date=report_date,
        )
        return self._to_df(result) if as_df else result

    def income_statement(self, code: str, report_date: str = "",
                         as_df: bool = False) -> Union[QueryResult, "pd.DataFrame"]:
        """查询利润表（详细）。"""
        result = self._query(
            Capability.INCOME_STMT, "income_statement",
            cache_type="income_statement", code=code, report_date=report_date,
        )
        return self._to_df(result) if as_df else result

    def cash_flow(self, code: str, report_date: str = "",
                  as_df: bool = False) -> Union[QueryResult, "pd.DataFrame"]:
        """查询现金流量表。"""
        result = self._query(
            Capability.CASH_FLOW, "cash_flow",
            cache_type="cash_flow", code=code, report_date=report_date,
        )
        return self._to_df(result) if as_df else result

    def inst_holding(self, code: str,
                     as_df: bool = False) -> Union[QueryResult, "pd.DataFrame"]:
        """查询机构持仓。"""
        result = self._query(
            Capability.INST_HOLDING, "inst_holding",
            cache_type="inst_holding", code=code,
        )
        return self._to_df(result) if as_df else result

    def block_trade(self, code: str,
                    as_df: bool = False) -> Union[QueryResult, "pd.DataFrame"]:
        """查询大宗交易。"""
        result = self._query(
            Capability.BLOCK_TRADE, "block_trade",
            cache_type="block_trade", code=code,
        )
        return self._to_df(result) if as_df else result

    def lockup_expiry(self, code: str,
                      as_df: bool = False) -> Union[QueryResult, "pd.DataFrame"]:
        """查询限售解禁。"""
        result = self._query(
            Capability.LOCKUP_EXPIRY, "lockup_expiry",
            cache_type="lockup_expiry", code=code,
        )
        return self._to_df(result) if as_df else result

    def share_pledge(self, code: str,
                     as_df: bool = False) -> Union[QueryResult, "pd.DataFrame"]:
        """查询股权质押。"""
        result = self._query(
            Capability.SHARE_PLEDGE, "share_pledge",
            cache_type="share_pledge", code=code,
        )
        return self._to_df(result) if as_df else result

    def intraday_tick(self, code: str, date: str = "",
                      as_df: bool = False) -> Union[QueryResult, "pd.DataFrame"]:
        """查询日内分时数据（分钟粒度）。"""
        result = self._query(
            Capability.INTRADAY_TICK, "intraday_tick",
            cache_type="intraday_tick", use_cache=False,
            code=code, date=date,
        )
        return self._to_df(result) if as_df else result

    def stock_list(self, market: str = "all",
                   as_df: bool = False) -> Union[QueryResult, "pd.DataFrame"]:
        """查询全市场股票列表。

        Args:
            market: "all" / "sh" / "sz" / "bj"
        """
        result = self._query(
            Capability.STOCK_LIST, "stock_list",
            cache_type="stock_list", market=market,
        )
        return self._to_df(result) if as_df else result

    def index_constituents(self, index_code: str,
                           as_df: bool = False) -> Union[QueryResult, "pd.DataFrame"]:
        """查询指数/板块成分股。

        Args:
            index_code: 指数代码如 "000300"(沪深300) / "BK0447"(板块)
        """
        result = self._query(
            Capability.INDEX_CONST, "index_constituents",
            cache_type="index_constituent", index_code=index_code,
        )
        return self._to_df(result) if as_df else result

    def insider_trade(self, code: str,
                      as_df: bool = False) -> Union[QueryResult, "pd.DataFrame"]:
        """查询高管持股变动。"""
        result = self._query(
            Capability.INSIDER_TRADE, "insider_trade",
            cache_type="insider_trade", code=code,
        )
        return self._to_df(result) if as_df else result

    def perf_forecast(self, code: str,
                      as_df: bool = False) -> Union[QueryResult, "pd.DataFrame"]:
        """查询业绩预告。"""
        result = self._query(
            Capability.PERF_FORECAST, "perf_forecast",
            cache_type="perf_forecast", code=code,
        )
        return self._to_df(result) if as_df else result

    def trade_calendar(self, year: int = 0,
                       as_df: bool = False) -> Union[QueryResult, "pd.DataFrame"]:
        """查询交易日历。

        Args:
            year: 年份如 2024，留空取当年
        """
        result = self._query(
            Capability.TRADE_CALENDAR, "trade_calendar",
            cache_type="trade_calendar", year=year,
        )
        return self._to_df(result) if as_df else result


    # ══════════════════════════════════════════════════════════════════
    # 第四批 — 交易衍生/公司深度/跨市场/宏观/技术指标
    # ══════════════════════════════════════════════════════════════════

    def limit_updown(self, date: str = "",
                     as_df: bool = False) -> Union[QueryResult, "pd.DataFrame"]:
        """查询涨停跌停数据。"""
        result = self._query(Capability.LIMIT_UPDOWN, "limit_updown",
                             cache_type="limit_updown", use_cache=False, date=date)
        return self._to_df(result) if as_df else result

    def market_breadth(self, date: str = "",
                       as_df: bool = False) -> Union[QueryResult, "pd.DataFrame"]:
        """查询市场情绪/涨跌家数。"""
        result = self._query(Capability.MARKET_BREADTH, "market_breadth",
                             cache_type="market_breadth", use_cache=False, date=date)
        return self._to_df(result) if as_df else result

    def ipo_data(self, as_df: bool = False) -> Union[QueryResult, "pd.DataFrame"]:
        """查询新股/IPO数据。"""
        result = self._query(Capability.IPO_DATA, "ipo_data",
                             cache_type="ipo_data")
        return self._to_df(result) if as_df else result

    def convertible_bonds(self, as_df: bool = False) -> Union[QueryResult, "pd.DataFrame"]:
        """查询可转债数据。"""
        result = self._query(Capability.CONVERTIBLE_BOND, "convertible_bonds",
                             cache_type="convertible_bond", use_cache=False)
        return self._to_df(result) if as_df else result

    def etf_data(self, etf_code: str = "",
                 as_df: bool = False) -> Union[QueryResult, "pd.DataFrame"]:
        """查询ETF数据。"""
        result = self._query(Capability.ETF_DATA, "etf_data",
                             cache_type="etf_data", etf_code=etf_code)
        return self._to_df(result) if as_df else result

    def manager_info(self, code: str,
                     as_df: bool = False) -> Union[QueryResult, "pd.DataFrame"]:
        """查询公司管理层信息。"""
        result = self._query(Capability.MANAGER_INFO, "manager_info",
                             cache_type="manager_info", code=code)
        return self._to_df(result) if as_df else result

    def shareholder_plans(self, code: str,
                          as_df: bool = False) -> Union[QueryResult, "pd.DataFrame"]:
        """查询股东增减持计划。"""
        result = self._query(Capability.SHAREHOLDER_PLAN, "shareholder_plans",
                             cache_type="shareholder_plan", code=code)
        return self._to_df(result) if as_df else result

    def buyback(self, code: str,
                as_df: bool = False) -> Union[QueryResult, "pd.DataFrame"]:
        """查询股票回购信息。"""
        result = self._query(Capability.BUYBACK, "buyback",
                             cache_type="buyback", code=code)
        return self._to_df(result) if as_df else result

    def global_index(self, code: str = "",
                     as_df: bool = False) -> Union[QueryResult, "pd.DataFrame"]:
        """查询全球指数。

        Args:
            code: "dji" 道指 / "spx" 标普 / "ixic" 纳指 / "hsi" 恒指 / "n225" 日经 / 留空取全部
        """
        result = self._query(Capability.GLOBAL_INDEX, "global_index",
                             cache_type="global_index", use_cache=False, code=code)
        return self._to_df(result) if as_df else result

    def exchange_rate(self, pair: str = "",
                      as_df: bool = False) -> Union[QueryResult, "pd.DataFrame"]:
        """查询汇率。

        Args:
            pair: "USDCNY" / "EURCNY" / "HKDCNY" / "JPYCNY" / "GBPCNY" / 留空取全部
        """
        result = self._query(Capability.EXCHANGE_RATE, "exchange_rate",
                             cache_type="exchange_rate", pair=pair)
        return self._to_df(result) if as_df else result

    def macro_indicator(self, indicator: str = "",
                        as_df: bool = False) -> Union[QueryResult, "pd.DataFrame"]:
        """查询宏观经济指标。

        Args:
            indicator: "GDP" / "CPI" / "PPI" / "PMI" / "M2" / 留空取全部
        """
        result = self._query(Capability.MACRO_INDICATOR, "macro_indicator",
                             cache_type="macro_indicator", indicator=indicator)
        return self._to_df(result) if as_df else result

    def tech_indicator(self, code: str, period: str = "daily",
                       count: int = 120,
                       as_df: bool = False) -> Union[QueryResult, "pd.DataFrame"]:
        """计算技术指标（从K线自动计算，无需外部API）。

        Args:
            code: 股票代码
            period: K线周期
            count: 回看K线条数
        """
        # 先拿K线数据
        kline_result = self.kline(code, period=period, as_df=False)
        if not kline_result.success or not kline_result.data:
            return QueryResult(success=False, error=f"获取K线失败: {kline_result.error}")
        klines = sorted(kline_result.data, key=lambda x: x.date)
        try:
            from a_stock_layer.utils.indicators import compute_indicators
            indicators = compute_indicators(code, klines)
            result = QueryResult(success=True, data=indicators, source="calc")
            return self._to_df(result) if as_df else result
        except Exception as e:
            return QueryResult(success=False, error=f"技术指标计算失败: {e}")


    # ══════════════════════════════════════════════════════════════════
    # 产业链挖掘 — 新查询方法
    # ══════════════════════════════════════════════════════════════════

    def main_business(self, code: str, as_df: bool = False) -> Union[QueryResult, "pd.DataFrame"]:
        """查询主营构成（分产品/分地区/分行业）。"""
        result = self._query(
            Capability.MAIN_BUSINESS, "main_business",
            cache_type="main_business",
            code=code,
        )
        return self._to_df(result) if as_df else result

    def top_customer_supplier(self, code: str, direction: str = "customer", as_df: bool = False) -> Union[QueryResult, "pd.DataFrame"]:
        """查询前五大客户/供应商。direction="customer" 客户 / "supplier" 供应商"""
        result = self._query(
            Capability.TOP_CUSTOMER, "top_customer_supplier",
            cache_type="top_customer",
            code=code, direction=direction,
        )
        return self._to_df(result) if as_df else result

    def actual_controller(self, code: str, as_df: bool = False) -> Union[QueryResult, "pd.DataFrame"]:
        """查询实际控制人信息。"""
        result = self._query(
            Capability.ACTUAL_CONTROLLER, "actual_controller",
            cache_type="actual_controller",
            code=code,
        )
        return self._to_df(result) if as_df else result

    def subsidiaries(self, code: str, as_df: bool = False) -> Union[QueryResult, "pd.DataFrame"]:
        """查询子公司信息列表。"""
        result = self._query(
            Capability.SUBSIDIARY, "subsidiaries",
            cache_type="subsidiary",
            code=code,
        )
        return self._to_df(result) if as_df else result

    def related_party_trades(self, code: str, as_df: bool = False) -> Union[QueryResult, "pd.DataFrame"]:
        """查询关联交易数据。"""
        result = self._query(
            Capability.RELATED_PARTY, "related_party_trades",
            cache_type="related_party",
            code=code,
        )
        return self._to_df(result) if as_df else result

    def rd_investment(self, code: str, as_df: bool = False) -> Union[QueryResult, "pd.DataFrame"]:
        """查询研发投入数据。"""
        result = self._query(
            Capability.RD_INVESTMENT, "rd_investment",
            cache_type="rd_investment",
            code=code,
        )
        return self._to_df(result) if as_df else result

    def ma_events(self, code: str, as_df: bool = False) -> Union[QueryResult, "pd.DataFrame"]:
        """查询并购/重组事件。"""
        result = self._query(
            Capability.MERGER_ACQUISITION, "ma_events",
            cache_type="merger_acquisition",
            code=code,
        )
        return self._to_df(result) if as_df else result

    def employee_composition(self, code: str, as_df: bool = False) -> Union[QueryResult, "pd.DataFrame"]:
        """查询员工构成（按学历/职能）。"""
        result = self._query(
            Capability.EMPLOYEE_COMP, "employee_composition",
            cache_type="employee_composition",
            code=code,
        )
        return self._to_df(result) if as_df else result

    def institutional_visits(self, code: str, as_df: bool = False) -> Union[QueryResult, "pd.DataFrame"]:
        """查询机构调研记录。"""
        result = self._query(
            Capability.INSTITUTIONAL_VISIT, "institutional_visits",
            cache_type="institutional_visit",
            code=code,
        )
        return self._to_df(result) if as_df else result

    def peer_companies(self, code: str, as_df: bool = False) -> Union[QueryResult, "pd.DataFrame"]:
        """查询可比公司。"""
        result = self._query(
            Capability.PEER_COMPANY, "peer_companies",
            cache_type="peer_company",
            code=code,
        )
        return self._to_df(result) if as_df else result

    # ══════════════════════════════════════════════════════════════════
    # 持仓管理
    # ══════════════════════════════════════════════════════════════════

    @property
    def portfolio(self):
        """持仓管理器（延迟初始化）。

        用法:
            # 记录交易
            engine.portfolio.buy("600519", 100, 220.50)
            engine.portfolio.sell("600519", 50, 240.00)

            # 查看持仓
            positions = engine.portfolio.holdings()
            summary = engine.portfolio.summary()

            # 查看/删除交易
            trades = engine.portfolio.trades("600519")
            engine.portfolio.remove_trade(1)
        """
        if not hasattr(self, "_portfolio"):
            from a_stock_layer.portfolio import PortfolioManager
            self._portfolio = PortfolioManager(engine=self)
        return self._portfolio
