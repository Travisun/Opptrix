"""
网易财经 HTTP API Driver — 历史K线数据

覆盖: 个股历史K线、大盘历史K线
优先级: 20
特点: CSV 直接下载，数据稳定
"""

from __future__ import annotations

import csv
import io
import logging
from typing import List, Optional

import requests
# 代理配置
import os as _os
_PROXIES = None
if _os.environ.get("ASHARE_NO_PROXY", "").strip() in ("1", "true", "yes"):
    _PROXIES = {"http": "", "https": ""}


from aaashare.core.schema import (
    Capability, IndexKline, StockKline,
)
from aaashare.drivers.base import BaseDriver

logger = logging.getLogger("ashare.driver.netease")

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
    "Referer": "https://money.163.com/",
}

# 网易代码规则：上交所加 0，深交所加 1
def _netease_code(code: str) -> str:
    c = code.strip().zfill(6)
    prefix = "0" if c.startswith(("6", "9")) else "1"
    return f"{prefix}{c}"


class NeteaseDriver(BaseDriver):

    def name(self) -> str:
        return "netease"

    def priority(self) -> int:
        return 20

    def capabilities(self) -> List[Capability]:
        return [
            Capability.STOCK_KLINE,
            Capability.INDEX_KLINE,
        ]

    def kline(self, code: str, period: str = "daily",
              start: str = "", end: str = "") -> Optional[List[StockKline]]:
        if period != "daily":
            return None  # 网易仅支持日K

        try:
            nc = _netease_code(code)
            params = {"code": nc}
            if start:
                params["start"] = start.replace("-", "")
            if end:
                params["end"] = end.replace("-", "")

            url = "https://quotes.money.163.com/service/chddata.html"
            resp = requests.get(url, params=params, headers=HEADERS, timeout=15, proxies=_PROXIES)
            resp.encoding = "gbk"

            content = resp.text
            if "日期" not in content and "日 期" not in content:
                return None

            reader = csv.DictReader(io.StringIO(content))
            results = []
            for row in reader:
                try:
                    close = float(row.get("收盘价", 0) or 0)
                    if close <= 0:
                        continue
                    results.append(StockKline(
                        code=self._norm_code(code),
                        date=str(row.get("日期", ""))[:10],
                        open=float(row.get("开盘价", 0) or 0),
                        close=close,
                        high=float(row.get("最高价", 0) or 0),
                        low=float(row.get("最低价", 0) or 0),
                        volume=float(row.get("成交量", 0) or 0),
                        amount=float(row.get("成交金额", 0) or 0),
                        change_pct=float(row.get("涨跌幅", 0) or 0) if row.get("涨跌幅") else None,
                    ))
                except (ValueError, TypeError):
                    continue
            return results if results else None
        except Exception as e:
            logger.debug("网易K线失败 [%s]: %s", code, e)
            return None

    def index_kline(self, code: str, period: str = "daily",
                    start: str = "", end: str = "") -> Optional[List[IndexKline]]:
        if period != "daily":
            return None
        try:
            nc = _netease_code(code)
            params = {"code": nc}
            if start:
                params["start"] = start.replace("-", "")
            if end:
                params["end"] = end.replace("-", "")

            url = "https://quotes.money.163.com/service/chddata.html"
            resp = requests.get(url, params=params, headers=HEADERS, timeout=15, proxies=_PROXIES)
            resp.encoding = "gbk"

            reader = csv.DictReader(io.StringIO(resp.text))
            results = []
            for row in reader:
                try:
                    results.append(IndexKline(
                        code=self._norm_code(code),
                        date=str(row.get("日期", ""))[:10],
                        open=float(row.get("开盘价", 0) or 0),
                        close=float(row.get("收盘价", 0) or 0),
                        high=float(row.get("最高价", 0) or 0),
                        low=float(row.get("最低价", 0) or 0),
                        volume=float(row.get("成交量", 0) or 0),
                        amount=float(row.get("成交金额", 0) or 0),
                        change_pct=float(row.get("涨跌幅", 0) or 0) if row.get("涨跌幅") else None,
                    ))
                except (ValueError, TypeError):
                    continue
            return results if results else None
        except Exception as e:
            logger.debug("网易指数K线失败 [%s]: %s", code, e)
            return None
