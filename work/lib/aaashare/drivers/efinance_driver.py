"""
efinance Driver — 东方财富数据简易封装

覆盖: 个股行情/K线、大盘指数
优先级: 80
特点: 轻量 Python 库，底层走东方财富接口，做补充
"""

from __future__ import annotations

import logging
from typing import List, Optional

from aaashare.core.schema import (
    Capability, IndexKline, IndexRealtime, StockKline, StockRealtime,
)
from aaashare.drivers.base import BaseDriver

logger = logging.getLogger("ashare.driver.efinance")


class EfinanceDriver(BaseDriver):

    def __init__(self):
        self._ef = None

    def name(self) -> str:
        return "efinance"

    def priority(self) -> int:
        return 80

    def capabilities(self) -> List[Capability]:
        return [
            Capability.STOCK_REALTIME,
            Capability.STOCK_KLINE,
            Capability.INDEX_REALTIME,
            Capability.INDEX_KLINE,
        ]

    def _ensure(self):
        if self._ef is not None:
            return
        try:
            import efinance as ef
            self._ef = ef
        except ImportError:
            logger.debug("efinance 未安装，忽略此driver")
            raise

    def realtime(self, code: str) -> Optional[List[StockRealtime]]:
        try:
            self._ensure()
            c = code.strip().zfill(6)
            df = self._ef.stock.get_quote([c])
            if df is None or df.empty:
                return None
            row = df.iloc[0]
            return [StockRealtime(
                code=self._norm_code(code),
                name=row.get("股票名称", row.get("name", "")),
                price=_v(row.get("最新价", row.get("price"))),
                open=_v(row.get("今开", row.get("open"))),
                high=_v(row.get("最高", row.get("high"))),
                low=_v(row.get("最低", row.get("low"))),
                pre_close=_v(row.get("昨收", row.get("pre_close"))),
                volume=_v(row.get("成交量", row.get("volume"))),
                amount=_v(row.get("成交额", row.get("amount"))),
                change=_v(row.get("涨跌额", row.get("change"))),
                change_pct=_v(row.get("涨跌幅", row.get("change_pct"))),
                turnover_rate=_v(row.get("换手率", row.get("turnover_rate"))),
                pe=_v(row.get("市盈率-动态", row.get("pe"))),
                market_cap=_v(row.get("总市值", row.get("total_market_cap"))),
                amplitude=_v(row.get("振幅", row.get("amplitude"))),
            )]
        except Exception as e:
            logger.debug("efinance 实时行情失败 [%s]: %s", code, e)
            return None

    def kline(self, code: str, period: str = "daily",
              start: str = "", end: str = "") -> Optional[List[StockKline]]:
        try:
            self._ensure()
            c = code.strip().zfill(6)
            freq_map = {"daily": "101", "weekly": "102", "monthly": "103",
                        "60m": "60", "30m": "30", "15m": "15", "5m": "5", "1m": "1"}
            freq = freq_map.get(period, "daily")

            df = self._ef.stock.get_quote_history(c, klt=freq, beg=start, end=end)
            if df is None or df.empty:
                return None

            results = []
            for _, row in df.iterrows():
                results.append(StockKline(
                    code=self._norm_code(code),
                    date=str(row.get("日期", row.get("date", "")))[:10],
                    open=_v(row.get("开盘", row.get("open"))),
                    close=_v(row.get("收盘", row.get("close"))),
                    high=_v(row.get("最高", row.get("high"))),
                    low=_v(row.get("最低", row.get("low"))),
                    volume=_v(row.get("成交量", row.get("volume"))),
                    amount=_v(row.get("成交额", row.get("amount"))),
                    change_pct=_v(row.get("涨跌幅", row.get("change_pct"))),
                    turnover_rate=_v(row.get("换手率", row.get("turnover_rate"))),
                ))
            return results if results else None
        except Exception as e:
            logger.debug("efinance K线失败 [%s]: %s", code, e)
            return None

    def index_realtime(self, code: str) -> Optional[List[IndexRealtime]]:
        try:
            self._ensure()
            c = code.strip().zfill(6)
            df = self._ef.stock.get_quote([c])
            if df is None or df.empty:
                return None
            row = df.iloc[0]
            return [IndexRealtime(
                code=self._norm_code(code),
                name=row.get("股票名称", row.get("name", "")),
                price=_v(row.get("最新价", row.get("price"))),
                open=_v(row.get("今开", row.get("open"))),
                high=_v(row.get("最高", row.get("high"))),
                low=_v(row.get("最低", row.get("low"))),
                pre_close=_v(row.get("昨收", row.get("pre_close"))),
                change=_v(row.get("涨跌额", row.get("change"))),
                change_pct=_v(row.get("涨跌幅", row.get("change_pct"))),
                volume=_v(row.get("成交量", row.get("volume"))),
                amount=_v(row.get("成交额", row.get("amount"))),
            )]
        except Exception as e:
            logger.debug("efinance 指数实时失败 [%s]: %s", code, e)
            return None

    def index_kline(self, code: str, period: str = "daily",
                    start: str = "", end: str = "") -> Optional[List[IndexKline]]:
        try:
            self._ensure()
            c = code.strip().zfill(6)
            df = self._ef.stock.get_quote_history(c, beg=start, end=end)
            if df is None or df.empty:
                return None
            results = []
            for _, row in df.iterrows():
                results.append(IndexKline(
                    code=self._norm_code(code),
                    date=str(row.get("日期", row.get("date", "")))[:10],
                    open=_v(row.get("开盘", row.get("open"))),
                    close=_v(row.get("收盘", row.get("close"))),
                    high=_v(row.get("最高", row.get("high"))),
                    low=_v(row.get("最低", row.get("low"))),
                    volume=_v(row.get("成交量", row.get("volume"))),
                    amount=_v(row.get("成交额", row.get("amount"))),
                    change_pct=_v(row.get("涨跌幅", row.get("change_pct"))),
                ))
            return results if results else None
        except Exception as e:
            logger.debug("efinance 指数K线失败 [%s]: %s", code, e)
            return None


def _v(v) -> Optional[float]:
    if v is None:
        return None
    try:
        return float(v)
    except (ValueError, TypeError):
        return None
