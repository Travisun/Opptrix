"""
pytdx Driver — 通达信协议备选（与 mootdx 互备）

覆盖: 个股行情/K线、大盘指数/K线
优先级: 85（介于 mootdx 90 和 efinance 80 之间）
特点: 通过通达信行情服务器 TCP 直连，不依赖 HTTP
"""

from __future__ import annotations

import logging
from typing import List, Optional

from a_stock_layer.core.schema import (
    Capability, IndexKline, IndexRealtime, StockKline, StockRealtime,
)
from a_stock_layer.drivers.base import BaseDriver

logger = logging.getLogger("a_stock_layer.driver.pytdx")

# 通达信行情服务器列表（多个备选）
TDX_SERVERS = [
    ("119.147.212.81", 7709),   # 华泰深圳
    ("119.147.212.42", 7709),   # 华泰深圳2
    ("112.95.142.222", 7709),   # 华泰上海
    ("115.238.56.78", 7709),    # 招商证券
    ("115.238.90.165", 7709),   # 招商证券2
    ("120.24.0.77", 7709),      # 东方财富
]


def _market_code(code: str) -> tuple:
    """返回 (market, code) market=0深市 1沪市"""
    c = code.strip().zfill(6)
    market = 1 if c.startswith(("6", "9")) else 0
    return (market, c)


