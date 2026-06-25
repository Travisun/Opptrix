"""
腾讯财经 HTTP API Driver — 简易实时行情

覆盖: 个股实时行情、大盘指数实时
优先级: 50（中等）
特点: 字段丰富、响应快，适合做实时行情的补充/兜底
"""

from __future__ import annotations

import logging
from typing import List, Optional

import requests
# 代理配置
import os as _os
_PROXIES = None
if _os.environ.get("ASHARE_NO_PROXY", "").strip() in ("1", "true", "yes"):
    _PROXIES = {"http": "", "https": ""}


from aaashare.core.schema import (
    Capability, IndexRealtime, StockRealtime, GlobalIndex, ExchangeRate,
)
from aaashare.drivers.base import BaseDriver

logger = logging.getLogger("ashare.driver.tencent")

URL = "https://qt.gtimg.cn/q="
HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
}


def _parse_tencent_response(text: str) -> Optional[dict]:
    """解析腾讯返回文本。

    格式: v_sh600519="1~贵州茅台~...~...";
    """
    if not text:
        return None
    # 找到引号内的内容
    start = text.find('"')
    end = text.rfind('"')
    if start == -1 or end == -1 or start >= end:
        return None
    inner = text[start + 1:end]
    parts = inner.split("~")
    if len(parts) < 48:
        return None
    return {
        "name": parts[1],
        "code": parts[2],
        "price": parts[3],
        "pre_close": parts[4],
        "open": parts[5],
        "volume": parts[6],        # 手
        "amount": parts[37],       # 元
        "buy": parts[9],
        "sell": parts[10],
        "high": parts[33],
        "low": parts[34],
        "change_pct": parts[32],   # 涨跌幅
        "change": parts[31],
        "pe": parts[39],
        "amplitude": parts[43],
        "turnover_rate": parts[38],
        "market_cap": parts[44],   # 总市值
        "pb": parts[46],
    }


