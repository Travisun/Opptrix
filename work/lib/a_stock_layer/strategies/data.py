"""
Data Layer — 统一数据采集层
===========================
整合 AshareEngine + efinance，对上游策略模块透明。
所有策略统一通过此模块获取数据。
"""
from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional, Tuple

import numpy as np
import pandas as pd

from a_stock_layer import AshareEngine
from a_stock_layer.core.schema import (
    StockKline, StockRealtime, MoneyFlow,
    TechnicalIndicator, SectorMoneyFlow,
)

logger = logging.getLogger("t_strategy.data")

# 缓存
_CACHE: Dict[str, Any] = {}
_kline_cache: Dict[str, Optional[pd.DataFrame]] = {}

_DEFAULT_KLINE_DAYS = 120


def _fetch_kline_efinance(code: str, klt: int = 101, limit: int = 120) -> Optional[pd.DataFrame]:
    """efinance 获取 K 线（缓存复用）。"""
    ck = f"{code}_{klt}_{limit}"
    if ck in _kline_cache:
        return _kline_cache[ck]
    try:
        import efinance as ef
        df = ef.stock.get_quote_history(code, klt=klt, fqt=1)
        if df is None or df.empty:
            return None
        cm = {"日期": "date", "开盘": "open", "收盘": "close", "最高": "high",
              "最低": "low", "成交量": "volume", "成交额": "amount",
              "涨跌幅": "change_pct", "换手率": "turnover_rate"}
        df = df.rename(columns=cm)
        df["date"] = pd.to_datetime(df["date"])
        df = df.sort_values("date").reset_index(drop=True)
        result = df.tail(limit).reset_index(drop=True).copy()
        _kline_cache[ck] = result
        return result
    except Exception as e:
        logger.debug("efinance %s fail: %s", code, e)
        return None


def fetch_kline(engine: AshareEngine, code: str,
                period: str = "daily", limit: int = 120) -> Optional[pd.DataFrame]:
    """获取 K 线（优先 efinance，回退引擎）。"""
    klt_map = {"daily": 101, "weekly": 102, "monthly": 103,
               "60m": 60, "30m": 30, "15m": 15, "5m": 5, "1m": 1}
    klt = klt_map.get(period, 101)

    # 1) efinance
    df = _fetch_kline_efinance(code, klt, limit)
    if df is not None:
        return df

    # 2) 引擎
    try:
        r = engine.kline(code, period=period, as_df=False)
        if r.success and r.data:
            rows = []
            for item in r.data:
                if hasattr(item, 'date'):
                    rows.append({
                        "date": pd.to_datetime(item.date),
                        "open": item.open, "close": item.close,
                        "high": item.high, "low": item.low,
                        "volume": item.volume, "amount": item.amount,
                    })
            if rows:
                df = pd.DataFrame(rows).sort_values("date").reset_index(drop=True)
                return df.tail(limit).reset_index(drop=True).copy()
    except Exception as e:
        logger.debug("引擎 kline %s fail: %s", code, e)

    return None


def fetch_realtime(engine: AshareEngine, code: str) -> Optional[StockRealtime]:
    """获取实时行情。"""
    try:
        r = engine.realtime(code)
        if r.success and r.data:
            return r.data[0]
    except Exception:
        pass
    return None


def fetch_money_flow(engine: AshareEngine, code: str) -> Optional[pd.DataFrame]:
    """获取资金流。"""
    try:
        mf = engine.money_flow(code, as_df=True)
        if isinstance(mf, pd.DataFrame) and not mf.empty:
            return mf
    except Exception:
        pass
    return None


def fetch_sector_flow(engine: AshareEngine, industry: str) -> Optional[dict]:
    """获取行业资金流。"""
    try:
        sf = engine.sector_money_flow("industry", as_df=True)
        if isinstance(sf, pd.DataFrame) and not sf.empty:
            m = sf[sf["sector_name"] == industry]
            if not m.empty:
                return m.iloc[0].to_dict()
    except Exception:
        pass
    return None


