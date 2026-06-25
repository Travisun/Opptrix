"""
K线衍生计算 — 通用的K线统计分析

这些函数不依赖 a_stock_layer，只接受 numpy array。
因子层可以调用它们做计算。
"""

from typing import Optional
import numpy as np


def calc_volatility(closes: np.ndarray, annualize: bool = True) -> float:
    """计算年化波动率"""
    returns = np.diff(closes) / closes[:-1]
    daily_vol = np.std(returns, ddof=1)
    if annualize and daily_vol > 0:
        return float(daily_vol * np.sqrt(252))
    return float(daily_vol)


def calc_beta(stock_returns: np.ndarray,
              market_returns: np.ndarray) -> Optional[float]:
    """计算Beta系数"""
    if len(stock_returns) != len(market_returns) or len(stock_returns) < 20:
        return None
    cov = np.cov(stock_returns, market_returns)[0, 1]
    var = np.var(market_returns)
    if var == 0:
        return None
    return float(cov / var)


def calc_max_drawdown(closes: np.ndarray) -> float:
    """计算最大回撤（百分比，负值表示亏损）"""
    peak = np.maximum.accumulate(closes)
    drawdown = (closes - peak) / peak
    return float(np.min(drawdown)) * 100


def calc_moving_average(closes: np.ndarray, period: int) -> np.ndarray:
    """计算移动平均"""
    if len(closes) < period:
        return np.full_like(closes, np.nan)
    ret = np.cumsum(closes, dtype=float)
    ret[period:] = ret[period:] - ret[:-period]
    ret[:period - 1] = np.nan
    ret[period - 1:] /= period
    return ret


def calc_rsi(closes: np.ndarray, period: int = 14) -> np.ndarray:
    """计算RSI"""
    deltas = np.diff(closes)
    gains = np.where(deltas > 0, deltas, 0)
    losses = np.where(deltas < 0, -deltas, 0)

    avg_gain = np.full_like(closes, np.nan, dtype=float)
    avg_loss = np.full_like(closes, np.nan, dtype=float)

    avg_gain[period] = np.mean(gains[:period])
    avg_loss[period] = np.mean(losses[:period])

    for i in range(period + 1, len(closes)):
        avg_gain[i] = (avg_gain[i - 1] * (period - 1) + gains[i - 1]) / period
        avg_loss[i] = (avg_loss[i - 1] * (period - 1) + losses[i - 1]) / period

    rs = avg_gain / np.where(avg_loss == 0, 0.001, avg_loss)
    rsi = 100 - (100 / (1 + rs))
    return rsi
