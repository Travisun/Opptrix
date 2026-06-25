"""
东方财富（EastMoney）HTTP API Driver — 主数据源

覆盖: 个股行情/K线/资金流、大盘指数、北向资金、行业资金流
优先级: 100（最高）
"""

from __future__ import annotations

import json
import logging
import re
import time
from datetime import datetime
from typing import List, Optional

import requests

from a_stock_layer.utils.helpers import (
    normalize_change_pct, normalize_price, resolve_secid,
)
from a_stock_layer.utils.http_client import get as http_get

from a_stock_layer.core.schema import (
    Capability, IndexKline, IndexRealtime, MarketMoneyFlow,
    MoneyFlow, SectorMoneyFlow, StockKline, StockRealtime,
    StockProfile, ShareholderData, ShareholderItem,
    FinancialSummary, NewsItem, SentimentData,
    MainBusinessData, TopCustomerSupplier,
    ActualController, SubsidiaryData, SubsidiaryItem,
    RelatedPartyTrade, RDInvestment, MAEvent,
    EmployeeComposition, InstitutionalVisit, PeerCompany,
    BusinessLineItem, CustomerSupplierItem,
)
from a_stock_layer.drivers.base import BaseDriver

logger = logging.getLogger("a_stock_layer.driver.eastmoney")

# ── 常量 ──────────────────────────────────────────────────────────────

BASE_URL = "https://push2.eastmoney.com/api/qt/stock/get"
KLINE_URL = "https://push2his.eastmoney.com/api/qt/stock/kline/get"
FLOW_URL = "https://push2.eastmoney.com/api/qt/stock/fflow/day/get"
INDEX_FLOW_URL = "https://push2.eastmoney.com/api/qt/stock/fflow/kline/get"
SECTOR_FLOW_URL = "https://push2.eastmoney.com/api/qt/sector/fflow/get"

PERIOD_MAP = {
    "daily":   "101",
    "weekly":  "102",
    "monthly": "103",
    "1m":      "1",
    "5m":      "5",
    "15m":     "15",
    "30m":     "30",
    "60m":     "60",
}

HEADERS = {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)",
    "Referer": "https://quote.eastmoney.com/",
}

# 代理配置: 设置 ASHARE_NO_PROXY=1 可绕过系统代理直连
import os as _os
_PROXIES = None
if _os.environ.get("ASHARE_NO_PROXY", "").strip() in ("1", "true", "yes"):
    _PROXIES = {"http": "", "https": ""}


def _secid(code: str) -> str:
    """转东方财富 secid 格式（使用 helpers 解析指数代码）。"""
    return resolve_secid(code)


def _parse_kline_klines(kline_str: str, code: str) -> List[StockKline]:
    """解析K线返回的 klines 字段。"""
    # 格式: "日期,开盘,收盘,最高,最低,成交量,成交额,振幅,涨跌幅,涨跌额,换手率"
    results = []
    if not kline_str:
        return results
    for line in kline_str.split(";"):
        parts = line.split(",")
        if len(parts) < 7:
            continue
        try:
            results.append(StockKline(
                code=code,
                date=parts[0],
                open=float(parts[1]),
                close=float(parts[2]),
                high=float(parts[3]),
                low=float(parts[4]),
                volume=float(parts[5]),
                amount=float(parts[6]),
                change_pct=float(parts[8]) if len(parts) > 8 else None,
                turnover_rate=float(parts[10]) if len(parts) > 10 else None,
            ))
        except (ValueError, IndexError):
            continue
    return results