def fetch_market_breadth(engine: AshareEngine) -> Optional[dict]:
    """获取市场情绪。"""
    try:
        mb = engine.market_breadth(as_df=True)
        if isinstance(mb, pd.DataFrame) and not mb.empty:
            return mb.iloc[0].to_dict()
    except Exception:
        pass
    return None


def fetch_profile(engine: AshareEngine, code: str) -> Optional[dict]:
    """获取公司概况。"""
    try:
        pf = engine.profile(code)
        if pf.success and pf.data:
            p = pf.data[0]
            return {"industry": p.industry, "concepts": getattr(p, 'concepts', []), "name": p.name}
    except Exception:
        pass
    return None


def fetch_financials(engine: AshareEngine, code: str) -> Optional[pd.DataFrame]:
    """获取财报摘要。"""
    try:
        fs = engine.financials(code, as_df=True)
        if isinstance(fs, pd.DataFrame) and not fs.empty:
            return fs
    except Exception:
        pass
    return None


def fetch_index_realtime(engine: AshareEngine, code: str = "000001") -> Optional[float]:
    """获取大盘指数。"""
    try:
        r = engine.index_realtime(code)
        if r.success and r.data:
            return r.data[0].price
    except Exception:
        pass
    return None


def fetch_global_index(engine: AshareEngine, code: str = "dji") -> Optional[float]:
    """获取全球指数。"""
    try:
        r = engine.global_index(code)
        if r.success and r.data:
            return r.data[0].price
    except Exception:
        pass
    return None


def clear_cache():
    """清空所有缓存。"""
    _kline_cache.clear()
    _CACHE.clear()


# ── 全量数据采集（为信号引擎准备） ────────────────────────────────────

def gather_all(engine: AshareEngine, code: str) -> Dict[str, Any]:
    """采集分析单只股票所需的全部数据。"""
    data: Dict[str, Any] = {"code": code}

    # 1. 实时行情
    rt = fetch_realtime(engine, code)
    if rt:
        data["price"] = rt.price
        data["name"] = rt.name
        data["change_pct"] = rt.change_pct
        data["volume"] = rt.volume
        data["amount"] = rt.amount
        data["volume_ratio"] = rt.volume_ratio
        data["turnover_rate"] = rt.turnover_rate
        if hasattr(rt, 'pre_close'):
            data["pre_close"] = rt.pre_close

    # 2. K 线 + 技术指标
    kd = fetch_kline(engine, code, "daily", _DEFAULT_KLINE_DAYS)
    if kd is not None and len(kd) >= 30:
        data["kline_daily"] = kd
        # 用 indicators 模块计算全指标
        try:
            from .indicators import compute_all
            data["indicators"] = compute_all(kd)
        except Exception:
            pass

    # 3. 60分钟 K 线
    k60 = fetch_kline(engine, code, "60m", 60)
    if k60 is not None:
        data["kline_60m"] = k60

    # 4. 周 K 线
    kw = fetch_kline(engine, code, "weekly", 60)
    if kw is not None:
        data["kline_weekly"] = kw

    # 5. 资金流
    mf = fetch_money_flow(engine, code)
    if mf is not None:
        data["money_flow"] = mf

    # 6. 行业 + 市场
    pf = fetch_profile(engine, code)
    if pf:
        data["industry"] = pf.get("industry", "")
        data["concepts"] = pf.get("concepts", [])
        data["name"] = pf.get("name", data.get("name", ""))
        sf = fetch_sector_flow(engine, pf.get("industry", ""))
        if sf:
            data["sector_money_flow"] = sf

    mb = fetch_market_breadth(engine)
    if mb:
        data["market_breadth"] = mb

    # 7. 大盘
    sh = fetch_index_realtime(engine, "000001")
    if sh:
        data["sh_index"] = sh

    return data


print("✔ data.py 加载 — 统一数据采集层")
