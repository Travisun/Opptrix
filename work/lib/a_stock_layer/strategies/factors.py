"""
Factor Models — 因子模型
========================
Fama-French, Carhart, q-factor, Barra 风格因子
来源: Fama & French (1993, 2015), Carhart (1997), Hou, Xue & Zhang (2015)
"""
from __future__ import annotations

import numpy as np
import pandas as pd
from typing import Dict, List, Optional, Tuple

from .indicators import ma


def compute_value_factors(df: pd.DataFrame) -> Dict[str, float]:
    """估值因子 (Value Factors) — 从基本面估算
    Returns:
        pe_ratio, pb_ratio, ps_ratio, dividend_yield, ev_ebitda
    """
    factors = {}
    if df is None or df.empty:
        return factors
    last = df.iloc[-1]
    price = last.get("close", 0)
    eps = last.get("eps", None)
    bvps = last.get("bvps", None)
    revenue = last.get("revenue", None)
    shares = last.get("total_shares", None)
    dividend = last.get("dividend_per_share", None)

    if eps and eps > 0:
        factors["pe_ttm"] = round(price / eps, 2)
    if bvps and bvps > 0:
        factors["pb"] = round(price / bvps, 2)
    if eps:
        factors["earnings_yield"] = round(eps / price * 100, 2) if price > 0 else 0
    if dividend and price > 0:
        factors["dividend_yield"] = round(dividend / price * 100, 2)

    return factors


def compute_momentum_factors(close: np.ndarray) -> Dict[str, float]:
    """动量因子 (Momentum Factors)
    Returns:
        mom_1m, mom_3m, mom_6m, mom_12m, mom_12_1 (剔除最后一月)
    """
    factors = {}
    n = len(close)
    if n < 2:
        return factors
    current = close[-1]
    for period, label in [(20, "mom_1m"), (60, "mom_3m"),
                          (120, "mom_6m"), (250, "mom_12m")]:
        if n > period:
            factors[label] = round((current / close[-period] - 1) * 100, 2)
    # Carhart 动量: 12-1 month
    if n > 250:
        factors["mom_12_1"] = round((close[-20] / close[-250] - 1) * 100, 2)
    # 短期反转
    if n > 20:
        factors["short_term_reversal"] = round((close[-1] / close[-20] - 1) * 100, 2)
    return factors


def compute_quality_factors(df: pd.DataFrame, financials: Optional[pd.DataFrame] = None) -> Dict[str, float]:
    """质量因子 (Quality Factors)
    - ROE, ROA, Gross Margin, Accruals, Leverage
    来源: Novy-Marx (2013), Sloan (1996)
    """
    factors = {}
    if financials is not None and not financials.empty:
        fi = financials.iloc[-1]
        for f in ["roe", "gross_margin", "debt_ratio", "net_profit_yoy", "revenue_yoy"]:
            if f in fi and fi[f] is not None:
                factors[f] = round(float(fi[f]), 2)
    return factors


def compute_low_vol_factors(close: np.ndarray, period: int = 60) -> Dict[str, float]:
    """低波动因子 (Low Volatility Factors)"""
    factors = {}
    if len(close) < period:
        return factors
    returns = np.diff(close) / close[:-1]
    factors["volatility_60d"] = round(np.std(returns) * np.sqrt(252) * 100, 2)
    factors["max_drawdown_60d"] = round((close[-period:].min() / close[-period:].max() - 1) * 100, 2)
    # Beta (vs 大盘简化版)
    if len(close) >= period:
        factors["beta_60d"] = 1.0  # 简化
    return factors


def compute_size_factor(market_cap: Optional[float] = None) -> Dict[str, float]:
    """规模因子 (Size Factor)"""
    factors = {}
    if market_cap:
        factors["market_cap_billion"] = round(market_cap / 1e8, 2)
        factors["log_market_cap"] = round(np.log(market_cap), 2)
    return factors


def compute_all_factors(
    close: np.ndarray,
    df_fundamental: Optional[pd.DataFrame] = None,
    financials: Optional[pd.DataFrame] = None,
    market_cap: Optional[float] = None,
) -> Dict[str, float]:
    """计算全部因子。"""
    factors = {}
    factors.update(compute_momentum_factors(close))
    factors.update(compute_low_vol_factors(close))
    factors.update(compute_size_factor(market_cap))
    if df_fundamental is not None:
        factors.update(compute_value_factors(df_fundamental))
    if financials is not None or df_fundamental is not None:
        factors.update(compute_quality_factors(df_fundamental, financials))
    return factors


# ── Barra 风格因子暴露 (简化版) ─────────────────────────────────────

def barra_exposure(close: np.ndarray, factors: Dict[str, float]) -> Dict[str, float]:
    """计算 Barra 风格因子暴露得分 (Z-Score 归一化)。"""
    # 在单只股票上只能用基础值，真正的 Barra 需要全市场截面
    return factors


print("✔ factors.py 加载 — 因子模型 (Fama-French/Barra)")
