"""
新浪财经 HTTP API Driver — 简易实时行情

覆盖: 个股实时行情、大盘指数实时
优先级: 40
特点: 最简单的免费实时行情源
"""

from __future__ import annotations

import logging
import re
from typing import List, Optional

import requests
# 代理配置
import os as _os
_PROXIES = None
if _os.environ.get("ASHARE_NO_PROXY", "").strip() in ("1", "true", "yes"):
    _PROXIES = {"http": "", "https": ""}


from a_stock_layer.core.schema import (
    Capability, IndexRealtime, StockRealtime, GlobalIndex, ExchangeRate,
)
from a_stock_layer.drivers.base import BaseDriver

logger = logging.getLogger("a_stock_layer.driver.sina")

URL = "https://hq.sinajs.cn/list="
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
    "Referer": "https://finance.sina.com.cn",
}


def _parse_sina_line(line: str) -> Optional[dict]:
    """解析新浪返回行。

    格式: var hq_str_sh600519="贵州茅台,2628.00,2628.00,...";
    """
    if not line or not line.strip():
        return None
    match = re.search(r'hq_str_([a-z]+(\d+))="(.+)"', line)
    if not match:
        return None
    full_code = match.group(1)
    values = match.group(3).split(",")
    if len(values) < 32:
        return None
    return {
        "name": values[0],
        "open": values[1],
        "pre_close": values[2],
        "price": values[3],
        "high": values[4],
        "low": values[5],
        "buy": values[6],
        "sell": values[7],
        "volume": values[8],   # 手
        "amount": values[9],   # 元
        "date": values[30],
        "time": values[31],
    }


