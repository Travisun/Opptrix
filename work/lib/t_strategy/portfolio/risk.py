"""
Risk Management Models — 风险管理模型
========================================
来源: 凯利, VaR, 波动率目标, 固定比例止损
"""
from __future__ import annotations

import numpy as np
from typing import Optional, Tuple


def volatility_target_position(
    current_vol: float,
    target_vol: float = 0.20,
    max_leverage: float = 1.0,
) -> float:
    """波动率目标仓位 (Volatility Targeting)。"""
    if current_vol <= 0:
        return 0
    return min(max_leverage, target_vol / current_vol)


def fixed_stop_loss(entry_price: float, current_price: float,
                    stop_loss_pct: float = 0.07, direction: str = "long") -> Tuple[bool, float]:
    """固定比例止损。

    Returns:
        (是否触发止损, 触发价格)
    """
    if direction == "long":
        stop_price = entry_price * (1 - stop_loss_pct)
        triggered = current_price <= stop_price
    else:
        stop_price = entry_price * (1 + stop_loss_pct)
        triggered = current_price >= stop_price
    return triggered, stop_price


def trailing_stop(current_price: float, peak_price: float,
                  trail_pct: float = 0.08) -> Tuple[bool, float]:
    """移动止损。

    Returns:
        (是否触发, 止损价)
    """
    stop_price = peak_price * (1 - trail_pct)
    triggered = current_price <= stop_price
    return triggered, stop_price


def position_sizing(
    account_value: float,
    risk_per_trade: float = 0.01,
    entry_price: float = 0,
    stop_price: float = 0,
) -> int:
    """基于固定风险比例的仓位计算。

    Args:
        account_value: 账户总资产
        risk_per_trade: 单笔可接受亏损比例 (默认1%)
        entry_price: 买入价
        stop_price: 止损价

    Returns:
        建议买入股数
    """
    if entry_price <= 0 or stop_price <= 0 or entry_price <= stop_price:
        return 0
    risk_per_share = entry_price - stop_price
    max_loss = account_value * risk_per_trade
    shares = int(max_loss / risk_per_share)
    return max(shares, 0)


def value_at_risk(returns: np.ndarray, confidence: float = 0.95) -> float:
    """VaR — 在险价值 (参数法)。"""
    mu = np.mean(returns)
    sigma = np.std(returns)
    from scipy.stats import norm
    return float(mu - sigma * norm.ppf(confidence))


def max_drawdown(prices: np.ndarray) -> Tuple[float, int, int]:
    """最大回撤。

    Returns:
        (最大回撤比例, 峰值索引, 谷值索引)
    """
    peak = np.maximum.accumulate(prices)
    drawdown = (prices - peak) / peak
    max_dd = np.min(drawdown)
    valley_idx = np.argmin(drawdown)
    peak_idx = np.argmax(prices[:valley_idx + 1])
    return float(max_dd), int(peak_idx), int(valley_idx)


def sharpe_ratio(returns: np.ndarray, rf: float = 0.02) -> float:
    """夏普比率。"""
    excess = returns - rf / 252
    return float(np.mean(excess) / np.std(excess) * np.sqrt(252))


def sortino_ratio(returns: np.ndarray, rf: float = 0.02) -> float:
    """索蒂诺比率 (只考虑下行波动)。"""
    excess = returns - rf / 252
    downside = np.std(excess[excess < 0])
    if downside == 0:
        return 0
    return float(np.mean(excess) / downside * np.sqrt(252))


def calmar_ratio(returns: np.ndarray, prices: np.ndarray) -> float:
    """卡玛比率 (年化收益 / 最大回撤)。"""
    ann_return = (prices[-1] / prices[0]) ** (252 / len(prices)) - 1
    dd, _, _ = max_drawdown(prices)
    if dd == 0:
        return 0
    return float(ann_return / abs(dd))


print("  ✔ portfolio/risk")