class PytdxDriver(BaseDriver):
    """pytdx 驱动 — 通达信协议备选。

    依赖: pip install pytdx
    pytdx 可直连通达信行情服务器获取券商级数据。
    """

    def __init__(self):
        self._api = None
        self._connected = False

    def name(self) -> str:
        return "pytdx"

    def priority(self) -> int:
        return 85  # 介于 mootdx(90) 和 efinance(80) 之间

    def capabilities(self) -> List[Capability]:
        return [
            Capability.STOCK_REALTIME,
            Capability.STOCK_KLINE,
            Capability.INDEX_REALTIME,
            Capability.INDEX_KLINE,
        ]

    def _connect(self) -> bool:
        """连接通达信服务器（优先快的）。"""
        if self._connected and self._api:
            return True
        try:
            from pytdx.hq import TdxHq_API
            for host, port in TDX_SERVERS:
                try:
                    api = TdxHq_API()
                    if api.connect(host, port):
                        self._api = api
                        self._connected = True
                        logger.info("pytdx 已连接 %s:%s", host, port)
                        return True
                except Exception:
                    continue
            logger.warning("pytdx 所有服务器连接失败")
            return False
        except ImportError:
            logger.debug("pytdx 未安装")
            return False

    def _disconnect(self):
        if self._api:
            try:
                self._api.disconnect()
            except Exception:
                pass
            self._api = None
            self._connected = False

    # ── 个股实时行情 ──────────────────────────────────────────────────

    def realtime(self, code: str) -> Optional[List[StockRealtime]]:
        try:
            if not self._connect():
                return None
            mkt, c = _market_code(code)
            data = self._api.get_security_quotes(mkt, [(mkt, c)])
            if not data or len(data) == 0:
                return None
            q = data[0]
            price = getattr(q, "price", 0) or 0
            pre_close = getattr(q, "last_close", 0) or 0
            change = price - pre_close if pre_close else None
            change_pct = (change / pre_close * 100) if (change and pre_close) else None

            return [StockRealtime(
                code=self._norm_code(code),
                name=getattr(q, "code", "") or "",
                price=price,
                open=getattr(q, "open", 0) or 0,
                high=getattr(q, "high", 0) or 0,
                low=getattr(q, "low", 0) or 0,
                pre_close=pre_close,
                volume=getattr(q, "volume", 0) or 0,
                amount=getattr(q, "amount", 0) or 0,
                change=change,
                change_pct=change_pct,
            )]
        except Exception as e:
            logger.debug("pytdx 实时行情失败 [%s]: %s", code, e)
            self._disconnect()
            return None

    # ── 个股K线 ───────────────────────────────────────────────────────

    def kline(self, code: str, period: str = "daily",
              start: str = "", end: str = "") -> Optional[List[StockKline]]:
        try:
            if not self._connect():
                return None
            mkt, c = _market_code(code)

            # 周期映射: 9=日 5=周 6=月 8=60分 3=15分 2=5分 1=1分
            period_map = {
                "daily": 9, "weekly": 5, "monthly": 6,
                "1m": 1, "5m": 2, "15m": 3, "30m": 4, "60m": 8,
            }
            freq = period_map.get(period, 9)

            data = self._api.get_security_bars(freq, mkt, c, 0, 800)
            if not data:
                return None

            results = []
            for item in data:
                date_str = str(getattr(item, "datetime", getattr(item, "date", "")))[:10]
                if start and date_str < start[:10]:
                    continue
                if end and date_str > end[:10]:
                    continue
                results.append(StockKline(
                    code=self._norm_code(code),
                    date=date_str,
                    open=float(getattr(item, "open", 0) or 0),
                    close=float(getattr(item, "close", 0) or 0),
                    high=float(getattr(item, "high", 0) or 0),
                    low=float(getattr(item, "low", 0) or 0),
                    volume=float(getattr(item, "vol", getattr(item, "volume", 0)) or 0),
                    amount=float(getattr(item, "amount", 0) or 0),
                ))
            return results if results else None
        except Exception as e:
            logger.debug("pytdx K线失败 [%s]: %s", code, e)
            self._disconnect()
            return None

    # ── 大盘指数实时 ────────────────────────────────────────────────

    def index_realtime(self, code: str) -> Optional[List[IndexRealtime]]:
        # 指数实时行情与个股相同接口
        try:
            if not self._connect():
                return None
            mkt, c = _market_code(code)
            data = self._api.get_security_quotes(mkt, [(mkt, c)])
            if not data or len(data) == 0:
                return None
            q = data[0]
            price = float(getattr(q, "price", 0) or 0)
            pre_close = float(getattr(q, "last_close", 0) or 0)
            change = price - pre_close if pre_close else None
            change_pct = (change / pre_close * 100) if (change and pre_close) else None

            return [IndexRealtime(
                code=self._norm_code(code),
                name=getattr(q, "code", "") or "",
                price=price,
                open=float(getattr(q, "open", 0) or 0),
                high=float(getattr(q, "high", 0) or 0),
                low=float(getattr(q, "low", 0) or 0),
                pre_close=pre_close,
                change=change,
                change_pct=change_pct,
                volume=float(getattr(q, "volume", 0) or 0),
                amount=float(getattr(q, "amount", 0) or 0),
            )]
        except Exception as e:
            logger.debug("pytdx 指数实时失败 [%s]: %s", code, e)
            self._disconnect()
            return None

    # ── 大盘指数K线 ──────────────────────────────────────────────────

    def index_kline(self, code: str, period: str = "daily",
                    start: str = "", end: str = "") -> Optional[List[IndexKline]]:
        try:
            if not self._connect():
                return None
            mkt, c = _market_code(code)
            period_map = {
                "daily": 9, "weekly": 5, "monthly": 6,
                "1m": 1, "5m": 2, "15m": 3, "30m": 4, "60m": 8,
            }
            freq = period_map.get(period, 9)
            data = self._api.get_index_bars(freq, mkt, c, 0, 800)
            if not data:
                return None

            results = []
            for item in data:
                date_str = str(getattr(item, "datetime", getattr(item, "date", "")))[:10]
                if start and date_str < start[:10]:
                    continue
                if end and date_str > end[:10]:
                    continue
                results.append(IndexKline(
                    code=self._norm_code(code),
                    date=date_str,
                    open=float(getattr(item, "open", 0) or 0),
                    close=float(getattr(item, "close", 0) or 0),
                    high=float(getattr(item, "high", 0) or 0),
                    low=float(getattr(item, "low", 0) or 0),
                    volume=float(getattr(item, "vol", getattr(item, "volume", 0)) or 0),
                    amount=float(getattr(item, "amount", 0) or 0),
                ))
            return results if results else None
        except Exception as e:
            logger.debug("pytdx 指数K线失败 [%s]: %s", code, e)
            self._disconnect()
            return None

    def __del__(self):
        self._disconnect()