class EastMoneyDriver(BaseDriver):

    def name(self) -> str:
        return "eastmoney"

    def priority(self) -> int:
        return 100  # 最高优先级

    def capabilities(self) -> List[Capability]:
        return [
            Capability.STOCK_REALTIME,
            Capability.STOCK_KLINE,
            Capability.STOCK_MONEY_FLOW,
            Capability.INDEX_REALTIME,
            Capability.INDEX_KLINE,
            Capability.MARKET_MONEY_FLOW,
            Capability.SECTOR_MONEY_FLOW,
            Capability.STOCK_PROFILE,
            Capability.SHAREHOLDER,
            Capability.FINANCIAL_SUMMARY,
            Capability.NEWS,
            Capability.SENTIMENT,
            Capability.DRAGON_TIGER,
            Capability.MARGIN_TRADE,
            Capability.DIVIDEND,
            Capability.BALANCE_SHEET,
            Capability.INCOME_STMT,
            Capability.CASH_FLOW,
            Capability.INST_HOLDING,
            Capability.BLOCK_TRADE,
            Capability.LOCKUP_EXPIRY,
            Capability.SHARE_PLEDGE,
            Capability.INTRADAY_TICK,
            Capability.STOCK_LIST,
            Capability.INDEX_CONST,
            Capability.INSIDER_TRADE,
            Capability.PERF_FORECAST,
            Capability.TRADE_CALENDAR,
            Capability.LIMIT_UPDOWN,
            Capability.MARKET_BREADTH,
            Capability.IPO_DATA,
            Capability.CONVERTIBLE_BOND,
            Capability.ETF_DATA,
            Capability.MANAGER_INFO,
            Capability.SHAREHOLDER_PLAN,
            Capability.BUYBACK,
            Capability.GLOBAL_INDEX,
            Capability.EXCHANGE_RATE,
            Capability.MACRO_INDICATOR,
            Capability.MAIN_BUSINESS,
            Capability.TOP_CUSTOMER,
            Capability.TOP_SUPPLIER,
            Capability.ACTUAL_CONTROLLER,
            Capability.SUBSIDIARY,
            Capability.RELATED_PARTY,
            Capability.RD_INVESTMENT,
            Capability.MERGER_ACQUISITION,
            Capability.EMPLOYEE_COMP,
            Capability.INSTITUTIONAL_VISIT,
            Capability.PEER_COMPANY,        ]

    # ── HTTP 请求 ─────────────────────────────────────────────────────

    def _get(self, url: str, params: dict, timeout: int = 15) -> Optional[dict]:
        try:
            resp = http_get(url, params=params, timeout=timeout)
            resp.raise_for_status()
            data = resp.json()
            if data and data.get("data"):
                return data["data"]
            return None
        except Exception as e:
            logger.debug("EastMoney HTTP 请求失败 [%s]: %s", url, e)
            return None

    # ── 个股实时行情 ──────────────────────────────────────────────────

    def realtime(self, code: str) -> Optional[List[StockRealtime]]:
        sid = _secid(code)
        params = {
            "secid": sid,
            "fields": "f43,f44,f45,f46,f47,f48,f50,f51,f52,f57,f58,f170,f115,f162,f167,f168,f169",
        }
        data = self._get(BASE_URL, params)
        if not data:
            return None

        return [StockRealtime(
            code=self._norm_code(code),
            name=data.get("f58", "") or "",
            price=normalize_price(data.get("f43")),
            open=data.get("f44"),
            high=data.get("f45"),
            low=data.get("f46"),
            pre_close=data.get("f47"),
            volume=data.get("f48"),
            amount=data.get("f49"),
            change=data.get("f169"),
            change_pct=normalize_change_pct(data.get("f170")),
            turnover_rate=data.get("f168"),
            pe=data.get("f162"),
            pb=data.get("f167"),
            market_cap=data.get("f116") if data.get("f116") else data.get("f20"),
            amplitude=data.get("f115"),
            volume_ratio=data.get("f50"),
        )]

    def batch_realtime(self, codes: List[str]) -> Optional[List[StockRealtime]]:
        results = []
        # 东财不支持一次批量查多个，串行查
        for code in codes:
            try:
                r = self.realtime(code)
                if r:
                    results.extend(r)
            except Exception:
                continue
        return results if results else None

    # ── 个股K线 ───────────────────────────────────────────────────────

    def kline(self, code: str, period: str = "daily",
              start: str = "", end: str = "") -> Optional[List[StockKline]]:
        sid = _secid(code)
        secid_param = sid
        klt = PERIOD_MAP.get(period, "101")
        fqt = "1"  # 前复权

        params = {
            "secid": secid_param,
            "fields1": "f1,f2,f3",
            "fields2": "f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61",
            "klt": klt,
            "fqt": fqt,
            "lmt": "1000",
        }
        if start:
            params["beg"] = start.replace("-", "")
        if end:
            params["end"] = end.replace("-", "")

        data = self._get(KLINE_URL, params)
        if not data:
            return None

        klines_str = data.get("klines")
        if not klines_str:
            return None

        return _parse_kline_klines(klines_str, self._norm_code(code))

    # ── 个股资金流 ────────────────────────────────────────────────────

    def money_flow(self, code: str) -> Optional[List[MoneyFlow]]:
        sid = _secid(code)
        params = {
            "secid": sid,
            "fields1": "f1,f2,f3",
            "fields2": "f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61,f62,f63",
        }
        data = self._get(FLOW_URL, params)
        if not data:
            return None

        klines_str = data.get("klines")
        if not klines_str:
            return None

        results = []
        for line in klines_str.split(";"):
            parts = line.split(",")
            if len(parts) < 12:
                continue
            try:
                results.append(MoneyFlow(
                    code=self._norm_code(code),
                    date=parts[0],
                    main_net=float(parts[1]) if parts[1] else None,
                    super_large_net=float(parts[4]) if parts[4] else None,
                    large_net=float(parts[5]) if parts[5] else None,
                    medium_net=float(parts[6]) if parts[6] else None,
                    small_net=float(parts[7]) if parts[7] else None,
                    main_net_pct=float(parts[8]) if parts[8] else None,
                    close=float(parts[2]) if parts[2] else None,
                    change_pct=float(parts[3]) if parts[3] else None,
                ))
            except (ValueError, IndexError):
                continue
        return results if results else None

    # ── 大盘指数实时 ──────────────────────────────────────────────────

    def index_realtime(self, code: str) -> Optional[List[IndexRealtime]]:
        sid = _secid(code)
        params = {
            "secid": sid,
            "fields": "f43,f44,f45,f46,f47,f57,f58,f169,f170,f60,f61",
        }
        data = self._get(BASE_URL, params)
        if not data:
            return None

        return [IndexRealtime(
            code=self._norm_code(code),
            name=data.get("f58", "") or "",
            price=normalize_price(data.get("f43")),
            open=data.get("f44"),
            high=data.get("f45"),
            low=data.get("f46"),
            pre_close=data.get("f47"),
            change=data.get("f169"),
            change_pct=normalize_change_pct(data.get("f170")),
            volume=data.get("f60"),
            amount=data.get("f61"),
        )]

    # ── 大盘指数K线 ──────────────────────────────────────────────────

    def index_kline(self, code: str, period: str = "daily",
                    start: str = "", end: str = "") -> Optional[List[IndexKline]]:
        sid = _secid(code)
        klt = PERIOD_MAP.get(period, "101")
        params = {
            "secid": sid,
            "fields1": "f1,f2,f3",
            "fields2": "f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61",
            "klt": klt,
            "fqt": "1",
            "lmt": "1000",
        }
        if start:
            params["beg"] = start.replace("-", "")
        if end:
            params["end"] = end.replace("-", "")

        data = self._get(KLINE_URL, params)
        if not data:
            return None

        klines_str = data.get("klines")
        if not klines_str:
            return None

        results = []
        for line in klines_str.split(";"):
            parts = line.split(",")
            if len(parts) < 7:
                continue
            try:
                results.append(IndexKline(
                    code=self._norm_code(code),
                    date=parts[0],
                    open=float(parts[1]),
                    close=float(parts[2]),
                    high=float(parts[3]),
                    low=float(parts[4]),
                    volume=float(parts[5]),
                    amount=float(parts[6]),
                    change_pct=float(parts[8]) if len(parts) > 8 else None,
                ))
            except (ValueError, IndexError):
                continue
        return results if results else None

    # ── 北向资金流 ────────────────────────────────────────────────────

    def market_money_flow(self, direction: str = "north") -> Optional[List[MarketMoneyFlow]]:
        # 北向: secid=0.1
        sid = "0.1" if direction == "north" else "1.1"
        params = {
            "secid": sid,
            "fields1": "f1,f2,f3",
            "fields2": "f51,f52,f53,f54,f55",
        }
        data = self._get(INDEX_FLOW_URL, params)
        if not data:
            return None

        klines_str = data.get("klines")
        if not klines_str:
            return None

        results = []
        for line in klines_str.split(";"):
            parts = line.split(",")
            if len(parts) < 5:
                continue
            try:
                results.append(MarketMoneyFlow(
                    direction=direction,
                    date=parts[0],
                    net_amount=float(parts[1]) if parts[1] else 0,
                    sh_net=float(parts[2]) if len(parts) > 2 and parts[2] else None,
                    sz_net=float(parts[3]) if len(parts) > 3 and parts[3] else None,
                    cumulative=float(parts[4]) if len(parts) > 4 and parts[4] else None,
                ))
            except (ValueError, IndexError):
                continue
        return results if results else None

    # ── 行业资金流 ────────────────────────────────────────────────────

    def sector_money_flow(self, sector_type: str = "industry") -> Optional[List[SectorMoneyFlow]]:
        params = {
            "pn": "1",
            "pz": "20",
            "fs": f"m:90+t:2" if sector_type == "concept" else "m:90+t:1",
            "fields": "f12,f14,f3,f62,f184,f66,f69",
            "po": "1",  # 净流入排序
        }
        try:
            url = "https://push2.eastmoney.com/api/qt/clist/get"
            data = self._get(url, params)
            if not data:
                return None
            items = data.get("diff", [])
            results = []
            for item in items:
                results.append(SectorMoneyFlow(
                    sector_name=item.get("f14", ""),
                    date=datetime.now().strftime("%Y-%m-%d"),
                    main_net=item.get("f62"),
                    main_net_pct=item.get("f184"),
                    top_stocks=[],
                ))
            return results if results else None
        except Exception as e:
            logger.debug("行业资金流查询失败: %s", e)
            return None

    # ══════════════════════════════════════════════════════════════════
    # 扩展数据维度 — 投资研究
    # ══════════════════════════════════════════════════════════════════

    # ── 个股背景/公司概况 ────────────────────────────────────────────

    def profile(self, code: str) -> Optional[List[StockProfile]]:
        """从东财数据中心获取公司概况。"""
        try:
            c = code.strip().zfill(6)
            sid = _secid(code)
            full = self._sec_full_code(code)

            # 并行请求: 基础行情字段 + 详细信息
            # 1) push2 API 拿基础信息
            url1 = "https://push2.eastmoney.com/api/qt/stock/get"
            p1 = {
                "secid": sid,
                "fields": "f43,f44,f57,f58,f84,f85,f86,f100,f115,f116,f117,f152,f162,f167,f168,f170,f171,f292,f293,f294,f295,f296,f297,f298,f300,f301,f302",
            }
            data1 = self._get(url1, p1)
            if not data1:
                return None

            # 2) 数据中心 API 拿详细信息
            industry = ""
            concepts = []
            main_biz = ""
            listing_date = ""
            website = ""
            employees = None
            province = ""
            city = ""

            # 尝试从 push2 字段提取
            # f84=f85=行业, f292=总市值, f293=f294=流通市值
            industry = data1.get("f84", "") or data1.get("f85", "") or ""
            if industry.startswith(("6", "0")):  # 可能是代码不是行业名
                industry = ""

            # 从数据中心获取详细资料
            dc_url = "https://datacenter-web.eastmoney.com/api/data/v1/get"
            dc_params = {
                "reportName": "RPT_DMSK_FNCOMPANY",
                "columns": "SECURITY_CODE,SECURITY_NAME_ABBR,INDUSTRY,PROVINCE,CITY,MAIN_BUSINESS,LICENSE_DATE,WEBSITE,EMPLOYEES,LISTING_DATE,LISTING_SECTOR,REGISTERED_CAPITAL",
                "filter": f'(SECURITY_CODE="{c}")',
                "pageNumber": 1,
                "pageSize": 1,
                "sortTypes": -1,
                "sortColumns": "LICENSE_DATE",
            }
            try:
                dc_resp = http_get(dc_url, params=dc_params, timeout=10)
                dc_data = dc_resp.json() if dc_resp.status_code == 200 else {}
                items = dc_data.get("result", {}).get("data", []) or dc_data.get("data", {}).get("list", [])
                if items:
                    item = items[0]
                    industry = item.get("INDUSTRY", "") or industry
                    province = item.get("PROVINCE", "")
                    city = item.get("CITY", "")
                    main_biz = item.get("MAIN_BUSINESS", "")
                    listing_date = item.get("LISTING_DATE", "") or item.get("LICENSE_DATE", "")
                    website = item.get("WEBSITE", "")
                    try:
                        employees = int(item["EMPLOYEES"]) if item.get("EMPLOYEES") else None
                    except (ValueError, TypeError):
                        pass
            except Exception:
                pass

            # 概念板块
            try:
                concept_url = "https://push2.eastmoney.com/api/qt/slist/get"
                concept_params = {
                    "fltt": "2",
                    "invt": "2",
                    "fields": "f12,f14",
                    "secids": sid,
                    "type": "13",  # 概念板块
                }
                concept_resp = http_get(concept_url, params=concept_params, timeout=10)
                concept_data = concept_resp.json() if concept_resp.status_code == 200 else {}
                if concept_data.get("data") and concept_data["data"].get("diff"):
                    concepts = [
                        item.get("f14", "")
                        for item in concept_data["data"]["diff"]
                        if item.get("f14")
                    ]
            except Exception:
                pass

            return [StockProfile(
                code=c,
                name=data1.get("f58", "") or "",
                industry=industry,
                concepts=concepts[:10],
                listing_date=listing_date[:10] if listing_date else "",
                main_business=main_biz,
                total_market_cap=normalize_price(data1.get("f116")),
                circulating_market_cap=normalize_price(data1.get("f117")),
                employees=employees,
                province=province,
                city=city,
                website=website,
            )]
        except Exception as e:
            logger.debug("东财 profile 失败 [%s]: %s", code, e)
            return None

    # ── 股东数据 ──────────────────────────────────────────────────────

    def shareholders(self, code: str, report_date: str = "") -> Optional[List[ShareholderData]]:
        """从东财数据中心获取股东数据。"""
        try:
            c = code.strip().zfill(6)
            results = []

            # 1) 股东人数
            holder_url = "https://datacenter-web.eastmoney.com/api/data/v1/get"
            holder_params = {
                "reportName": "RPT_HOLDERCOUNT",
                "columns": "SECURITY_CODE,END_DATE,SHAREHOLDER_TOTAL_NUM,AVG_HOLDING_MARKET_CAP,TOTAL_SHARES,TOTAL_CHANGE,TRADE_DATE",
                "filter": f'(SECURITY_CODE="{c}")',
                "pageNumber": 1,
                "pageSize": 5,
                "sortTypes": -1,
                "sortColumns": "END_DATE",
            }
            try:
                resp = http_get(holder_url, params=holder_params, timeout=10)
                data = resp.json() if resp.status_code == 200 else {}
                items = data.get("result", {}).get("data", []) or data.get("data", {}).get("list", [])
                if items:
                    item = items[0]
                    sd = ShareholderData(
                        code=c,
                        report_date=str(item.get("END_DATE", ""))[:10],
                        shareholder_count=vint(item.get("SHAREHOLDER_TOTAL_NUM")),
                        shareholder_count_change=vfloat(item.get("TOTAL_CHANGE")),
                        avg_holding_value=vfloat(item.get("AVG_HOLDING_MARKET_CAP")),
                    )
                    results.append(sd)
            except Exception as e:
                logger.debug("东财股东人数失败: %s", e)

            # 2) 十大股东
            top10_url = "https://datacenter-web.eastmoney.com/api/data/v1/get"
            top10_params = {
                "reportName": "RPT_HOLDER_TOP10",
                "columns": "SECURITY_CODE,END_DATE,HOLDER_NAME,HOLDER_RANK,HELD_SHARES,HELD_SHARES_PCT,CHANGE_IN_SHARES",
                "filter": f'(SECURITY_CODE="{c}")',
                "pageNumber": 1,
                "pageSize": 10,
                "sortTypes": -1,
                "sortColumns": "END_DATE,HOLDER_RANK",
            }
            try:
                resp = http_get(top10_url, params=top10_params, timeout=10)
                data = resp.json() if resp.status_code == 200 else {}
                items = data.get("result", {}).get("data", []) or data.get("data", {}).get("list", [])
                if items:
                    # 按报告期分组
                    from collections import defaultdict
                    by_date = defaultdict(list)
                    for item in items:
                        d = str(item.get("END_DATE", ""))[:10]
                        by_date[d].append(ShareholderItem(
                            rank=vint(item.get("HOLDER_RANK"), 0),
                            name=item.get("HOLDER_NAME", ""),
                            shares_held=vfloat(item.get("HELD_SHARES")),
                            share_pct=vfloat(item.get("HELD_SHARES_PCT")),
                            change=vfloat(item.get("CHANGE_IN_SHARES")),
                        ))
                    # 最新一期的十大股东
                    latest_date = max(by_date.keys()) if by_date else ""
                    if latest_date:
                        top10 = by_date[latest_date]
                        if results:
                            results[0].top_10_shareholders = top10
                        else:
                            results.append(ShareholderData(
                                code=c,
                                report_date=latest_date,
                                top_10_shareholders=top10,
                            ))
            except Exception as e:
                logger.debug("东财十大股东失败: %s", e)

            return results if results else None
        except Exception as e:
            logger.debug("东财 shareholders 失败 [%s]: %s", code, e)
            return None

    # ── 财报摘要 ──────────────────────────────────────────────────────

    def financials(self, code: str, report_date: str = "",
                   report_type: str = "annual") -> Optional[List[FinancialSummary]]:
        """从东财数据中心获取财报摘要。"""
        try:
            c = code.strip().zfill(6)

            # 报表类型映射
            type_map = {"annual": "1", "semi": "2", "q1": "3", "q3": "4"}
            rtype = type_map.get(report_type, "1")

            fin_url = "https://datacenter-web.eastmoney.com/api/data/v1/get"
            fin_params = {
                "reportName": "RPT_LICO_FN_CPD",
                "columns": "SECURITY_CODE,REPORT_DATE,REPORT_DATE_NAME,BASIC_EPS,WEIGHTAVG_ROE,OPERATE_INCOME,OPERATE_INCOME_YOY,NET_PROFIT_PARENT_YOY,TOTAL_PROFIT_PARENT,GROSS_PROFIT_MARGIN,DEBT_RATIO,OPERATE_CASH_FLOW,TOTAL_ASSETS,TOTAL_LIABILITIES",
                "filter": f'(SECURITY_CODE="{c}")(REPORT_DATE_TYPE="{rtype}")',
                "pageNumber": 1,
                "pageSize": 8,
                "sortTypes": -1,
                "sortColumns": "REPORT_DATE",
            }
            if report_date:
                fin_params["filter"] = f'(SECURITY_CODE="{c}")(REPORT_DATE>="{report_date}")(REPORT_DATE_TYPE="{rtype}")'

            try:
                resp = http_get(fin_url, params=fin_params, timeout=10)
                data = resp.json() if resp.status_code == 200 else {}
                items = data.get("result", {}).get("data", []) or data.get("data", {}).get("list", [])
                if not items:
                    return None

                results = []
                for item in items:
                    report_name = item.get("REPORT_DATE_NAME", "")
                    # 从名称推断报告类型
                    rtype_str = "annual"
                    if "一季" in report_name:
                        rtype_str = "q1"
                    elif "中报" in report_name or "半年" in report_name:
                        rtype_str = "semi"
                    elif "三季" in report_name:
                        rtype_str = "q3"

                    results.append(FinancialSummary(
                        code=c,
                        report_date=str(item.get("REPORT_DATE", ""))[:10],
                        report_type=rtype_str,
                        revenue=vfloat(item.get("OPERATE_INCOME")),
                        revenue_yoy=vfloat(item.get("OPERATE_INCOME_YOY")),
                        net_profit=vfloat(item.get("TOTAL_PROFIT_PARENT")),
                        net_profit_yoy=vfloat(item.get("NET_PROFIT_PARENT_YOY")),
                        eps=vfloat(item.get("BASIC_EPS")),
                        roe=vfloat(item.get("WEIGHTAVG_ROE")),
                        gross_margin=vfloat(item.get("GROSS_PROFIT_MARGIN")),
                        debt_ratio=vfloat(item.get("DEBT_RATIO")),
                        operating_cash_flow=vfloat(item.get("OPERATE_CASH_FLOW")),
                        total_assets=vfloat(item.get("TOTAL_ASSETS")),
                        total_liabilities=vfloat(item.get("TOTAL_LIABILITIES")),
                    ))
                return results if results else None
            except Exception as e:
                logger.debug("东财财报失败: %s", e)
                return None

        except Exception as e:
            logger.debug("东财 financials 失败 [%s]: %s", code, e)
            return None

    # ── 新闻公告 ──────────────────────────────────────────────────────

    def news(self, code: str, page: int = 1, page_size: int = 20,
             news_type: str = "all") -> Optional[List[NewsItem]]:
        """从东方财富获取新闻公告。"""
        try:
            c = code.strip().zfill(6)
            results = []

            if news_type in ("all", "news"):
                # 新闻搜索 API
                search_url = "https://search-api-web.eastmoney.com/search/jsonp"
                import json as _json
                param_obj = {
                    "uid": "",
                    "keyword": c,
                    "type": ["cmsArticleWebOld"],
                    "pageIndex": page,
                    "pageSize": page_size,
                }
                search_params = {
                    "cb": "jQuery",
                    "param": _json.dumps(param_obj, ensure_ascii=False),
                }
                try:
                    resp = http_get(search_url, params=search_params, timeout=10)
                    text = resp.text
                    # 解析JSONP: jQuery({...})
                    start = text.find("(")
                    end = text.rfind(")")
                    if start >= 0 and end > start:
                        data = _json.loads(text[start+1:end])
                        articles = data.get("result", {}).get("cmsArticleWebOld", {}).get("list", [])
                        for art in articles[:page_size]:
                            results.append(NewsItem(
                                code=c,
                                date=str(art.get("date", ""))[:10] or str(art.get("showDate", ""))[:10],
                                title=art.get("title", "") or art.get("ArticleTitle", ""),
                                summary=art.get("summary", "") or art.get("articleAbstract", "") or "",
                                url=art.get("url", "") or art.get("articleUrl", "") or "",
                                source=art.get("source", "") or art.get("articleSource", "") or "",
                                content_type="news",
                            ))
                except Exception as e:
                    logger.debug("东财新闻失败: %s", e)

            if news_type in ("all", "announcement"):
                # 公告 API
                notice_url = "https://np-anotice-stock.eastmoney.com/api/security/ann"
                notice_params = {
                    "sr": -1,
                    "page_size": page_size,
                    "page_index": page,
                    "ann_type": "A",
                    "stock_list": c,
                    "f_node": "0",
                    "s_node": "0",
                }
                try:
                    resp = http_get(notice_url, params=notice_params, timeout=10)
                    notice_data = resp.json() if resp.status_code == 200 else {}
                    notices = notice_data.get("data", {}).get("list", [])
                    for note in notices[:page_size]:
                        results.append(NewsItem(
                            code=c,
                            date=str(note.get("notice_date", ""))[:10] or str(note.get("ann_date", ""))[:10],
                            title=note.get("title", "") or note.get("ann_title", ""),
                            summary=note.get("content", "") or "",
                            url=note.get("url", "") or note.get("ann_url", "") or "",
                            source=note.get("source", "") or "东方财富",
                            content_type="announcement",
                            is_important=note.get("f_node", "0") == "0",
                        ))
                except Exception as e:
                    logger.debug("东财公告失败: %s", e)

            return results if results else None
        except Exception as e:
            logger.debug("东财 news 失败 [%s]: %s", code, e)
            return None

    # ── 舆情动态 ──────────────────────────────────────────────────────

    def sentiment(self, code: str) -> Optional[List[SentimentData]]:
        """从东方财富获取舆情动态。

        使用东财的舆论监控接口获取情绪数据。
        """
        try:
            c = code.strip().zfill(6)
            full_code = self._sec_full_code(code)

            # 舆情/情绪数据 API
            sent_url = "https://emweb.securities.eastmoney.com/PC_HSF10/SentimentAnalysis/Ajax?code=" + full_code
            try:
                resp = http_get(sent_url, timeout=10)
                data = resp.json() if resp.status_code == 200 else {}
                if data:
                    return [SentimentData(
                        code=c,
                        date=data.get("date", "")[:10] if data.get("date") else "",
                        sentiment_score=vfloat(data.get("sentiment", data.get("sentimentScore"))),
                        hot_score=vfloat(data.get("hot", data.get("hotScore"))),
                        mention_count=vint(data.get("mentionCount", data.get("mention_count"))),
                        bull_ratio=vfloat(data.get("bullPercent", data.get("bull_ratio"))),
                        bear_ratio=vfloat(data.get("bearPercent", data.get("bear_ratio"))),
                    )]
            except Exception as e:
                logger.debug("东财舆情API失败: %s", e)

            # 备用: 从搜索API提取舆情指标
            return None
        except Exception as e:
            logger.debug("东财 sentiment 失败 [%s]: %s", code, e)
            return None