class SinaDriver(BaseDriver):

    def name(self) -> str:
        return "sina"

    def priority(self) -> int:
        return 40

    def capabilities(self) -> List[Capability]:
        return [
            Capability.STOCK_REALTIME,
            Capability.INDEX_REALTIME,
            Capability.GLOBAL_INDEX,
            Capability.EXCHANGE_RATE,
        ]

    def _query(self, codes: List[str]) -> Optional[List[dict]]:
        try:
            codes_str = ",".join(codes)
            resp = requests.get(f"{URL}{codes_str}", headers=HEADERS, timeout=10, proxies=_PROXIES)
            resp.encoding = "gbk"
            results = []
            for line in resp.text.strip().split("\n"):
                d = _parse_sina_line(line)
                if d:
                    results.append(d)
            return results if results else None
        except Exception as e:
            logger.debug("新浪查询失败: %s", e)
            return None

    def realtime(self, code: str) -> Optional[List[StockRealtime]]:
        full_code = self._sec_full_code(code)
        data_list = self._query([full_code])
        if not data_list:
            return None

        data = data_list[0]
        return [StockRealtime(
            code=self._norm_code(code),
            name=data.get("name", "") or "",
            price=_f(data.get("price")),
            open=_f(data.get("open")),
            high=_f(data.get("high")),
            low=_f(data.get("low")),
            pre_close=_f(data.get("pre_close")),
            volume=_f(data.get("volume")),
            amount=_f(data.get("amount")),
        )]

    def batch_realtime(self, codes: List[str]) -> Optional[List[StockRealtime]]:
        full_codes = [self._sec_full_code(c) for c in codes]
        data_list = self._query(full_codes)
        if not data_list:
            return None

        results = []
        for data in data_list:
            results.append(StockRealtime(
                code=self._norm_code(data.get("code", "")),
                name=data.get("name", "") or "",
                price=_f(data.get("price")),
                open=_f(data.get("open")),
                high=_f(data.get("high")),
                low=_f(data.get("low")),
                pre_close=_f(data.get("pre_close")),
                volume=_f(data.get("volume")),
                amount=_f(data.get("amount")),
            ))
        return results if results else None

    def index_realtime(self, code: str) -> Optional[List[IndexRealtime]]:
        full_code = self._sec_full_code(code)
        data_list = self._query([full_code])
        if not data_list:
            return None

        data = data_list[0]
        price = _f(data.get("price"))
        pre_close = _f(data.get("pre_close"))
        change = price - pre_close if (price is not None and pre_close is not None) else None
        change_pct = (change / pre_close * 100) if (change is not None and pre_close and pre_close != 0) else None

        return [IndexRealtime(
            code=self._norm_code(code),
            name=data.get("name", "") or "",
            price=price,
            open=_f(data.get("open")),
            high=_f(data.get("high")),
            low=_f(data.get("low")),
            pre_close=pre_close,
            change=change,
            change_pct=change_pct,
            volume=_f(data.get("volume")),
            amount=_f(data.get("amount")),
        )]



    # ── 全球指数 ──────────────────────────────────────────────────

    def global_index(self, code: str = "") -> Optional[List[GlobalIndex]]:
        """通过新浪获取全球指数（新浪数据最全）。"""
        try:
            from a_stock_layer.core.schema import GlobalIndex
            symbol_map = {
                "dji": "gb_dji", "spx": "gb_spx", "ixic": "gb_ixic",
                "hsi": "hk_hsi", "n225": "b_153000",
                "ftse": "gb_fc1", "dax": "gb_dax",
                "csi300": "sh000300", "sh": "sh000001",
                "sz": "sz399001", "cyb": "sz399006",
            }
            targets = [symbol_map.get(code)] if code else list(symbol_map.values())
            codes_str = ",".join(targets)
            resp = http_get(f"https://hq.sinajs.cn/list={codes_str}", timeout=10)
            resp.encoding = "gbk"
            results = []
            for line in resp.text.strip().split("\n"):
                if not line.strip():
                    continue
                import re
                m = re.search(r'(?:hq_str_|var hq_str_)(\w+)=["\u0022](.+)["\u0022]', line)
                if not m:
                    continue
                full_code = m.group(1)
                values = m.group(2).split(",")
                if len(values) < 5:
                    continue
                results.append(GlobalIndex(
                    code=full_code,
                    name=values[0] if values[0] else full_code,
                    market="US" if "gb_" in full_code else "HK" if "hk_" in full_code else "JP" if "153000" in full_code else "CN",
                    price=vfloat(values[1]) if len(values) > 1 else None,
                    change_pct=vfloat(values[3]) if len(values) > 3 else None,
                ))
            return results if results else None
        except Exception as e:
            logger.debug("新浪全球指数失败: %s", e)
            return None

    def exchange_rate(self, pair: str = "") -> Optional[List[ExchangeRate]]:
        """通过新浪获取汇率。"""
        try:
            from a_stock_layer.core.schema import ExchangeRate
            fx_map = {
                "USDCNY": "fx_susdcny", "EURCNY": "fx_seurcny",
                "HKDCNY": "fx_shkscny", "JPYCNY": "fx_sjpcny",
                "GBPCNY": "fx_skscny", "AUDCNY": "fx_saudcny",
            }
            targets = [fx_map.get(pair)] if pair else list(fx_map.values())
            codes_str = ",".join(targets)
            resp = http_get(f"https://hq.sinajs.cn/list={codes_str}", timeout=10)
            resp.encoding = "gbk"
            results = []
            for line in resp.text.strip().split("\n"):
                if not line.strip():
                    continue
                import re
                m = re.search(r'"(.*)"', line)
                if not m:
                    continue
                parts = m.group(1).split(",")
                if len(parts) < 2:
                    continue
                results.append(ExchangeRate(
                    currency_pair=parts[0] if parts[0] else targets[0].replace("fx_s", "").upper(),
                    rate=vfloat(parts[1]),
                    change_pct=vfloat(parts[2]) if len(parts) > 2 else None,
                ))
            return results if results else None
        except Exception as e:
            logger.debug("新浪汇率失败: %s", e)
            return None

def _f(v) -> Optional[float]:
    if v is None:
        return None
    try:
        return float(v)
    except (ValueError, TypeError):
        return None
