"""
国家统计局 Driver — 宏观经济指标

覆盖: GDP、CPI、PPI、PMI、M2、社融、工业增加值等宏观数据
优先级: 20
特点: 官方数据源，完全免费，无频率限制
"""

from __future__ import annotations

import json
import logging
from datetime import datetime
from typing import List, Optional

from a_stock_layer.core.schema import (
    Capability, MacroIndicator,
)
from a_stock_layer.drivers.base import BaseDriver
from a_stock_layer.utils.http_client import get as http_get, get_session

logger = logging.getLogger("a_stock_layer.driver.stats_gov")

# 国家统计局 easyquery API 参数
# ZB_ID: A0E0F=GDP, A010101=CPI, A010201=PPI, A0E01=PMI, A0E02=M2, A0E0D=社融
# 参考: https://data.stats.gov.cn/easyquery.htm
INDICATOR_MAP = {
    "GDP": {"zb": "A0E0F", "cn": "E0103", "name": "国内生产总值(GDP)", "unit": "亿元"},
    "CPI": {"zb": "A010101", "cn": "E0103", "name": "居民消费价格指数(CPI)", "unit": "%"},
    "CPI_YOY": {"zb": "A01010101", "cn": "E0103", "name": "CPI同比", "unit": "%"},
    "PPI": {"zb": "A010201", "cn": "E0103", "name": "工业生产者出厂价格指数(PPI)", "unit": "%"},
    "PPI_YOY": {"zb": "A01020101", "cn": "E0103", "name": "PPI同比", "unit": "%"},
    "PMI": {"zb": "A0E01", "cn": "E0103", "name": "制造业采购经理指数(PMI)", "unit": "%"},
    "M2": {"zb": "A0E02", "cn": "E0103", "name": "货币供应量M2", "unit": "亿元"},
    "M2_YOY": {"zb": "A0E0201", "cn": "E0103", "name": "M2同比增速", "unit": "%"},
    "社融": {"zb": "A0E0D", "cn": "E0103", "name": "社会融资规模增量", "unit": "亿元"},
    "工业增加值": {"zb": "A0E0C", "cn": "E0103", "name": "规模以上工业增加值同比", "unit": "%"},
    "固定资产投资": {"zb": "A0E0B", "cn": "E0103", "name": "固定资产投资累计同比", "unit": "%"},
    "社会消费品零售": {"zb": "A0E0E", "cn": "E0103", "name": "社会消费品零售总额同比", "unit": "%"},
    "出口": {"zb": "A0E0F01", "cn": "E0103", "name": "出口总额同比", "unit": "%"},
    "进口": {"zb": "A0E0F02", "cn": "E0103", "name": "进口总额同比", "unit": "%"},
    "外汇储备": {"zb": "A0E0G", "cn": "E0103", "name": "国家外汇储备", "unit": "亿美元"},
    "LPR1Y": {"zb": "A0E0H01", "cn": "E0103", "name": "LPR(1年期)", "unit": "%"},
    "LPR5Y": {"zb": "A0E0H02", "cn": "E0103", "name": "LPR(5年期)", "unit": "%"},
}

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
    "Referer": "https://data.stats.gov.cn/",
    "Accept": "application/json, text/javascript, */*; q=0.01",
}


class StatsGovDriver(BaseDriver):
    """国家统计局宏观经济数据驱动"""

    def name(self) -> str:
        return "stats_gov"

    def priority(self) -> int:
        return 20

    def capabilities(self) -> List[Capability]:
        return [
            Capability.MACRO_INDICATOR,
        ]

    def _fetch_indicator(self, indicator_key: str) -> Optional[List[MacroIndicator]]:
        """从国家统计局API获取一个指标的数据。"""
        try:
            info = INDICATOR_MAP.get(indicator_key)
            if not info:
                return None

            url = "https://data.stats.gov.cn/easyquery.htm"
            params = {
                "m": "QueryData",
                "dbcode": info["cn"],
                "rowcode": "zb",
                "colcode": "sj",
                "wds": "[]",
                "dfwds": f'[{{"wdcode":"zb","valuecode":"{info["zb"]}"}}]',
            }

            session = get_session()
            resp = session.get(url, params=params, headers=HEADERS, timeout=10)
            if resp.status_code != 200:
                return None

            data = resp.json()
            node_list = data.get("returndata", {}).get("datanodes", []) or []
            if not node_list:
                return None

            # 提取指标时间序列
            results = []
            for node in node_list:
                wds = node.get("wds", [])
                date_code = ""
                for w in wds:
                    if w.get("wdcode") == "sj":
                        date_code = w.get("valuecode", "")
                value = node.get("data", {}).get("data", node.get("value"))
                if value is None or value == "":
                    continue

                # 日期转换: 202412 -> 2024-12
                date_str = date_code
                if len(date_code) == 6:
                    date_str = f"{date_code[:4]}-{date_code[4:]}"
                elif len(date_code) == 4:
                    date_str = date_code

                try:
                    val = float(value)
                except (ValueError, TypeError):
                    continue

                results.append(MacroIndicator(
                    indicator_name=info["name"],
                    date=date_str,
                    value=val,
                    unit=info["unit"],
                    source="国家统计局",
                ))

            return results if results else None
        except Exception as e:
            logger.debug("国家统计局数据获取失败 [%s]: %s", indicator_key, e)
            return None

    def macro_indicator(self, indicator: str = "") -> Optional[List[MacroIndicator]]:
        """查询宏观经济指标。

        Args:
            indicator: GDP/CPI/PPI/PMI/M2/社融/... 留空取全部
        """
        results = []
        if indicator and indicator.upper() in INDICATOR_MAP:
            keys = [indicator.upper()]
        else:
            keys = ["GDP", "CPI", "PPI", "PMI", "M2", "社融", "工业增加值"]

        for key in keys:
            try:
                data = self._fetch_indicator(key)
                if data:
                    results.extend(data)
            except Exception:
                continue

        return results if results else None