# ── 辅助函数 ──────────────────────────────────────────────────────────



    # ══════════════════════════════════════════════════════════════════
    # 产业链挖掘 — 新数据接口
    # ══════════════════════════════════════════════════════════════════

    # ── 主营构成（分产品/分地区/分行业）───────────────────────────────

    def main_business(self, code: str) -> Optional[List[MainBusinessData]]:
        """从东财获取主营构成（分产品/分地区/分行业）。"""
        try:
            c = code.strip().zfill(6)
            # 尝试多个东财F10数据中心报表名
            report_names = [
                "RPT_DMSK_FN_INCOME",
                "RPT_F10_INCOME_CONSTRUCT",
                "RPT_MAIN_BUSINESS_INCOME",
            ]
            results = []
            for rpt in report_names:
                url = "https://datacenter-web.eastmoney.com/api/data/v1/get"
                params = {
                    "reportName": rpt,
                    "columns": "ALL",
                    "filter": f'(SECURITY_CODE="{c}")',
                    "pageNumber": 1,
                    "pageSize": 50,
                    "sortTypes": -1,
                    "sortColumns": "REPORT_DATE",
                }
                resp = self._get(url, params)
                if not resp:
                    continue
                raw_data = resp  # already parsed JSON .data
                # Try different result locations
                items = (raw_data.get("result", {}).get("data", []) or
                         raw_data.get("data", {}).get("list", []) or [])
                if items:
                    # 按报告期分组
                    from collections import defaultdict
                    by_date = defaultdict(lambda: {"products": [], "regions": [], "industries": [], "total_revenue": None})
                    for item in items:
                        report_date = str(item.get("REPORT_DATE", ""))[:10]
                        date_key = report_date
                        biz_type = item.get("BUSINESS_TYPE", "") or item.get("TYPE_NAME", "") or ""
                        biz_name = item.get("BUSINESS_NAME", "") or item.get("ITEM_NAME", "") or ""
                        revenue = vfloat(item.get("OPERATE_INCOME", item.get("REVENUE")))
                        revenue_pct = vfloat(item.get("INCOME_PROPORTION", item.get("REVENUE_PCT")))
                        cost = vfloat(item.get("OPERATE_COST", item.get("COST")))
                        gross = vfloat(item.get("GROSS_PROFIT_RATIO", item.get("GROSS_MARGIN")))
                        gross_chg = vfloat(item.get("GROSS_PROFIT_RATIO_CHANGE"))

                        line_item = BusinessLineItem(
                            name=biz_name, revenue=revenue,
                            revenue_pct=revenue_pct, cost=cost,
                            gross_margin=gross, gross_margin_change=gross_chg,
                        )

                        if "地区" in biz_type or "区域" in biz_type or "REGION" in biz_type.upper():
                            by_date[date_key]["regions"].append(line_item)
                        elif "行业" in biz_type or "INDUSTRY" in biz_type.upper():
                            by_date[date_key]["industries"].append(line_item)
                        else:
                            by_date[date_key]["products"].append(line_item)

                        if by_date[date_key]["total_revenue"] is None:
                            by_date[date_key]["total_revenue"] = vfloat(item.get("TOTAL_OPERATE_INCOME", item.get("TOTAL_REVENUE")))

                    for report_date, data in sorted(by_date.items(), reverse=True)[:4]:
                        results.append(MainBusinessData(
                            code=c, report_date=report_date,
                            products=data["products"][:20],
                            regions=data["regions"][:20],
                            industries=data["industries"][:20],
                            total_revenue=data["total_revenue"],
                        ))

                    if results:
                        break

            return results if results else None
        except Exception as e:
            logger.debug("主营构成失败 [%s]: %s", code, e)
            return None

    # ── 前五大客户/供应商 ──────────────────────────────────────────────

    def top_customer_supplier(self, code: str, direction: str = "customer") -> Optional[List[TopCustomerSupplier]]:
        """查询前五大客户或供应商。"""
        try:
            c = code.strip().zfill(6)
            report_names = [
                "RPT_F10_PROFIT_CUSTOMER" if direction == "customer" else "RPT_F10_PROFIT_SUPPLIER",
                "RPT_TOPCUSTOMER" if direction == "customer" else "RPT_TOPSUPPLIER",
                "RPT_DMSK_FN_CUSTSUPPLIER",
            ]
            for rpt in report_names:
                url = "https://datacenter-web.eastmoney.com/api/data/v1/get"
                params = {
                    "reportName": rpt,
                    "columns": "ALL",
                    "filter": f'(SECURITY_CODE="{c}")',
                    "pageNumber": 1, "pageSize": 10,
                    "sortTypes": -1, "sortColumns": "REPORT_DATE",
                }
                resp = self._get(url, params)
                if not resp:
                    continue
                raw_data = resp
                items = (raw_data.get("result", {}).get("data", []) or
                         raw_data.get("data", {}).get("list", []) or [])
                if items:
                    from collections import defaultdict
                    by_date = defaultdict(list)
                    for item in items:
                        report_date = str(item.get("REPORT_DATE", ""))[:10]
                        cs_item = CustomerSupplierItem(
                            rank=int(item.get("RANK", 0) or 0),
                            name=item.get("CUSTOMER_NAME", item.get("SUPPLIER_NAME", item.get("NAME", ""))),
                            amount=vfloat(item.get("AMOUNT", item.get("SALE_AMOUNT", item.get("PURCHASE_AMOUNT")))),
                            amount_pct=vfloat(item.get("AMOUNT_PCT", item.get("PROPORTION"))),
                        )
                        by_date[report_date].append(cs_item)

                    results = []
                    for report_date, cs_list in sorted(by_date.items(), reverse=True)[:4]:
                        total_pct = sum(c.amount_pct or 0 for c in cs_list if c.amount_pct)
                        results.append(TopCustomerSupplier(
                            code=c, report_date=report_date,
                            direction=direction,
                            items=cs_list[:5],
                            total_pct=total_pct,
                        ))

                    if results:
                        return results
        except Exception as e:
            logger.debug("前五大%s失败 [%s]: %s", direction, code, e)
        return None

    # ── 实际控制人 ──────────────────────────────────────────────────────

    def actual_controller(self, code: str) -> Optional[List[ActualController]]:
        try:
            c = code.strip().zfill(6)
            # 尝试从 push2 获取
            sid = _secid(code)
            url = "https://push2.eastmoney.com/api/qt/stock/get"
            params = {
                "secid": sid,
                "fields": "f57,f58,f84,f85,f171,f292,f293,f294",
            }
            data = self._get(url, params)
            if not data:
                # 尝试数据中心
                dc_url = "https://datacenter-web.eastmoney.com/api/data/v1/get"
                dc_params = {
                    "reportName": "RPT_CONTROLLER_INFO",
                    "columns": "ALL",
                    "filter": f'(SECURITY_CODE="{c}")',
                    "pageNumber": 1, "pageSize": 5,
                }
                dc_data = self._get(dc_url, dc_params)
                if dc_data:
                    items = (dc_data.get("result", {}).get("data", []) or
                             dc_data.get("data", {}).get("list", []) or [])
                    if items:
                        results = []
                        for item in items:
                            results.append(ActualController(
                                code=c,
                                controller_name=item.get("CONTROLLER_NAME", ""),
                                shareholding_ratio=vfloat(item.get("SHAREHOLDING_RATIO")),
                                control_level=int(item.get("CONTROL_LEVEL", 0) or 0),
                                control_path=item.get("CONTROL_PATH", ""),
                                nature=item.get("CONTROLLER_NATURE", ""),
                                total_shares=vfloat(item.get("TOTAL_SHARES")),
                                report_date=str(item.get("REPORT_DATE", ""))[:10],
                            ))
                        return results if results else None

            # 从实控人字段或年报数据回退
            # 如果以上都失败，返回 None
            return None
        except Exception as e:
            logger.debug("实际控制人失败 [%s]: %s", code, e)
            return None

    # ── 子公司信息 ──────────────────────────────────────────────────────

    def subsidiaries(self, code: str) -> Optional[List[SubsidiaryData]]:
        try:
            c = code.strip().zfill(6)
            report_names = ["RPT_SUBSIDIARY_INFO", "RPT_F10_SUBSIDIARY"]
            for rpt in report_names:
                url = "https://datacenter-web.eastmoney.com/api/data/v1/get"
                params = {
                    "reportName": rpt,
                    "columns": "ALL",
                    "filter": f'(SECURITY_CODE="{c}")',
                    "pageNumber": 1, "pageSize": 50,
                    "sortTypes": -1, "sortColumns": "REPORT_DATE",
                }
                resp = self._get(url, params)
                if not resp:
                    continue
                raw_data = resp
                items = (raw_data.get("result", {}).get("data", []) or
                         raw_data.get("data", {}).get("list", []) or [])
                if items:
                    from collections import defaultdict
                    by_date = defaultdict(list)
                    for item in items:
                        report_date = str(item.get("REPORT_DATE", ""))[:10]
                        sub = SubsidiaryItem(
                            name=item.get("SUBSIDIARY_NAME", item.get("COMPANY_NAME", "")),
                            shareholding_ratio=vfloat(item.get("SHAREHOLDING_RATIO", item.get("STOCK_RATIO"))),
                            business_nature=item.get("BUSINESS_NATURE", item.get("MAIN_BUSINESS", "")),
                            total_assets=vfloat(item.get("TOTAL_ASSETS")),
                            net_profit=vfloat(item.get("NET_PROFIT")),
                            registered_capital=vfloat(item.get("REGISTERED_CAPITAL")),
                            established_date=str(item.get("ESTABLISH_DATE", ""))[:10],
                            is_consolidated=True if item.get("IS_CONSOLIDATED") == "1" else None,
                        )
                        by_date[report_date].append(sub)

                    results = [SubsidiaryData(
                        code=c, report_date=d,
                        subsidiaries=subs[:100], total_count=len(subs),
                    ) for d, subs in sorted(by_date.items(), reverse=True)[:2]]
                    return results if results else None
        except Exception as e:
            logger.debug("子公司信息失败 [%s]: %s", code, e)
        return None

    # ── 关联交易 ──────────────────────────────────────────────────────

    def related_party_trades(self, code: str) -> Optional[List[RelatedPartyTrade]]:
        try:
            c = code.strip().zfill(6)
            report_names = ["RPT_RELATED_PARTY_TRADE", "RPT_F10_RELATEDTRADE"]
            for rpt in report_names:
                url = "https://datacenter-web.eastmoney.com/api/data/v1/get"
                params = {
                    "reportName": rpt,
                    "columns": "ALL",
                    "filter": f'(SECURITY_CODE="{c}")',
                    "pageNumber": 1, "pageSize": 50,
                    "sortTypes": -1, "sortColumns": "REPORT_DATE",
                }
                resp = self._get(url, params)
                if not resp:
                    continue
                raw_data = resp
                items = (raw_data.get("result", {}).get("data", []) or
                         raw_data.get("data", {}).get("list", []) or [])
                if items:
                    results = []
                    for item in items[:50]:
                        results.append(RelatedPartyTrade(
                            code=c,
                            report_date=str(item.get("REPORT_DATE", ""))[:10],
                            related_party=item.get("RELATED_PARTY_NAME", item.get("PARTY_NAME", "")),
                            relationship=item.get("RELATIONSHIP", item.get("RELATION", "")),
                            trade_type=item.get("TRADE_TYPE", item.get("TRANSACTION_TYPE", "")),
                            trade_amount=vfloat(item.get("TRADE_AMOUNT", item.get("TRANSACTION_AMOUNT"))),
                            trade_balance=vfloat(item.get("TRADE_BALANCE", item.get("BALANCE"))),
                            pricing_policy=item.get("PRICING_POLICY", ""),
                            is_material=item.get("IS_MATERIAL") == "1",
                        ))
                    return results if results else None
        except Exception as e:
            logger.debug("关联交易失败 [%s]: %s", code, e)
        return None

    # ── 研发投入 ──────────────────────────────────────────────────────

    def rd_investment(self, code: str) -> Optional[List[RDInvestment]]:
        try:
            c = code.strip().zfill(6)
            report_names = ["RPT_RD_INVEST", "RPT_F10_RDINVEST"]
            for rpt in report_names:
                url = "https://datacenter-web.eastmoney.com/api/data/v1/get"
                params = {
                    "reportName": rpt,
                    "columns": "ALL",
                    "filter": f'(SECURITY_CODE="{c}")',
                    "pageNumber": 1, "pageSize": 10,
                    "sortTypes": -1, "sortColumns": "REPORT_DATE",
                }
                resp = self._get(url, params)
                if not resp:
                    continue
                raw_data = resp
                items = (raw_data.get("result", {}).get("data", []) or
                         raw_data.get("data", {}).get("list", []) or [])
                if items:
                    results = []
                    for item in items:
                        results.append(RDInvestment(
                            code=c,
                            report_date=str(item.get("REPORT_DATE", ""))[:10],
                            report_type=item.get("REPORT_TYPE_NAME", ""),
                            rd_expense=vfloat(item.get("RD_EXPENSE", item.get("RESEARCH_EXPENSE"))),
                            rd_expense_pct=vfloat(item.get("RD_EXPENSE_RATIO", item.get("R&D_RATIO"))),
                            capitalized_rd=vfloat(item.get("CAPITALIZED_RD", item.get("DEVELOPMENT_EXPENSE"))),
                            capitalized_rd_pct=vfloat(item.get("CAPITALIZED_RD_RATIO")),
                            rd_staff_count=vint(item.get("RD_STAFF_COUNT", item.get("R&D_STAFF"))),
                            rd_staff_ratio=vfloat(item.get("RD_STAFF_RATIO")),
                        ))
                    return results if results else None
        except Exception as e:
            logger.debug("研发投入失败 [%s]: %s", code, e)
        return None

    # ── 并购事件 ──────────────────────────────────────────────────────

    def ma_events(self, code: str) -> Optional[List[MAEvent]]:
        try:
            c = code.strip().zfill(6)
            report_names = ["RPT_MA_EVENT", "RPT_F10_MERGER"]
            for rpt in report_names:
                url = "https://datacenter-web.eastmoney.com/api/data/v1/get"
                params = {
                    "reportName": rpt,
                    "columns": "ALL",
                    "filter": f'(SECURITY_CODE="{c}")',
                    "pageNumber": 1, "pageSize": 20,
                    "sortTypes": -1, "sortColumns": "ANN_DATE",
                }
                resp = self._get(url, params)
                if not resp:
                    continue
                raw_data = resp
                items = (raw_data.get("result", {}).get("data", []) or
                         raw_data.get("data", {}).get("list", []) or [])
                if items:
                    results = []
                    for item in items:
                        results.append(MAEvent(
                            code=c,
                            announcement_date=str(item.get("ANN_DATE", ""))[:10],
                            target_company=item.get("TARGET_COMPANY", item.get("TARGET_NAME", "")),
                            target_industry=item.get("TARGET_INDUSTRY", ""),
                            transaction_amount=vfloat(item.get("TRANSACTION_AMOUNT", item.get("TOTAL_AMOUNT"))),
                            transaction_method=item.get("TRANSACTION_METHOD", ""),
                            shareholding_after=vfloat(item.get("SHAREHOLDING_AFTER", item.get("POST_RATIO"))),
                            purpose=item.get("PURPOSE", item.get("MERGER_PURPOSE", "")),
                            progress=item.get("PROGRESS", item.get("STATUS", "")),
                            goodwill=vfloat(item.get("GOODWILL")),
                        ))
                    return results if results else None
        except Exception as e:
            logger.debug("并购事件失败 [%s]: %s", code, e)
        return None

    # ── 员工构成 ──────────────────────────────────────────────────────

    def employee_composition(self, code: str) -> Optional[List[EmployeeComposition]]:
        try:
            c = code.strip().zfill(6)
            report_names = ["RPT_EMPLOYEE_COMPOSITION", "RPT_F10_EMPLOYEE"]
            for rpt in report_names:
                url = "https://datacenter-web.eastmoney.com/api/data/v1/get"
                params = {
                    "reportName": rpt,
                    "columns": "ALL",
                    "filter": f'(SECURITY_CODE="{c}")',
                    "pageNumber": 1, "pageSize": 10,
                    "sortTypes": -1, "sortColumns": "REPORT_DATE",
                }
                resp = self._get(url, params)
                if not resp:
                    continue
                raw_data = resp
                items = (raw_data.get("result", {}).get("data", []) or
                         raw_data.get("data", {}).get("list", []) or [])
                if items:
                    results = []
                    # 可能有多个报告期，每个报告期有一条汇总记录
                    seen_dates = set()
                    for item in items:
                        report_date = str(item.get("REPORT_DATE", ""))[:10]
                        if report_date in seen_dates:
                            continue
                        seen_dates.add(report_date)
                        results.append(EmployeeComposition(
                            code=c,
                            report_date=report_date,
                            total_employees=vint(item.get("TOTAL_EMPLOYEES")),
                            education_phd=vint(item.get("EDUCATION_PHD")),
                            education_master=vint(item.get("EDUCATION_MASTER")),
                            education_bachelor=vint(item.get("EDUCATION_BACHELOR")),
                            education_college=vint(item.get("EDUCATION_COLLEGE")),
                            education_other=vint(item.get("EDUCATION_OTHER")),
                            func_production=vint(item.get("FUNC_PRODUCTION")),
                            func_sales=vint(item.get("FUNC_SALES")),
                            func_technology=vint(item.get("FUNC_TECHNOLOGY")),
                            func_finance=vint(item.get("FUNC_FINANCE")),
                            func_admin=vint(item.get("FUNC_ADMIN")),
                        ))
                    return results if results else None
        except Exception as e:
            logger.debug("员工构成失败 [%s]: %s", code, e)
        return None

    # ── 机构调研 ──────────────────────────────────────────────────────

    def institutional_visits(self, code: str) -> Optional[List[InstitutionalVisit]]:
        try:
            c = code.strip().zfill(6)
            report_names = ["RPT_INST_VISIT", "RPT_F10_INSTITUTIONAL_VISIT"]
            for rpt in report_names:
                url = "https://datacenter-web.eastmoney.com/api/data/v1/get"
                params = {
                    "reportName": rpt,
                    "columns": "ALL",
                    "filter": f'(SECURITY_CODE="{c}")',
                    "pageNumber": 1, "pageSize": 30,
                    "sortTypes": -1, "sortColumns": "VISIT_DATE",
                }
                resp = self._get(url, params)
                if not resp:
                    continue
                raw_data = resp
                items = (raw_data.get("result", {}).get("data", []) or
                         raw_data.get("data", {}).get("list", []) or [])
                if items:
                    results = []
                    for item in items[:30]:
                        results.append(InstitutionalVisit(
                            code=c,
                            visit_date=str(item.get("VISIT_DATE", ""))[:10],
                            organization=item.get("ORGANIZATION_NAME", item.get("INST_NAME", "")),
                            organization_type=item.get("ORGANIZATION_TYPE", item.get("INST_TYPE", "")),
                            visitor_count=vint(item.get("VISITOR_COUNT")),
                            research_category=item.get("RESEARCH_CATEGORY", item.get("VISIT_TYPE", "")),
                            main_content=(item.get("MAIN_CONTENT", item.get("RESEARCH_CONTENT", "")) or "")[:300],
                        ))
                    return results if results else None
        except Exception as e:
            logger.debug("机构调研失败 [%s]: %s", code, e)
        return None

    # ── 可比公司 ──────────────────────────────────────────────────────

    def peer_companies(self, code: str) -> Optional[List[PeerCompany]]:
        try:
            c = code.strip().zfill(6)
            # 先查公司行业
            industry = ""
            sid = _secid(code)
            profile_url = "https://push2.eastmoney.com/api/qt/stock/get"
            pp = {"secid": sid, "fields": "f57,f58,f84,f85"}
            prof = self._get(profile_url, pp)
            if prof:
                industry = prof.get("f84", "") or prof.get("f85", "") or ""

            # 如果知道行业，通过行业找所有成分股作为可比公司
            if industry:
                clist_url = "https://push2.eastmoney.com/api/qt/clist/get"
                clist_params = {
                    "pn": "1", "pz": "50",
                    "po": "1", "np": "1",
                    "fields": "f12,f14,f2,f3",
                    "fltt": "2", "invt": "2",
                    "fs": f"m:90+t:2+f:!50",  # 行业
                }
                # 尝试用行业代码过滤
                resp = self._get(clist_url, clist_params)
                if resp:
                    items = resp.get("diff", [])
                    results = []
                    for item in items:
                        peer_code = item.get("f12", "")
                        if peer_code == c:
                            continue
                        results.append(PeerCompany(
                            code=c,
                            peer_code=peer_code,
                            peer_name=item.get("f14", ""),
                            industry=industry,
                            reason="同行业",
                        ))
                    return results if results else None

            # 如果以上都不行，尝试获取同行业不同公司数据
            return None
        except Exception as e:
            logger.debug("可比公司失败 [%s]: %s", code, e)
            return None
