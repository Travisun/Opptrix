"""
雪球（xueqiu.com）HTTP API Driver

覆盖: 个股实时行情、大盘指数、资金流
优先级: 10（兜底）
特点: 有反爬，但数据丰富
"""

from __future__ import annotations

import json
import logging
import time
from typing import List, Optional

import requests
# 代理配置
import os as _os
_PROXIES = None
if _os.environ.get("ASHARE_NO_PROXY", "").strip() in ("1", "true", "yes"):
    _PROXIES = {"http": "", "https": ""}


from a_stock_layer.core.schema import (
    Capability, IndexRealtime, MoneyFlow, StockRealtime,
)
from a_stock_layer.drivers.base import BaseDriver

logger = logging.getLogger("a_stock_layer.driver.xueqiu")

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    "Referer": "https://xueqiu.com/",
    "Accept": "application/json",
}


class XueqiuDriver(BaseDriver):

    def __init__(self):
        self._cookies = {}

    def name(self) -> str:
        return "xueqiu"

    def priority(self) -> int:
        return 10  # 兜底

    def capabilities(self) -> List[Capability]:
        return [
            Capability.STOCK_REALTIME,
            Capability.INDEX_REALTIME,
            Capability.STOCK_MONEY_FLOW,
        ]

    def _get_cookies(self):
        """获取雪球cookie（需要先访问首页）。"""
        if self._cookies:
            return self._cookies
        try:
            sess = requests.Session()
            sess.get("https://xueqiu.com/", headers=HEADERS, timeout=10)
            self._cookies = dict(sess.cookies)
        except Exception as e:
            logger.debug("雪球 cookie 获取失败: %s", e)
        return self._cookies

    def _get(self, url: str, params: dict = None) -> Optional[dict]:
        try:
            cookies = self._get_cookies()
            resp = requests.get(url, params=params,
                headers={**HEADERS, **cookies},
                timeout=10, proxies=_PROXIES)
            resp.encoding = "utf-8"
            data = resp.json()
            return data
        except Exception as e:
            logger.debug("雪球请求失败 [%s]: %s", url, e)
            return None

    def realtime(self, code: str) -> Optional[List[StockRealtime]]:
        try:
            c = code.strip().zfill(6)
            market = "SH" if c.startswith(("6", "9")) else "SZ"
            symbol = f"{market}{c}"

            url = "https://stock.xueqiu.com/v5/stock/quote.json"
            params = {"symbol": symbol, "extend": "detail"}
            data = self._get(url, params)
            if not data:
                return None

            item = data.get("data", {}).get("quote", {})
            if not item:
                return None

            return [StockRealtime(
                code=self._norm_code(code),
                name=item.get("name", "") or "",
                price=item.get("current"),
                open=item.get("open"),
                high=item.get("high"),
                low=item.get("low"),
                pre_close=item.get("last_close"),
                volume=item.get("volume"),
                amount=item.get("amount"),
                change=item.get("change"),
                change_pct=item.get("percent"),
                turnover_rate=item.get("turnover_rate"),
                pe=item.get("pe_ttm"),
                pb=item.get("pb"),
                market_cap=item.get("market_capital"),
                amplitude=item.get("amplitude"),
            )]
        except Exception as e:
            logger.debug("雪球实时行情失败 [%s]: %s", code, e)
            return None

    def index_realtime(self, code: str) -> Optional[List[IndexRealtime]]:
        try:
            c = code.strip().zfill(6)
            market = "SH" if c.startswith(("6", "9")) else "SZ"
            symbol = f"{market}{c}"

            url = "https://stock.xueqiu.com/v5/stock/quote.json"
            params = {"symbol": symbol}
            data = self._get(url, params)
            if not data:
                return None

            item = data.get("data", {}).get("quote", {})
            if not item:
                return None

            return [IndexRealtime(
                code=self._norm_code(code),
                name=item.get("name", "") or "",
                price=item.get("current"),
                open=item.get("open"),
                high=item.get("high"),
                low=item.get("low"),
                pre_close=item.get("last_close"),
                change=item.get("change"),
                change_pct=item.get("percent"),
                volume=item.get("volume"),
                amount=item.get("amount"),
            )]
        except Exception as e:
            logger.debug("雪球指数实时失败 [%s]: %s", code, e)
            return None

    def money_flow(self, code: str) -> Optional[List[MoneyFlow]]:
        try:
            c = code.strip().zfill(6)
            market = "SH" if c.startswith(("6", "9")) else "SZ"
            symbol = f"{market}{c}"

            url = "https://stock.xueqiu.com/v5/stock/finance/cf.json"
            params = {"symbol": symbol, "type": "all", "count": 30}
            data = self._get(url, params)
            if not data:
                return None

            items = data.get("data", {}).get("items", [])
            if not items:
                return None

            results = []
            for item in items:
                results.append(MoneyFlow(
                    code=self._norm_code(code),
                    date=item.get("date", "")[:10],
                    main_net=item.get("main_net_inflow"),
                ))
            return results if results else None
        except Exception as e:
            logger.debug("雪球资金流失败 [%s]: %s", code, e)
            return None
