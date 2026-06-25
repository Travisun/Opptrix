"""
mootdx Driver — 通达信协议数据源

覆盖: 个股行情/K线、大盘指数、板块数据
优先级: 90（高，券商级数据源）
特点: 通过通达信行情服务器直接获取数据，质量高
"""

from __future__ import annotations

import logging
from typing import List, Optional

from a_stock_layer.core.schema import (
    Capability, IndexKline, IndexRealtime, StockKline, StockRealtime,
)
from a_stock_layer.drivers.base import BaseDriver

logger = logging.getLogger("a_stock_layer.driver.mootdx")


class MootdxDriver(BaseDriver):
    """mootdx 驱动 — 通过通达信协议获取数据。

    依赖: pip install mootdx
    mootdx 可用的行情服务器有: 华泰、招商、东方等券商行情源。
    """

    def __init__(self):
        self._client = None
        self._quote = None

    def name(self) -> str:
        return "mootdx"

    def priority(self) -> int:
        return 90

    def capabilities(self) -> List[Capability]:
        return [
            Capability.STOCK_REALTIME,
            Capability.STOCK_KLINE,
            Capability.INDEX_REALTIME,
            Capability.INDEX_KLINE,
        ]

    def _ensure_client(self):
        """延迟初始化 mootdx 客户端。"""
        if self._client is not None:
            return
        try:
            from mootdx.affirm import Affirm
            from mootdx.quotes import Quotes
            # 使用标准行情服务器
            self._client = Quotes.factory(market="std")
            # 获取交易日历等辅助信息
            self._affirm = Affirm
            logger.info("mootdx 客户端初始化成功")
        except ImportError:
            logger.debug("mootdx 未安装，忽略此driver")
            raise
        except Exception as e:
            logger.warning("mootdx 初始化失败: %s", e)
            raise

    def realtime(self, code: str) -> Optional[List[StockRealtime]]:
        try:
            self._ensure_client()
            c = code.strip().zfill(6)
            market = 1 if c.startswith(("6", "9")) else 0
            quotes = self._client.quotes(market, [c])
            if quotes is None or len(quotes) == 0:
                return None
            q = quotes[0]
            return [StockRealtime(
                code=self._norm_code(code),
                name=q.get("name", ""),
                price=_safe(q, "price"),
                open=_safe(q, "open"),
                high=_safe(q, "high"),
                low=_safe(q, "low"),
                pre_close=_safe(q, "last_close"),
                volume=_safe(q, "volume"),
                amount=_safe(q, "amount"),
                change=_safe(q, "price") - _safe(q, "last_close")
                if _safe(q, "price") is not None and _safe(q, "last_close") is not None
                else None,
            )]
        except Exception as e:
            logger.debug("mootdx 实时行情失败 [%s]: %s", code, e)
            return None

    def kline(self, code: str, period: str = "daily",
              start: str = "", end: str = "") -> Optional[List[StockKline]]:
        try:
            self._ensure_client()
            c = code.strip().zfill(6)
            market = 1 if c.startswith(("6", "9")) else 0

            # 周期映射
            period_map = {
                "daily": 9,
                "weekly": 5,
                "monthly": 6,
                "1m": 1,
                "5m": 2,
                "15m": 3,
                "30m": 4,
                "60m": 8,
            }
            freq = period_map.get(period, 9)

            df = self._client.bars(symbol=c, frequency=freq, market=market)
            if df is None or df.empty:
                return None

            results = []
            for _, row in df.iterrows():
                date_str = str(row.get("date", ""))[:10]
                results.append(StockKline(
                    code=self._norm_code(code),
                    date=date_str,
                    open=float(row.get("open", 0)),
                    close=float(row.get("close", 0)),
                    high=float(row.get("high", 0)),
                    low=float(row.get("low", 0)),
                    volume=float(row.get("volume", 0)),
                    amount=float(row.get("amount", 0)),
                ))
            return results if results else None
        except Exception as e:
            logger.debug("mootdx K线失败 [%s]: %s", code, e)
            return None

    def index_realtime(self, code: str) -> Optional[List[IndexRealtime]]:
        # mootdx 的 quotes 主要针对个股，指数实时不做主推
        return None

    def index_kline(self, code: str, period: str = "daily",
                    start: str = "", end: str = "") -> Optional[List[IndexKline]]:
        # mootdx 的 bars 也可以获取指数K线
        try:
            self._ensure_client()
            c = code.strip().zfill(6)
            market = 1 if c.startswith(("6", "9")) else 0
            period_map = {"daily": 9, "weekly": 5, "monthly": 6}
            freq = period_map.get(period, 9)

            df = self._client.bars(symbol=c, frequency=freq, market=market)
            if df is None or df.empty:
                return None

            results = []
            for _, row in df.iterrows():
                date_str = str(row.get("date", ""))[:10]
                results.append(IndexKline(
                    code=self._norm_code(code),
                    date=date_str,
                    open=float(row.get("open", 0)),
                    close=float(row.get("close", 0)),
                    high=float(row.get("high", 0)),
                    low=float(row.get("low", 0)),
                    volume=float(row.get("volume", 0)),
                    amount=float(row.get("amount", 0)),
                ))
            return results if results else None
        except Exception as e:
            logger.debug("mootdx 指数K线失败 [%s]: %s", code, e)
            return None


def _safe(d: dict, key: str) -> Optional[float]:
    """从 dict 安全取数值。"""
    v = d.get(key)
    if v is None:
        return None
    try:
        return float(v)
    except (ValueError, TypeError):
        return None