class TencentDriver(BaseDriver):

    def name(self) -> str:
        return "tencent"

    def priority(self) -> int:
        return 50

    def capabilities(self) -> List[Capability]:
        return [
            Capability.STOCK_REALTIME,
            Capability.INDEX_REALTIME,
            Capability.GLOBAL_INDEX,
            Capability.EXCHANGE_RATE,
        ]

    def _query(self, codes: List[str]) -> Optional[dict]:
        codes_str = ",".join(codes)
        try:
            resp = requests.get(f"{URL}{codes_str}", headers=HEADERS, timeout=10, proxies=_PROXIES)
            resp.encoding = "gbk"
            return _parse_tencent_response(resp.text)
        except Exception as e:
            logger.debug("腾讯查询失败: %s", e)
            return None

    def realtime(self, code: str) -> Optional[List[StockRealtime]]:
        full_code = self._sec_full_code(code)
        data = self._query([full_code])
        if not data:
            return None

        price = _f(data.get("price"))
        return [StockRealtime(
            code=self._norm_code(code),
            name=data.get("name", "") or "",
            price=price,
            open=_f(data.get("open")),
            high=_f(data.get("high")),
            low=_f(data.get("low")),
            pre_close=_f(data.get("pre_close")),
            volume=_f(data.get("volume")),
            amount=_f(data.get("amount")),
            change=_f(data.get("change")),
            change_pct=_f(data.get("change_pct")),
            turnover_rate=_f(data.get("turnover_rate")),
            pe=_f(data.get("pe")),
            pb=_f(data.get("pb")),
            market_cap=_f(data.get("market_cap")),
            amplitude=_f(data.get("amplitude")),
        )]

    def batch_realtime(self, codes: List[str]) -> Optional[List[StockRealtime]]:
        full_codes = [self._sec_full_code(c) for c in codes]
        try:
            codes_str = ",".join(full_codes)
            resp = requests.get(f"{URL}{codes_str}", headers=HEADERS, timeout=10, proxies=_PROXIES)
            resp.encoding = "gbk"
            results = []
            # 每行一条
            for line in resp.text.strip().split("\n"):
                if not line.strip():
                    continue
                d = _parse_tencent_response(line)
                if d:
                    raw_code = d.get("code", "")
                    results.append(StockRealtime(
                        code=self._norm_code(raw_code),
                        name=d.get("name", "") or "",
                        price=_f(d.get("price")),
                        open=_f(d.get("open")),
                        high=_f(d.get("high")),
                        low=_f(d.get("low")),
                        pre_close=_f(d.get("pre_close")),
                        volume=_f(d.get("volume")),
                        amount=_f(d.get("amount")),
                        change=_f(d.get("change")),
                        change_pct=_f(d.get("change_pct")),
                        turnover_rate=_f(d.get("turnover_rate")),
                        pe=_f(d.get("pe")),
                        pb=_f(d.get("pb")),
                        market_cap=_f(d.get("market_cap")),
                        amplitude=_f(d.get("amplitude")),
                    ))
            return results if results else None
        except Exception as e:
            logger.debug("腾讯批量查询失败: %s", e)
            return None

    def index_realtime(self, code: str) -> Optional[List[IndexRealtime]]:
        full_code = self._sec_full_code(code)
        data = self._query([full_code])
        if not data:
            return None

        return [IndexRealtime(
            code=self._norm_code(code),
            name=data.get("name", "") or "",
            price=_f(data.get("price")),
            open=_f(data.get("open")),
            high=_f(data.get("high")),
            low=_f(data.get("low")),
            pre_close=_f(data.get("pre_close")),
            change=_f(data.get("change")),
            change_pct=_f(data.get("change_pct")),
            volume=_f(data.get("volume")),
            amount=_f(data.get("amount")),
        )]



    # ── 全球指数（创业板/恒指/日经等可通过腾讯获取）───────────

    def global_index(self, code: str = "") -> Optional[List[GlobalIndex]]:
        """通过腾讯API获取全球指数行情。"""
        try:
            from aaashare.core.schema import GlobalIndex
            symbol_map = {
                "dji": "usDJIA", "spx": "usSPX", "ixic": "usIXIC",
                "hsi": "hkHSI", "n225": "jpN225", "ftse": "ukFTSE",
                "dax": "deDAX", "csi300": "sh000300", "sh": "sh000001",
            }
            symbols = [symbol_map.get(code)] if code else list(symbol_map.values())
            # 腾讯不直接支持全球指数批量，用新浪更合适，这里返回None让引擎fallback
            return None
        except Exception as e:
            logger.debug("腾讯全球指数失败: %s", e)
            return None

    def exchange_rate(self, pair: str = "") -> Optional[List[ExchangeRate]]:
        """腾讯汇率查询。"""
        try:
            from aaashare.core.schema import ExchangeRate
            url = "https://qt.gtimg.cn/q="
            fx_map = {
                "USDCNY": "usdcny", "EURCNY": "eurcny",
                "HKDCNY": "hkscny", "JPYCNY": "jpcny",
                "GBPCNY": "kscny",
            }
            targets = [fx_map.get(pair)] if pair else list(fx_map.values())
            codes_str = ",".join(f"fx_s{code}" for code in targets)
            resp = http_get(f"{url}{codes_str}", timeout=10)
            resp.encoding = "gbk"
            results = []
            for line in resp.text.strip().split("\n"):
                if not line.strip():
                    continue
                import re
                m = re.search(r'"(.*)"', line)
                if not m:
                    continue
                parts = m.group(1).split("~")
                if len(parts) < 3:
                    continue
                results.append(ExchangeRate(
                    currency_pair=parts[1] or targets[0].upper(),
                    rate=vfloat(parts[2]),
                    change_pct=vfloat(parts[3]) if len(parts) > 3 else None,
                ))
            return results if results else None
        except Exception as e:
            logger.debug("腾讯汇率失败: %s", e)
            return None

def _f(v) -> Optional[float]:
    """安全转 float。"""
    if v is None:
        return None
    try:
        return float(v)
    except (ValueError, TypeError):
        return None