def vfloat(v) -> Optional[float]:
    """转 float，失败返回 None。"""
    if v is None:
        return None
    try:
        return float(v)
    except (ValueError, TypeError):
        return None


def vint(v, default=None) -> Optional[int]:
    """转 int，失败返回 default。"""
    if v is None:
        return default
    try:
        return int(v)
    except (ValueError, TypeError):
        try:
            return int(float(v))
        except (ValueError, TypeError):
            return default

    # ══════════════════════════════════════════════════════════════════
    # 第三批 — 交易衍生/持股/参考（14维度）
    # ══════════════════════════════════════════════════════════════════

    # ── 龙虎榜 ──────────────────────────────────────────────────────

    def dragon_tiger(self, date: str = "") -> Optional[List[DragonTiger]]:
        try:
            url = "https://datacenter-web.eastmoney.com/api/data/v1/get"
            params = {
                "reportName": "RPT_DAILYBILLBOARD",
                "columns": "ALL",
                "pageNumber": 1, "pageSize": 50,
                "sortTypes": -1, "sortColumns": "TRADE_DATE",
            }
            if date:
                params["filter"] = f'(TRADE_DATE="{date}")'
            resp = http_get(url, params=params, timeout=10)
            data = resp.json() if resp.status_code == 200 else {}
            items = data.get("result", {}).get("data", []) or data.get("data", {}).get("list", [])
            if not items:
                return None

            results = []
            for item in items:
                results.append(DragonTiger(
                    code=item.get("SECURITY_CODE", ""),
                    date=str(item.get("TRADE_DATE", ""))[:10],
                    name=item.get("SECURITY_NAME", ""),
                    reason=item.get("BOARD_REASON", ""),
                    total_buy=vfloat(item.get("TOTAL_BUY")),
                    total_sell=vfloat(item.get("TOTAL_SELL")),
                    net_amount=vfloat(item.get("NET_BUY")),
                    buy_count=vint(item.get("BUY_SEAT_COUNT")),
                    sell_count=vint(item.get("SELL_SEAT_COUNT")),
                ))
            return results if results else None
        except Exception as e:
            logger.debug("龙虎榜失败: %s", e)
            return None

    # ── 融资融券 ────────────────────────────────────────────────────

    def margin_trade(self, code: str) -> Optional[List[MarginTrade]]:
        try:
            c = code.strip().zfill(6)
            secid = resolve_secid(code)
            # 融资融券接口
            url = "https://push2.eastmoney.com/api/qt/stock/fflow/kline/get"
            params = {
                "secid": secid,
                "fields1": "f1,f2,f3,f4,f5",
                "fields2": "f51,f52,f53,f54,f55,f56,f57,f58,f59,f60,f61",
                "klt": "101",
                "lmt": "120",
            }
            resp = http_get(url, params=params, timeout=10)
            data = resp.json() if resp.status_code == 200 else {}
            klines_str = data.get("data", {}).get("klines") if data.get("data") else None
            if not klines_str:
                # 备用: 从 datacenter 获取
                dc_url = "https://datacenter-web.eastmoney.com/api/data/v1/get"
                dc_params = {
                    "reportName": "RPT_MARGIN_TRADE_DETAIL",
                    "columns": "ALL",
                    "filter": f'(SECURITY_CODE="{c}")',
                    "pageNumber": 1, "pageSize": 60,
                    "sortTypes": -1, "sortColumns": "TRADE_DATE",
                }
                try:
                    dc_resp = http_get(dc_url, params=dc_params, timeout=10)
                    dc_data = dc_resp.json() if dc_resp.status_code == 200 else {}
                    items = dc_data.get("result", {}).get("data", []) or dc_data.get("data", {}).get("list", [])
                    if items:
                        results = []
                        for item in items:
                            results.append(MarginTrade(
                                code=c,
                                date=str(item.get("TRADE_DATE", ""))[:10],
                                margin_balance=vfloat(item.get("MARGIN_BALANCE")),
                                margin_buy=vfloat(item.get("MARGIN_BUY")),
                                margin_net=vfloat(item.get("MARGIN_NET")),
                                short_balance=vfloat(item.get("SHORT_BALANCE")),
                            ))
                        return results if results else None
                except Exception:
                    pass
                return None

            results = []
            for line in klines_str.split(";"):
                parts = line.split(",")
                if len(parts) < 6:
                    continue
                results.append(MarginTrade(
                    code=c,
                    date=parts[0],
                    margin_balance=vfloat(parts[1]),
                    margin_buy=vfloat(parts[2]),
                    margin_refund=vfloat(parts[3]),
                    short_balance=vfloat(parts[4]),
                    short_sell=vfloat(parts[5]) if len(parts) > 5 else None,
                ))
            return results if results else None
        except Exception as e:
            logger.debug("融资融券失败 [%s]: %s", code, e)
            return None

    # ── 分红送配 ────────────────────────────────────────────────────

    def dividend(self, code: str) -> Optional[List[Dividend]]:
        """从 datacenter 获取分红送配历史。"""
        try:
            c = code.strip().zfill(6)
            url = "https://datacenter-web.eastmoney.com/api/data/v1/get"
            params = {
                "reportName": "RPT_SHARE_DIVIDEND",
                "columns": "ALL",
                "filter": f'(SECURITY_CODE="{c}")',
                "pageNumber": 1, "pageSize": 20,
                "sortTypes": -1, "sortColumns": "ANN_DATE",
            }
            resp = http_get(url, params=params, timeout=10)
            data = resp.json() if resp.status_code == 200 else {}
            items = data.get("result", {}).get("data", []) or data.get("data", {}).get("list", [])
            if not items:
                return None

            results = []
            for item in items:
                results.append(Dividend(
                    code=c,
                    announcement_date=str(item.get("ANN_DATE", ""))[:10],
                    ex_date=str(item.get("EX_DATE", ""))[:10],
                    record_date=str(item.get("RECORD_DATE", ""))[:10],
                    cash_bonus=vfloat(item.get("CASH_BONUS", item.get("BONUS"))),
                    share_transfer=vfloat(item.get("SHARE_TRANSFER", item.get("TRANSFER"))),
                    rights_issue=vfloat(item.get("RIGHTS_ISSUE")),
                    rights_price=vfloat(item.get("RIGHTS_PRICE")),
                    bonus_total=vfloat(item.get("BONUS_TOTAL")),
                    year=str(item.get("YEAR", item.get("END_DATE", "")))[:10],
                ))
            return results if results else None
        except Exception as e:
            logger.debug("分红送配失败 [%s]: %s", code, e)
            return None

    # ── 资产负债表 ────────────────────────────────────────────────

    def balance_sheet(self, code: str, report_date: str = "") -> Optional[List[BalanceSheet]]:
        try:
            c = code.strip().zfill(6)
            url = "https://datacenter-web.eastmoney.com/api/data/v1/get"
            filter_str = f'(SECURITY_CODE="{c}")'
            if report_date:
                filter_str += f'(REPORT_DATE>="{report_date}")'
            params = {
                "reportName": "RPT_DMSK_FN_BALANCE",
                "columns": "ALL",
                "filter": filter_str,
                "pageNumber": 1, "pageSize": 8,
                "sortTypes": -1, "sortColumns": "REPORT_DATE",
            }
            resp = http_get(url, params=params, timeout=10)
            data = resp.json() if resp.status_code == 200 else {}
            items = data.get("result", {}).get("data", []) or data.get("data", {}).get("list", [])
            if not items:
                return None

            results = []
            for item in items:
                results.append(BalanceSheet(
                    code=c,
                    report_date=str(item.get("REPORT_DATE", ""))[:10],
                    report_type=item.get("REPORT_DATE_NAME", ""),
                    total_assets=vfloat(item.get("TOTAL_ASSETS", item.get("ASSETS_TOTAL"))),
                    total_liabilities=vfloat(item.get("TOTAL_LIABILITIES", item.get("LIABILITIES_TOTAL"))),
                    equity=vfloat(item.get("EQUITY", item.get("EQUITY_TOTAL"))),
                    current_assets=vfloat(item.get("CURRENT_ASSETS")),
                    non_current_assets=vfloat(item.get("NON_CURRENT_ASSETS")),
                    current_liabilities=vfloat(item.get("CURRENT_LIABILITIES")),
                    non_current_liabilities=vfloat(item.get("NON_CURRENT_LIABILITIES")),
                    cash=vfloat(item.get("CASH", item.get("MONETARY_CAPITAL"))),
                    accounts_receivable=vfloat(item.get("ACCOUNTS_RECEIVABLE")),
                    inventory=vfloat(item.get("INVENTORY")),
                    fixed_assets=vfloat(item.get("FIXED_ASSETS")),
                    intangible_assets=vfloat(item.get("INTANGIBLE_ASSETS")),
                    short_term_borrowing=vfloat(item.get("SHORT_TERM_BORROWING")),
                    long_term_borrowing=vfloat(item.get("LONG_TERM_BORROWING")),
                ))
            return results if results else None
        except Exception as e:
            logger.debug("资产负债表失败 [%s]: %s", code, e)
            return None

    # ── 利润表(详细) ──────────────────────────────────────────────

    def income_statement(self, code: str, report_date: str = "") -> Optional[List[IncomeStatement]]:
        try:
            c = code.strip().zfill(6)
            url = "https://datacenter-web.eastmoney.com/api/data/v1/get"
            filter_str = f'(SECURITY_CODE="{c}")'
            if report_date:
                filter_str += f'(REPORT_DATE>="{report_date}")'
            params = {
                "reportName": "RPT_LICO_FN_CPD",
                "columns": "ALL",
                "filter": filter_str,
                "pageNumber": 1, "pageSize": 8,
                "sortTypes": -1, "sortColumns": "REPORT_DATE",
            }
            resp = http_get(url, params=params, timeout=10)
            data = resp.json() if resp.status_code == 200 else {}
            items = data.get("result", {}).get("data", []) or data.get("data", {}).get("list", [])
            if not items:
                return None

            results = []
            for item in items:
                results.append(IncomeStatement(
                    code=c,
                    report_date=str(item.get("REPORT_DATE", ""))[:10],
                    report_type=item.get("REPORT_DATE_NAME", ""),
                    revenue=vfloat(item.get("OPERATE_INCOME", item.get("REVENUE"))),
                    cost=vfloat(item.get("OPERATE_COST", item.get("COST"))),
                    gross_profit=vfloat(item.get("GROSS_PROFIT")),
                    selling_expense=vfloat(item.get("SELLING_EXPENSE")),
                    admin_expense=vfloat(item.get("ADMIN_EXPENSE")),
                    rnd_expense=vfloat(item.get("RND_EXPENSE")),
                    finance_expense=vfloat(item.get("FINANCE_EXPENSE")),
                    operating_profit=vfloat(item.get("OPERATE_PROFIT")),
                    total_profit=vfloat(item.get("TOTAL_PROFIT")),
                    net_profit=vfloat(item.get("NET_PROFIT")),
                    net_profit_parent=vfloat(item.get("NET_PROFIT_PARENT")),
                    eps_basic=vfloat(item.get("BASIC_EPS")),
                    eps_diluted=vfloat(item.get("DILUTED_EPS")),
                ))
            return results if results else None
        except Exception as e:
            logger.debug("利润表失败 [%s]: %s", code, e)
            return None

    # ── 现金流量表 ────────────────────────────────────────────────

    def cash_flow(self, code: str, report_date: str = "") -> Optional[List[CashFlow]]:
        try:
            c = code.strip().zfill(6)
            url = "https://datacenter-web.eastmoney.com/api/data/v1/get"
            filter_str = f'(SECURITY_CODE="{c}")'
            if report_date:
                filter_str += f'(REPORT_DATE>="{report_date}")'
            params = {
                "reportName": "RPT_CASHFLOW",
                "columns": "ALL",
                "filter": filter_str,
                "pageNumber": 1, "pageSize": 8,
                "sortTypes": -1, "sortColumns": "REPORT_DATE",
            }
            resp = http_get(url, params=params, timeout=10)
            data = resp.json() if resp.status_code == 200 else {}
            items = data.get("result", {}).get("data", []) or data.get("data", {}).get("list", [])
            if not items:
                return None

            results = []
            for item in items:
                results.append(CashFlow(
                    code=c,
                    report_date=str(item.get("REPORT_DATE", ""))[:10],
                    report_type=str(item.get("REPORT_DATE_NAME", "")),
                    operating_net_cash=vfloat(item.get("OPERATE_NET_CASH")),
                    investing_net_cash=vfloat(item.get("INVEST_NET_CASH")),
                    financing_net_cash=vfloat(item.get("FINANCE_NET_CASH")),
                    operating_cash_inflow=vfloat(item.get("OPERATE_CASH_INFLOW")),
                    operating_cash_outflow=vfloat(item.get("OPERATE_CASH_OUTFLOW")),
                    investing_cash_inflow=vfloat(item.get("INVEST_CASH_INFLOW")),
                    investing_cash_outflow=vfloat(item.get("INVEST_CASH_OUTFLOW")),
                    financing_cash_inflow=vfloat(item.get("FINANCE_CASH_INFLOW")),
                    financing_cash_outflow=vfloat(item.get("FINANCE_CASH_OUTFLOW")),
                    net_cash_change=vfloat(item.get("NET_CASH_CHANGE")),
                    free_cash_flow=vfloat(item.get("FREE_CASH_FLOW")),
                ))
            return results if results else None
        except Exception as e:
            logger.debug("现金流量表失败 [%s]: %s", code, e)
            return None

    # ── 机构持仓 ──────────────────────────────────────────────────

    def inst_holding(self, code: str) -> Optional[List[InstitutionalHolding]]:
        try:
            c = code.strip().zfill(6)
            url = "https://datacenter-web.eastmoney.com/api/data/v1/get"
            params = {
                "reportName": "RPT_INST_HOLDING",
                "columns": "ALL",
                "filter": f'(SECURITY_CODE="{c}")',
                "pageNumber": 1, "pageSize": 30,
                "sortTypes": -1, "sortColumns": "END_DATE",
            }
            resp = http_get(url, params=params, timeout=10)
            data = resp.json() if resp.status_code == 200 else {}
            items = data.get("result", {}).get("data", []) or data.get("data", {}).get("list", [])
            if not items:
                return None

            results = []
            for item in items:
                results.append(InstitutionalHolding(
                    code=c,
                    report_date=str(item.get("END_DATE", ""))[:10],
                    institution_type=item.get("INST_TYPE", item.get("HOLDER_TYPE", "")),
                    shares_held=vfloat(item.get("HOLD_SHARES", item.get("SHARES_HELD"))),
                    share_pct=vfloat(item.get("HOLD_SHARES_PCT", item.get("SHARE_PCT"))),
                    market_value=vfloat(item.get("MARKET_VALUE")),
                    shares_change=vfloat(item.get("SHARES_CHANGE")),
                    institution_count=vint(item.get("INST_COUNT", item.get("HOLDER_COUNT"))),
                ))
            return results if results else None
        except Exception as e:
            logger.debug("机构持仓失败 [%s]: %s", code, e)
            return None

    # ── 大宗交易 ──────────────────────────────────────────────────

    def block_trade(self, code: str) -> Optional[List[BlockTrade]]:
        try:
            c = code.strip().zfill(6)
            url = "https://datacenter-web.eastmoney.com/api/data/v1/get"
            params = {
                "reportName": "RPT_BLOCK_TRADE",
                "columns": "ALL",
                "filter": f'(SECURITY_CODE="{c}")',
                "pageNumber": 1, "pageSize": 30,
                "sortTypes": -1, "sortColumns": "TRADE_DATE",
            }
            resp = http_get(url, params=params, timeout=10)
            data = resp.json() if resp.status_code == 200 else {}
            items = data.get("result", {}).get("data", []) or data.get("data", {}).get("list", [])
            if not items:
                return None

            results = []
            for item in items:
                results.append(BlockTrade(
                    code=c,
                    date=str(item.get("TRADE_DATE", ""))[:10],
                    name=item.get("SECURITY_NAME", ""),
                    price=vfloat(item.get("TRADE_PRICE")),
                    volume=vfloat(item.get("TRADE_VOLUME")),
                    amount=vfloat(item.get("TRADE_AMOUNT")),
                    premium_discount=vfloat(item.get("PREMIUM_DISCOUNT", item.get("DISCOUNT"))),
                    buyer=item.get("BUYER", ""),
                    seller=item.get("SELLER", ""),
                ))
            return results if results else None
        except Exception as e:
            logger.debug("大宗交易失败 [%s]: %s", code, e)
            return None

    # ── 限售解禁 ──────────────────────────────────────────────────

    def lockup_expiry(self, code: str) -> Optional[List[LockupExpiry]]:
        try:
            c = code.strip().zfill(6)
            url = "https://datacenter-web.eastmoney.com/api/data/v1/get"
            params = {
                "reportName": "RPT_LOCKUP_EXPIRY",
                "columns": "ALL",
                "filter": f'(SECURITY_CODE="{c}")',
                "pageNumber": 1, "pageSize": 20,
                "sortTypes": -1, "sortColumns": "UNLOCK_DATE",
            }
            resp = http_get(url, params=params, timeout=10)
            data = resp.json() if resp.status_code == 200 else {}
            items = data.get("result", {}).get("data", []) or data.get("data", {}).get("list", [])
            if not items:
                return None

            results = []
            for item in items:
                results.append(LockupExpiry(
                    code=c,
                    date=str(item.get("UNLOCK_DATE", ""))[:10],
                    name=item.get("SECURITY_NAME", ""),
                    shares_unlock=vfloat(item.get("UNLOCK_SHARES")),
                    share_pct=vfloat(item.get("UNLOCK_SHARES_PCT", item.get("SHARE_PCT"))),
                    market_value=vfloat(item.get("UNLOCK_MARKET_VALUE", item.get("MARKET_VALUE"))),
                    holder_type=item.get("HOLDER_TYPE", ""),
                ))
            return results if results else None
        except Exception as e:
            logger.debug("限售解禁失败 [%s]: %s", code, e)
            return None

    # ── 股权质押 ──────────────────────────────────────────────────

    def share_pledge(self, code: str) -> Optional[List[SharePledge]]:
        try:
            c = code.strip().zfill(6)
            url = "https://datacenter-web.eastmoney.com/api/data/v1/get"
            params = {
                "reportName": "RPT_SHARE_PLEDGE",
                "columns": "ALL",
                "filter": f'(SECURITY_CODE="{c}")',
                "pageNumber": 1, "pageSize": 20,
                "sortTypes": -1, "sortColumns": "PLEDGE_DATE",
            }
            resp = http_get(url, params=params, timeout=10)
            data = resp.json() if resp.status_code == 200 else {}
            items = data.get("result", {}).get("data", []) or data.get("data", {}).get("list", [])
            if not items:
                return None

            results = []
            for item in items:
                results.append(SharePledge(
                    code=c,
                    date=str(item.get("PLEDGE_DATE", ""))[:10],
                    pledger=item.get("PLEDGER", ""),
                    pledgee=item.get("PLEDGEE", ""),
                    shares_pledged=vfloat(item.get("PLEDGE_SHARES")),
                    share_pct=vfloat(item.get("PLEDGE_SHARES_PCT", item.get("SHARE_PCT"))),
                    pledge_date=str(item.get("PLEDGE_DATE", ""))[:10],
                    release_date=str(item.get("RELEASE_DATE", ""))[:10],
                    status=item.get("STATUS", ""),
                ))
            return results if results else None
        except Exception as e:
            logger.debug("股权质押失败 [%s]: %s", code, e)
            return None

    # ── 日内分时 ──────────────────────────────────────────────────

    def intraday_tick(self, code: str, date: str = "") -> Optional[List[IntradayTick]]:
        """使用东财分钟K线接口获取当日分时数据。"""
        try:
            c = code.strip().zfill(6)
            secid = resolve_secid(code)
            url = "https://push2his.eastmoney.com/api/qt/stock/kline/get"
            params = {
                "secid": secid,
                "fields1": "f1,f2,f3",
                "fields2": "f51,f52,f53,f54,f55,f56,f57",
                "klt": "1",       # 1分钟
                "fqt": "1",
                "lmt": "240",
            }
            if date:
                params["beg"] = date.replace("-", "")
                params["end"] = date.replace("-", "")

            resp = http_get(url, params=params, timeout=10)
            data = resp.json() if resp.status_code == 200 else {}
            klines_str = data.get("data", {}).get("klines") if data.get("data") else None
            if not klines_str:
                return None

            results = []
            for line in klines_str.split(";"):
                parts = line.split(",")
                if len(parts) < 7:
                    continue
                results.append(IntradayTick(
                    code=c,
                    time=parts[0][-5:] if len(parts[0]) > 5 else parts[0],  # "09:31"
                    price=vfloat(parts[2]),
                    volume=vfloat(parts[5]),
                    amount=vfloat(parts[6]),
                    change_pct=vfloat(parts[8]) if len(parts) > 8 else None,
                ))
            return results if results else None
        except Exception as e:
            logger.debug("日内分时失败 [%s]: %s", code, e)
            return None

    # ── 全市场股票列表 ────────────────────────────────────────────

    def stock_list(self, market: str = "all") -> Optional[List[StockListItem]]:
        """从东财 push API 获取全市场股票列表。"""
        try:
            url = "https://push2.eastmoney.com/api/qt/clist/get"
            # 市场过滤: all / sh / sz
            fs_map = {
                "sh": "m:1+t:2,m:1+t:23",
                "sz": "m:0+t:6,m:0+t:80",
                "bj": "m:0+t:81+s:2048",
            }
            fs = fs_map.get(market, "m:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23,m:0+t:81+s:2048")
            params = {
                "pn": "1", "pz": "6000",
                "po": "1", "np": "1",
                "fields": "f12,f14,f100,f9,f20",
                "fltt": "2", "invt": "2",
                "fs": fs,
            }
            resp = http_get(url, params=params, timeout=15)
            data = resp.json() if resp.status_code == 200 else {}
            items = data.get("data", {}).get("diff", []) if data.get("data") else []
            if not items:
                return None

            results = []
            for item in items:
                code = item.get("f12", "")
                results.append(StockListItem(
                    code=code,
                    name=item.get("f14", ""),
                    market="SH" if code.startswith(("6","9")) else "SZ" if code else "",
                    industry=item.get("f100", ""),
                    total_market_cap=vfloat(item.get("f20")),
                    total_shares=vfloat(item.get("f9")),
                ))
            return results if results else None
        except Exception as e:
            logger.debug("全市场股票列表失败: %s", e)
            return None

    # ── 指数/板块成分股 ──────────────────────────────────────────

    def index_constituents(self, index_code: str) -> Optional[List[IndexConstituent]]:
        """获取指数成分股。"""
        try:
            sid = resolve_secid(index_code)
            url = "https://push2.eastmoney.com/api/qt/slist/get"
            params = {
                "fltt": "2", "invt": "2",
                "fields": "f12,f14,f100,f3",
                "type": "3",
                "secids": sid,
            }
            resp = http_get(url, params=params, timeout=10)
            data = resp.json() if resp.status_code == 200 else {}
            items = data.get("data", {}).get("diff", []) if data.get("data") else []
            if not items:
                return None

            results = []
            for item in items:
                results.append(IndexConstituent(
                    index_code=index_code,
                    stock_code=item.get("f12", ""),
                    stock_name=item.get("f14", ""),
                    industry=item.get("f100", ""),
                    weight=vfloat(item.get("f3")),
                ))
            return results if results else None
        except Exception as e:
            logger.debug("指数成分股失败 [%s]: %s", index_code, e)
            return None

    # ── 高管持股变动 ──────────────────────────────────────────────

    def insider_trade(self, code: str) -> Optional[List[InsiderTrade]]:
        try:
            c = code.strip().zfill(6)
            url = "https://datacenter-web.eastmoney.com/api/data/v1/get"
            params = {
                "reportName": "RPT_INSIDER_TRADE",
                "columns": "ALL",
                "filter": f'(SECURITY_CODE="{c}")',
                "pageNumber": 1, "pageSize": 30,
                "sortTypes": -1, "sortColumns": "CHANGE_DATE",
            }
            resp = http_get(url, params=params, timeout=10)
            data = resp.json() if resp.status_code == 200 else {}
            items = data.get("result", {}).get("data", []) or data.get("data", {}).get("list", [])
            if not items:
                return None

            results = []
            for item in items:
                chg_type = item.get("CHANGE_TYPE", "")
                results.append(InsiderTrade(
                    code=c,
                    date=str(item.get("CHANGE_DATE", ""))[:10],
                    name=item.get("PERSON_NAME", ""),
                    position=item.get("POSITION", ""),
                    change_type=chg_type,
                    shares_changed=vfloat(item.get("CHANGE_SHARES")),
                    shares_after=vfloat(item.get("SHARES_AFTER")),
                    price=vfloat(item.get("CHANGE_PRICE")),
                ))
            return results if results else None
        except Exception as e:
            logger.debug("高管持股变动失败 [%s]: %s", code, e)
            return None

    # ── 业绩预告 ──────────────────────────────────────────────────

    def perf_forecast(self, code: str) -> Optional[List[PerformanceForecast]]:
        try:
            c = code.strip().zfill(6)
            url = "https://datacenter-web.eastmoney.com/api/data/v1/get"
            params = {
                "reportName": "RPT_PERFORMCE_FORECAST",
                "columns": "ALL",
                "filter": f'(SECURITY_CODE="{c}")',
                "pageNumber": 1, "pageSize": 10,
                "sortTypes": -1, "sortColumns": "ANN_DATE",
            }
            resp = http_get(url, params=params, timeout=10)
            data = resp.json() if resp.status_code == 200 else {}
            items = data.get("result", {}).get("data", []) or data.get("data", {}).get("list", [])
            if not items:
                return None

            results = []
            for item in items:
                results.append(PerformanceForecast(
                    code=c,
                    report_date=str(item.get("REPORT_DATE", ""))[:10],
                    forecast_type=item.get("FORECAST_TYPE", ""),
                    profit_lower=vfloat(item.get("PROFIT_LOWER", item.get("NET_PROFIT_LOWER"))),
                    profit_upper=vfloat(item.get("PROFIT_UPPER", item.get("NET_PROFIT_UPPER"))),
                    change_lower=vfloat(item.get("CHANGE_LOWER")),
                    change_upper=vfloat(item.get("CHANGE_UPPER")),
                    announcement_date=str(item.get("ANN_DATE", ""))[:10],
                    summary=item.get("SUMMARY", item.get("CHANGE_REASON", "")),
                ))
            return results if results else None
        except Exception as e:
            logger.debug("业绩预告失败 [%s]: %s", code, e)
            return None

    # ── 交易日历 ──────────────────────────────────────────────────

    def trade_calendar(self, year: int = 0) -> Optional[List[TradeCalendar]]:
        """从东财获取交易日历。"""
        try:
            url = "https://datacenter-web.eastmoney.com/api/data/v1/get"
            y = year if year > 0 else 2026
            params = {
                "reportName": "RPT_TRADE_CALENDAR",
                "columns": "ALL",
                "filter": f'(YEAR={y})',
                "pageNumber": 1, "pageSize": 400,
                "sortTypes": 1, "sortColumns": "CALENDAR_DATE",
            }
            resp = http_get(url, params=params, timeout=10)
            data = resp.json() if resp.status_code == 200 else {}
            items = data.get("result", {}).get("data", []) or data.get("data", {}).get("list", [])
            if not items:
                return None

            results = []
            for item in items:
                is_open = item.get("IS_OPEN", "1")
                results.append(TradeCalendar(
                    date=str(item.get("CALENDAR_DATE", ""))[:10],
                    is_trading_day=str(is_open) == "1",
                    day_type=item.get("DAY_TYPE", ""),
                    market="A",
                ))
            return results if results else None
        except Exception as e:
            logger.debug("交易日历失败: %s", e)
            return None

    # ══════════════════════════════════════════════════════════════════
    # 第四批 — 交易衍生/公司深度/跨市场/宏观
    # ══════════════════════════════════════════════════════════════════

    # ── 涨停跌停 ────────────────────────────────────────────────────

    def limit_updown(self, date: str = "") -> Optional[List[LimitUpDown]]:
        """从东财 push2 获取涨停跌停数据。

        通过查询条件筛选涨幅>9.8%(涨停)和跌幅<-9.8%(跌停)的股票。
        """
        try:
            url = "https://push2.eastmoney.com/api/qt/clist/get"
            results = []

            for lt, fs_filter, reason_prefix in [
                ("涨停", "m:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23+f:50", "涨停"),
                ("跌停", "m:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23+f:51", "跌停"),
                ("炸板", "m:0+t:6,m:0+t:80,m:1+t:2,m:1+t:23+f:70", "曾涨停"),
            ]:
                params = {
                    "pn": "1", "pz": "100",
                    "po": "1", "np": "1",
                    "fields": "f12,f14,f2,f3,f4,f62,f184,f168,f9,f20",
                    "fltt": "2", "invt": "2",
                    "fs": fs_filter,
                }
                try:
                    resp = http_get(url, params=params, timeout=10)
                    data = resp.json() if resp.status_code == 200 else {}
                    items = data.get("data", {}).get("diff", []) if data.get("data") else []
                    for item in items:
                        results.append(LimitUpDown(
                            code=item.get("f12", ""),
                            date=date or "",
                            name=item.get("f14", ""),
                            limit_type=lt,
                            price=vfloat(item.get("f2")),
                            change_pct=vfloat(item.get("f3")),
                            block_amount=vfloat(item.get("f62")) if lt != "跌停" else None,
                            block_ratio=vfloat(item.get("f184")) if lt != "跌停" else None,
                            turnover_rate=vfloat(item.get("f168")),
                        ))
                except Exception as e:
                    logger.debug("涨跌停查询[%s]失败: %s", lt, e)
                    continue

            return results if results else None
        except Exception as e:
            logger.debug("涨停跌停失败: %s", e)
            return None

    # ── 市场情绪 ────────────────────────────────────────────────────

    def market_breadth(self, date: str = "") -> Optional[List[MarketBreadth]]:
        """从东财获取市场情绪/涨跌家数。"""
        try:
            url = "https://push2.eastmoney.com/api/qt/clist/get"
            # 全市场统计
            sh_params = {"pn": "1", "pz": "9999", "po": "0", "np": "1",
                         "fields": "f2,f3,f4,f8,f20",
                         "fltt": "2", "invt": "2",
                         "fs": "m:1+t:2,m:1+t:23"}
            sz_params = {"pn": "1", "pz": "9999", "po": "0", "np": "1",
                         "fields": "f2,f3,f4,f8,f20",
                         "fltt": "2", "invt": "2",
                         "fs": "m:0+t:6,m:0+t:80"}

            advance = decline = flat = limit_up = limit_down = 0
            total_vol = total_amt = 0.0

            for mkt_params in [sh_params, sz_params]:
                try:
                    resp = http_get(url, params=mkt_params, timeout=10)
                    data = resp.json() if resp.status_code == 200 else {}
                    items = data.get("data", {}).get("diff", []) if data.get("data") else []
                    for item in items:
                        chg = vfloat(item.get("f3"))
                        vol = vfloat(item.get("f8")) or 0
                        amt = vfloat(item.get("f20")) or 0
                        total_vol += vol
                        total_amt += amt
                        if chg is None:
                            flat += 1
                        elif chg > 9.5:
                            limit_up += 1
                            advance += 1
                        elif chg < -9.5:
                            limit_down += 1
                            decline += 1
                        elif chg > 0:
                            advance += 1
                        elif chg < 0:
                            decline += 1
                        else:
                            flat += 1
                except Exception:
                    continue

            return [MarketBreadth(
                date=date or "",
                advance=advance, decline=decline, flat=flat,
                limit_up=limit_up, limit_down=limit_down,
                total_amount=total_amt, total_volume=total_vol,
            )]
        except Exception as e:
            logger.debug("市场情绪失败: %s", e)
            return None

    # ── 新股/IPO ──────────────────────────────────────────────────

    def ipo_data(self) -> Optional[List[IPOData]]:
        """从东财获取新股/IPO数据。"""
        try:
            url = "https://datacenter-web.eastmoney.com/api/data/v1/get"
            params = {
                "reportName": "RPT_IPO_RECENTLY",
                "columns": "ALL",
                "pageNumber": 1, "pageSize": 30,
                "sortTypes": -1, "sortColumns": "LISTING_DATE",
            }
            resp = http_get(url, params=params, timeout=10)
            data = resp.json() if resp.status_code == 200 else {}
            items = data.get("result", {}).get("data", []) or data.get("data", {}).get("list", [])
            if not items:
                return None

            results = []
            for item in items:
                results.append(IPOData(
                    code=item.get("SECURITY_CODE", ""),
                    name=item.get("SECURITY_NAME", ""),
                    issue_date=str(item.get("ISSUE_DATE", ""))[:10],
                    listing_date=str(item.get("LISTING_DATE", ""))[:10],
                    issue_price=vfloat(item.get("ISSUE_PRICE")),
                    issue_pe=vfloat(item.get("ISSUE_PE")),
                    lottery_rate=vfloat(item.get("LOTTERY_RATE")),
                    first_day_return=vfloat(item.get("FIRST_DAY_RETURN")),
                    subscription_amount=vfloat(item.get("SUBSCRIPTION_AMOUNT")),
                    industry=item.get("INDUSTRY", ""),
                    board=item.get("BOARD", ""),
                    status=item.get("STATUS", ""),
                ))
            return results if results else None
        except Exception as e:
            logger.debug("新股IPO失败: %s", e)
            return None

    # ── 可转债 ────────────────────────────────────────────────────

    def convertible_bonds(self) -> Optional[List[ConvertibleBond]]:
        """从东财获取可转债数据。"""
        try:
            url = "https://push2.eastmoney.com/api/qt/clist/get"
            params = {
                "pn": "1", "pz": "500",
                "po": "1", "np": "1",
                "fields": "f12,f14,f2,f3,f4,f5,f6,f7,f8,f9,f20,f37,f38,f39,f40,f41,f42,f43,f44,f100,f111,f112,f113,f114,f115,f116,f117,f118,f119,f120,f121,f122,f123,f124,f125,f126,f127,f128,f129,f130",
                "fltt": "2", "invt": "2",
                "fs": "b:MK0101",
            }
            resp = http_get(url, params=params, timeout=10)
            data = resp.json() if resp.status_code == 200 else {}
            items = data.get("data", {}).get("diff", []) if data.get("data") else []
            if not items:
                return None

            results = []
            for item in items:
                results.append(ConvertibleBond(
                    bond_code=item.get("f12", ""),
                    bond_name=item.get("f14", ""),
                    stock_code=item.get("f37", ""),
                    stock_name=item.get("f38", ""),
                    bond_price=vfloat(item.get("f2")),
                    stock_price=vfloat(item.get("f3")),
                    premium_ratio=vfloat(item.get("f39")),
                    conversion_price=vfloat(item.get("f40")),
                    pure_bond_value=vfloat(item.get("f41")),
                    ytm=vfloat(item.get("f42")),
                    remaining_size=vfloat(item.get("f43")),
                    rating=item.get("f100", ""),
                    bond_type=item.get("f44", ""),
                ))
            return results if results else None
        except Exception as e:
            logger.debug("可转债失败: %s", e)
            return None

    # ── ETF数据 ──────────────────────────────────────────────────

    def etf_data(self, etf_code: str = "") -> Optional[List[ETFData]]:
        """从东财获取ETF数据。"""
        try:
            url = "https://push2.eastmoney.com/api/qt/clist/get"
            fs = f'f12="{etf_code}"' if etf_code else "b:MK0021,b:MK0022,b:MK0023"
            params = {
                "pn": "1", "pz": "200",
                "po": "1", "np": "1",
                "fields": "f12,f14,f2,f3,f4,f5,f6,f7,f8,f9,f20,f23,f24,f37,f38,f39,f40,f41,f42,f43,f44,f45,f46,f47,f48,f49,f50,f115,f116,f117,f118,f119,f120",
                "fltt": "2", "invt": "2",
                "fs": fs,
            }
            resp = http_get(url, params=params, timeout=10)
            data = resp.json() if resp.status_code == 200 else {}
            items = data.get("data", {}).get("diff", []) if data.get("data") else []
            if not items:
                return None

            results = []
            for item in items:
                results.append(ETFData(
                    etf_code=item.get("f12", ""),
                    etf_name=item.get("f14", ""),
                    nav=vfloat(item.get("f23")),
                    price=vfloat(item.get("f2")),
                    premium_discount=vfloat(item.get("f24")),
                    tracking_index=item.get("f38", ""),
                    scale=vfloat(item.get("f20")),
                    daily_volume=vfloat(item.get("f8")),
                    daily_amount=vfloat(item.get("f9")),
                    established_date=str(item.get("f39", ""))[:10],
                    fund_manager=item.get("f40", ""),
                ))
            return results if results else None
        except Exception as e:
            logger.debug("ETF数据失败: %s", e)
            return None

    # ── 管理层信息 ──────────────────────────────────────────────

    def manager_info(self, code: str) -> Optional[List[ManagerInfo]]:
        """从东财获取公司管理层信息。"""
        try:
            c = code.strip().zfill(6)
            url = "https://datacenter-web.eastmoney.com/api/data/v1/get"
            params = {
                "reportName": "RPT_MANAGER_INFO",
                "columns": "ALL",
                "filter": f'(SECURITY_CODE="{c}")',
                "pageNumber": 1, "pageSize": 30,
                "sortTypes": 1, "sortColumns": "SORT",
            }
            resp = http_get(url, params=params, timeout=10)
            data = resp.json() if resp.status_code == 200 else {}
            items = data.get("result", {}).get("data", []) or data.get("data", {}).get("list", [])
            if not items:
                return None

            results = []
            for item in items:
                results.append(ManagerInfo(
                    code=c,
                    name=item.get("PERSON_NAME", ""),
                    position=item.get("POSITION", ""),
                    gender=item.get("GENDER", ""),
                    age=vint(item.get("AGE")),
                    education=item.get("EDUCATION", ""),
                    background=item.get("BACKGROUND", ""),
                    compensation=vfloat(item.get("COMPENSATION")),
                    shares_held=vfloat(item.get("SHARES_HELD")),
                    start_date=str(item.get("START_DATE", ""))[:10],
                ))
            return results if results else None
        except Exception as e:
            logger.debug("管理层信息失败 [%s]: %s", code, e)
            return None

    # ── 股东增减持计划 ──────────────────────────────────────────

    def shareholder_plans(self, code: str) -> Optional[List[ShareholderPlan]]:
        try:
            c = code.strip().zfill(6)
            url = "https://datacenter-web.eastmoney.com/api/data/v1/get"
            params = {
                "reportName": "RPT_SHAREHOLDER_PLAN",
                "columns": "ALL",
                "filter": f'(SECURITY_CODE="{c}")',
                "pageNumber": 1, "pageSize": 20,
                "sortTypes": -1, "sortColumns": "ANN_DATE",
            }
            resp = http_get(url, params=params, timeout=10)
            data = resp.json() if resp.status_code == 200 else {}
            items = data.get("result", {}).get("data", []) or data.get("data", {}).get("list", [])
            if not items:
                return None

            results = []
            for item in items:
                results.append(ShareholderPlan(
                    code=c,
                    announcement_date=str(item.get("ANN_DATE", ""))[:10],
                    shareholder_name=item.get("SHAREHOLDER_NAME", ""),
                    plan_type=item.get("PLAN_TYPE", ""),
                    planned_shares=vfloat(item.get("PLAN_SHARES")),
                    planned_pct=vfloat(item.get("PLAN_SHARES_PCT")),
                    price_range=item.get("PRICE_RANGE", ""),
                    deadline=str(item.get("DEADLINE", ""))[:10],
                    completed_shares=vfloat(item.get("COMPLETED_SHARES")),
                    completed_pct=vfloat(item.get("COMPLETED_PCT")),
                    status=item.get("STATUS", ""),
                ))
            return results if results else None
        except Exception as e:
            logger.debug("股东增减持计划失败 [%s]: %s", code, e)
            return None

    # ── 股票回购 ────────────────────────────────────────────────

    def buyback(self, code: str) -> Optional[List[ShareBuyback]]:
        try:
            c = code.strip().zfill(6)
            url = "https://datacenter-web.eastmoney.com/api/data/v1/get"
            params = {
                "reportName": "RPT_BUYBACK",
                "columns": "ALL",
                "filter": f'(SECURITY_CODE="{c}")',
                "pageNumber": 1, "pageSize": 10,
                "sortTypes": -1, "sortColumns": "ANN_DATE",
            }
            resp = http_get(url, params=params, timeout=10)
            data = resp.json() if resp.status_code == 200 else {}
            items = data.get("result", {}).get("data", []) or data.get("data", {}).get("list", [])
            if not items:
                return None

            results = []
            for item in items:
                results.append(ShareBuyback(
                    code=c,
                    announcement_date=str(item.get("ANN_DATE", ""))[:10],
                    planned_amount_lower=vfloat(item.get("PLAN_AMOUNT_LOWER")),
                    planned_amount_upper=vfloat(item.get("PLAN_AMOUNT_UPPER")),
                    planned_shares=vfloat(item.get("PLAN_SHARES")),
                    planned_pct=vfloat(item.get("PLAN_SHARES_PCT")),
                    price_limit=vfloat(item.get("PRICE_LIMIT")),
                    completed_amount=vfloat(item.get("COMPLETED_AMOUNT")),
                    completed_shares=vfloat(item.get("COMPLETED_SHARES")),
                    progress=vfloat(item.get("PROGRESS")),
                    purpose=item.get("PURPOSE", ""),
                    status=item.get("STATUS", ""),
                    deadline=str(item.get("DEADLINE", ""))[:10],
                ))
            return results if results else None
        except Exception as e:
            logger.debug("股票回购失败 [%s]: %s", code, e)
            return None

    # ── 全球指数 ────────────────────────────────────────────────

    def global_index(self, code: str = "") -> Optional[List[GlobalIndex]]:
        """从东财获取全球指数行情。"""
        try:
            url = "https://push2.eastmoney.com/api/qt/clist/get"
            fs_map = {
                "dji": "m:128+f:100", "spx": "m:128+f:101",
                "ixic": "m:128+f:105", "hsi": "m:128+f:40",
                "n225": "m:128+f:99", "": "m:128+t:3",
            }
            fs = fs_map.get(code, fs_map.get("", "m:128+t:3"))
            params = {
                "pn": "1", "pz": "20",
                "po": "1", "np": "1",
                "fields": "f12,f14,f2,f3,f4,f5,f6,f7,f15,f16,f17,f18,f19,f20",
                "fltt": "2", "invt": "2",
                "fs": fs,
            }
            resp = http_get(url, params=params, timeout=10)
            data = resp.json() if resp.status_code == 200 else {}
            items = data.get("data", {}).get("diff", []) if data.get("data") else []
            if not items:
                return None

            market_map = {
                "dji": "US", "spx": "US", "ixic": "US",
                "hsi": "HK", "n225": "JP",
            }
            results = []
            for item in items:
                results.append(GlobalIndex(
                    code=item.get("f12", ""),
                    name=item.get("f14", ""),
                    market=market_map.get(code.lower(), "Global") if code else "Global",
                    price=vfloat(item.get("f2")),
                    change=vfloat(item.get("f4")),
                    change_pct=vfloat(item.get("f3")),
                    open=vfloat(item.get("f5")),
                    high=vfloat(item.get("f6")),
                    low=vfloat(item.get("f7")),
                    pre_close=vfloat(item.get("f15")),
                ))
            return results if results else None
        except Exception as e:
            logger.debug("全球指数失败: %s", e)
            return None

    # ── 汇率 ────────────────────────────────────────────────────

    def exchange_rate(self, pair: str = "") -> Optional[List[ExchangeRate]]:
        """从东财获取汇率数据。"""
        try:
            url = "https://push2.eastmoney.com/api/qt/clist/get"
            params = {
                "pn": "1", "pz": "20",
                "po": "1", "np": "1",
                "fields": "f12,f14,f2,f3,f4",
                "fltt": "2", "invt": "2",
                "fs": "m:128+t:6",
            }
            resp = http_get(url, params=params, timeout=10)
            data = resp.json() if resp.status_code == 200 else {}
            items = data.get("data", {}).get("diff", []) if data.get("data") else []
            if not items:
                return None

            results = []
            for item in items:
                code_raw = item.get("f12", "")
                pair_name = item.get("f14", "")
                if pair and pair.upper() not in code_raw.upper() and pair.upper() not in pair_name.upper():
                    continue
                results.append(ExchangeRate(
                    currency_pair=code_raw,
                    rate=vfloat(item.get("f2")),
                    change_pct=vfloat(item.get("f3")),
                ))
            return results if results else None
        except Exception as e:
            logger.debug("汇率失败: %s", e)
            return None

    # ── 宏观经济指标 ────────────────────────────────────────────

    def macro_indicator(self, indicator: str = "") -> Optional[List[MacroIndicator]]:
        """从东财获取宏观经济指标。"""
        try:
            url = "https://datacenter-web.eastmoney.com/api/data/v1/get"
            # 常见的宏观指标报告名映射
            report_map = {
                "GDP": "RPT_MACRO_GDP",
                "CPI": "RPT_MACRO_CPI",
                "PPI": "RPT_MACRO_PPI",
                "PMI": "RPT_MACRO_PMI",
                "M2":  "RPT_MACRO_M2",
                "社融": "RPT_MACRO_SOCIAL_FINANCING",
                "外汇": "RPT_MACRO_FOREIGN_RESERVE",
            }
            results = []

            targets = [indicator] if indicator else ["GDP", "CPI", "PPI", "PMI", "M2"]
            for ind in targets:
                rpt = report_map.get(ind, f"RPT_MACRO_{ind}")
                params = {
                    "reportName": rpt,
                    "columns": "ALL",
                    "pageNumber": 1, "pageSize": 5,
                    "sortTypes": -1, "sortColumns": "REPORT_DATE",
                }
                try:
                    resp = http_get(url, params=params, timeout=10)
                    data = resp.json() if resp.status_code == 200 else {}
                    items = data.get("result", {}).get("data", []) or data.get("data", {}).get("list", [])
                    for item in (items or []):
                        results.append(MacroIndicator(
                            indicator_name=ind,
                            date=str(item.get("REPORT_DATE", ""))[:7],
                            value=vfloat(item.get("VALUE")),
                            yoy_change=vfloat(item.get("YOY_CHANGE")),
                            mom_change=vfloat(item.get("MOM_CHANGE")),
                            unit=item.get("UNIT", ""),
                            source="eastmoney",
                        ))
                except Exception:
                    continue

            return results if results else None
        except Exception as e:
            logger.debug("宏观数据失败: %s", e)
            return None
