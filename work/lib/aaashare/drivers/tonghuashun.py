"""
同花顺（10jqka）HTTP API Driver

覆盖: 个股实时行情、大盘指数实时
优先级: 30
特点: 可作为东方财富的辅助/备选
"""

from __future__ import annotations

import json
import logging
import re
from typing import List, Optional

import requests
# 代理配置
import os as _os
_PROXIES = None
if _os.environ.get("ASHARE_NO_PROXY", "").strip() in ("1", "true", "yes"):
    _PROXIES = {"http": "", "https": ""}


from aaashare.core.schema import (
    Capability, IndexRealtime, StockRealtime,
)
from aaashare.drivers.base import BaseDriver

logger = logging.getLogger("ashare.driver.tonghuashun")

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
    "Referer": "https://www.10jqka.com.cn/",
}


class TonghuashunDriver(BaseDriver):

    def name(self) -> str:
        return "tonghuashun"

    def priority(self) -> int:
        return 30

    def capabilities(self) -> List[Capability]:
        return [
            Capability.STOCK_REALTIME,
            Capability.INDEX_REALTIME,
        ]

    def _get_realtime(self, code: str) -> Optional[dict]:
        """通过同花顺实时行情接口获取。"""
        try:
            c = code.strip().zfill(6)
            # 同花顺实时行情接口
            url = f"https://d.10jqka.com.cn/v2/realhead/hs_{c}/last.js"
            resp = requests.get(url, headers=HEADERS, timeout=10, proxies=_PROXIES)
            resp.encoding = "utf-8"
            text = resp.text
            # 提取 JSON: last({"code":"...", ...});
            match = re.search(r'last\((\{.+?\})\);?\s*$', text, re.DOTALL)
            if not match:
                return None
            data = json.loads(match.group(1))
            return data.get("data", {})
        except Exception as e:
            logger.debug("同花顺查询失败 [%s]: %s", code, e)
            return None

    def realtime(self, code: str) -> Optional[List[StockRealtime]]:
        data = self._get_realtime(code)
        if not data:
            return None

        items = data.get("items", [])
        if not items:
            return None
        item = items[0]

        return [StockRealtime(
            code=self._norm_code(code),
            name=item.get("name", "") or "",
            price=_v(item.get("price")),
            open=_v(item.get("open")),
            high=_v(item.get("high")),
            low=_v(item.get("low")),
            pre_close=_v(item.get("last_close")),
            volume=_v(item.get("volume")),
            amount=_v(item.get("amount")),
            change_pct=_v(item.get("change_pct")),
            change=_v(item.get("change")),
            turnover_rate=_v(item.get("turnover_rate")),
            pe=_v(item.get("pe")),
            market_cap=_v(item.get("total_market_cap")),
            amplitude=_v(item.get("amplitude")),
        )]

    def index_realtime(self, code: str) -> Optional[List[IndexRealtime]]:
        data = self._get_realtime(code)
        if not data:
            return None

        items = data.get("items", [])
        if not items:
            return None
        item = items[0]

        return [IndexRealtime(
            code=self._norm_code(code),
            name=item.get("name", "") or "",
            price=_v(item.get("price")),
            open=_v(item.get("open")),
            high=_v(item.get("high")),
            low=_v(item.get("low")),
            pre_close=_v(item.get("last_close")),
            change=_v(item.get("change")),
            change_pct=_v(item.get("change_pct")),
            volume=_v(item.get("volume")),
            amount=_v(item.get("amount")),
        )]


def _v(v) -> Optional[float]:
    if v is None:
        return None
    try:
        return float(v)
    except (ValueError, TypeError):
        return None
