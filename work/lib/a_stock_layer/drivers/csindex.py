"""
中证指数公司 Driver — 指数成分股、权重数据

覆盖: 中证/上证/深证旗下各指数的成分股列表、权重
优先级: 30
特点: 官方指数公司，成分股数据最权威
"""

from __future__ import annotations

import json
import logging
from typing import List, Optional

from a_stock_layer.core.schema import (
    Capability, IndexConstituent,
)
from a_stock_layer.drivers.base import BaseDriver
from a_stock_layer.utils.http_client import get as http_get

logger = logging.getLogger("a_stock_layer.driver.csindex")

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    "Referer": "https://www.csindex.com.cn/",
    "Accept": "application/json",
}

# 常用指数代码映射
INDEX_MAP = {
    "000300": "沪深300",
    "000001": "上证指数",
    "000016": "上证50",
    "000688": "科创50",
    "000905": "中证500",
    "000906": "中证800",
    "000852": "中证1000",
    "000932": "中证消费",
    "000963": "中证医疗",
    "000922": "中证红利",
    "399001": "深证成指",
    "399006": "创业板指",
    "399300": "沪深300(深圳)",
    "399330": "深证100",
    "399005": "中小板指",
}


class CsindexDriver(BaseDriver):
    """中证指数公司驱动"""

    def name(self) -> str:
        return "csindex"

    def priority(self) -> int:
        return 30

    def capabilities(self) -> List[Capability]:
        return [
            Capability.INDEX_CONST,
        ]

    def index_constituents(self, index_code: str) -> Optional[List[IndexConstituent]]:
        """查询指数成分股。

        从中证指数官网获取指定指数的成分股列表和权重。

        Args:
            index_code: 指数代码，如 "000300"(沪深300) / "000016"(上证50)
        """
        try:
            c = index_code.strip().zfill(6)
            index_name = INDEX_MAP.get(c, c)

            # 中证指数官网API
            url = "https://www.csindex.com.cn/csindex-home/index-info/queryIndexWeight"
            params = {
                "indexCode": c,
                "lang": "zh",
                "pageSize": 200,  # 最多200条
                "pageNum": 1,
            }
            resp = http_get(url + "?indexCode=" + c, headers=HEADERS, timeout=10)

            # 尝试带参数
            url2 = f"https://www.csindex.com.cn/csindex-home/index-info/queryIndexWeight?indexCode={c}&pageSize=200&pageNum=1&lang=zh"
            resp2 = http_get(url2, headers=HEADERS, timeout=10)

            # 解析响应
            data = None
            for resp in [resp2]:
                if resp.status_code == 200:
                    try:
                        data = resp.json()
                        if data:
                            break
                    except Exception:
                        continue

            if not data:
                # 尝试另一个API
                url3 = f"https://www.csindex.com.cn/zh/search/stock?code={c}"
                resp3 = http_get(url3, headers=HEADERS, timeout=10)
                if resp3.status_code == 200:
                    try:
                        data = resp3.json()
                    except Exception:
                        pass

            if not data:
                # 尝试从东方财富获取成分股作为fallback
                return self._fallback_from_eastmoney(c, index_name)

            # 解析成分股列表
            items = []
            # 尝试不同的数据路径
            for path in ["result", "data", "list", "items", "stockList", "stockInfos"]:
                items = data.get(path, data.get("data", {}).get(path, [])) if isinstance(data, dict) else []
                if isinstance(items, list) and len(items) > 0:
                    break

            if not items or not isinstance(items, list):
                return self._fallback_from_eastmoney(c, index_name)

            results = []
            for item in items:
                stock_code = (item.get("stockCode", item.get("code", item.get("stock_code", ""))))
                stock_name = item.get("stockName", item.get("name", item.get("stock_name", "")))
                weight = item.get("weight", item.get("indexWeight", item.get("weightRatio")))
                industry = item.get("industry", item.get("industryName", item.get("industryCode", "")))
                if not stock_code:
                    continue

                results.append(IndexConstituent(
                    index_code=c,
                    index_name=index_name,
                    stock_code=str(stock_code).strip().zfill(6),
                    stock_name=stock_name or "",
                    weight=float(weight) if weight else None,
                    industry=industry or "",
                ))

            if results:
                return results

            return self._fallback_from_eastmoney(c, index_name)

        except Exception as e:
            logger.debug("中证指数成分股失败 [%s]: %s", index_code, e)
            return None

    def _fallback_from_eastmoney(self, index_code: str, index_name: str) -> Optional[List[IndexConstituent]]:
        """fallback: 从东方财富获取指数成分股。"""
        try:
            from a_stock_layer.utils.http_client import get as http_get
            from a_stock_layer.utils.helpers import resolve_secid

            sid = resolve_secid(index_code)
            if not sid:
                return None

            url = "https://push2.eastmoney.com/api/qt/clist/get"
            params = {
                "pn": "1", "pz": "500",
                "po": "1", "np": "1",
                "fields": "f12,f14,f3,f100",
                "fltt": "2", "invt": "2",
                "fs": f"b:{sid.replace('.', '')}",
            }
            resp = http_get(url, params=params, headers={
                "User-Agent": "Mozilla/5.0",
                "Referer": "https://quote.eastmoney.com/",
            }, timeout=10)

            if resp.status_code != 200:
                return None

            data = resp.json()
            items = data.get("data", {}).get("diff", []) if data.get("data") else data.get("diff", [])
            if not items:
                return None

            results = []
            for item in items:
                stock_code = item.get("f12", "")
                if not stock_code:
                    continue
                results.append(IndexConstituent(
                    index_code=index_code,
                    index_name=index_name,
                    stock_code=str(stock_code).zfill(6),
                    stock_name=item.get("f14", ""),
                    weight=item.get("f3"),
                    industry="",
                ))
            return results if results else None
        except Exception as e:
            logger.debug("东财成分股fallback失败 [%s]: %s", index_code, e)
            return None
