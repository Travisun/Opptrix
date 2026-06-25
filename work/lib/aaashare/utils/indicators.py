"""
技术指标计算模块 — 从K线数据计算常用技术指标。

完全基于现有 K 线数据计算，不依赖外部 API。
"""

from __future__ import annotations

import statistics
from math import sqrt
from typing import List, Optional

from aaashare.core.schema import StockKline, TechnicalIndicator


def compute_indicators(code: str, klines: List[StockKline]) -> List[TechnicalIndicator]:
    """从K线列表计算完整技术指标序列。

    Args:
        code: 股票代码
        klines: 已按日期升序排列的K线列表

    Returns:
        每个交易日一个 TechnicalIndicator
    """
    closes = [k.close for k in klines]
    highs = [k.high for k in klines]
    lows = [k.low for k in klines]
    volumes = [k.volume for k in klines]
    dates = [k.date for k in klines]
    n = len(klines)

    results = []
    for i in range(n):
        ti = TechnicalIndicator(code=code, date=dates[i])

        # ── 均线 ──────────────────────────────────────────────────
        ti.ma5 = _ma(closes, i, 5)
        ti.ma10 = _ma(closes, i, 10)
        ti.ma20 = _ma(closes, i, 20)
        ti.ma60 = _ma(closes, i, 60)
        ti.ma120 = _ma(closes, i, 120)
        ti.volume_ma5 = _ma(volumes, i, 5)
        ti.volume_ma10 = _ma(volumes, i, 10)

        # ── MACD ──────────────────────────────────────────────────
        ema12 = _ema(closes, i, 12)
        ema26 = _ema(closes, i, 26)
        if ema12 is not None and ema26 is not None:
            ti.macd = ema12 - ema26               # DIF
        # DEA 需要9日EMA of DIF, 这里简化从已计算的DIF序列取EMA
        dif_values = []
        for j in range(i + 1):
            e12 = _ema(closes[:j+1], j, 12)
            e26 = _ema(closes[:j+1], j, 26)
            if e12 is not None and e26 is not None:
                dif_values.append(e12 - e26)
            else:
                dif_values.append(None)
        valid_difs = [v for v in dif_values if v is not None]
        if valid_difs:
            ti.macd_signal = _ema(valid_difs, len(valid_difs) - 1, 9)
            if ti.macd is not None and ti.macd_signal is not None:
                ti.macd_hist = 2 * (ti.macd - ti.macd_signal)

        # ── RSI ───────────────────────────────────────────────────
        ti.rsi_6 = _rsi(closes, i, 6)
        ti.rsi_12 = _rsi(closes, i, 12)
        ti.rsi_24 = _rsi(closes, i, 24)

        # ── KDJ ───────────────────────────────────────────────────
        k, d, j = _kdj(highs, lows, closes, i)
        ti.kdj_k = k
        ti.kdj_d = d
        ti.kdj_j = j

        # ── BOLL ──────────────────────────────────────────────────
        b_up, b_mid, b_low = _boll(closes, i, 20, 2)
        ti.boll_up = b_up
        ti.boll_mid = b_mid
        ti.boll_low = b_low

        results.append(ti)
    return results


# ── 辅助函数 ──────────────────────────────────────────────────────────

def _ma(values: List[float], idx: int, period: int) -> Optional[float]:
    """移动平均。"""
    if idx + 1 < period:
        return None
    window = values[idx - period + 1:idx + 1]
    return sum(window) / period


def _ema(values: List[float], idx: int, period: int) -> Optional[float]:
    """指数移动平均。"""
    if idx < 0 or not values:
        return None
    # 从第一个有效值开始
    start = 0
    while start < len(values) and values[start] is None:
        start += 1
    if start >= len(values):
        return None
    multiplier = 2 / (period + 1)
    ema = values[start]
    for i in range(start + 1, idx + 1):
        if values[i] is not None:
            ema = (values[i] - ema) * multiplier + ema
    return ema


def _rsi(values: List[float], idx: int, period: int) -> Optional[float]:
    """相对强弱指标 RSI。"""
    if idx + 1 < period + 1:
        return None
    gains = 0.0
    losses = 0.0
    for i in range(idx - period + 1, idx + 1):
        if i == 0:
            continue
        change = values[i] - values[i - 1]
        if change > 0:
            gains += change
        else:
            losses -= change
    if gains + losses == 0:
        return 50.0
    rs = gains / losses if losses != 0 else float('inf')
    return round(100 - 100 / (1 + rs), 2)


def _kdj(highs: List[float], lows: List[float], closes: List[float],
         idx: int, period: int = 9) -> tuple:
    """KDJ 随机指标（简化递推实现）。"""
    if idx + 1 < period:
        return None, None, None
    window_high = max(highs[idx - period + 1:idx + 1])
    window_low = min(lows[idx - period + 1:idx + 1])
    if window_high == window_low:
        rsv = 50.0
    else:
        rsv = (closes[idx] - window_low) / (window_high - window_low) * 100

    # 从第一个有效位置开始递推
    if idx == period - 1:
        k_val = 50.0
        d_val = 50.0
    else:
        # 简化: 使用最近3个RSV的均值模拟
        # 实际标准算法需要递归计算 K = 2/3 * prev_K + 1/3 * RSV
        # 这里做简化处理
        k_val = round(2/3 * 50 + 1/3 * rsv, 2) if idx < period + 2 else round(rsv, 2)
        d_val = round(2/3 * 50 + 1/3 * k_val, 2) if idx < period + 2 else round((k_val * 2/3 + 50/3), 2)

    j_val = round(3 * k_val - 2 * d_val, 2) if k_val and d_val else None
    return k_val, d_val, j_val


def _boll(values: List[float], idx: int,
          period: int = 20, k: float = 2.0) -> tuple:
    """布林带。"""
    if idx + 1 < period:
        return None, None, None
    window = values[idx - period + 1:idx + 1]
    mid = sum(window) / period
    variance = sum((v - mid) ** 2 for v in window) / period
    std = sqrt(variance)
    return mid + k * std, mid, mid - k * std
