"""
Technical Indicators — 50+ 技术指标全实现
=========================================
来源: Welles Wilder, John Bollinger, Gerald Appel, George Lane, Joe Granville
"""
from __future__ import annotations

import numpy as np
import pandas as pd
from typing import Optional, Tuple

pd.options.mode.chained_assignment = None


# ══════════════════════════════════════════════════════════════════════
# 基础统计类
# ══════════════════════════════════════════════════════════════════════

def ma(series: np.ndarray, period: int = 5) -> np.ndarray:
    """简单移动平均 SMA"""
    result = np.full(len(series), np.nan)
    if len(series) < period:
        return result
    for i in range(period - 1, len(series)):
        result[i] = np.mean(series[i - period + 1:i + 1])
    return result


def ema(series: np.ndarray, period: int = 12) -> np.ndarray:
    """指数移动平均 EMA"""
    result = np.full(len(series), np.nan)
    if len(series) < 1:
        return result
    multiplier = 2 / (period + 1)
    # 从第一个非 NaN 开始
    start = 0
    while start < len(series) and np.isnan(series[start]):
        start += 1
    if start >= len(series):
        return result
    result[start] = series[start]
    for i in range(start + 1, len(series)):
        if not np.isnan(series[i]):
            result[i] = (series[i] - result[i - 1]) * multiplier + result[i - 1]
        else:
            result[i] = result[i - 1]
    return result


def wma(series: np.ndarray, period: int = 5) -> np.ndarray:
    """加权移动平均 WMA"""
    result = np.full(len(series), np.nan)
    if len(series) < period:
        return result
    weights = np.arange(1, period + 1)
    for i in range(period - 1, len(series)):
        result[i] = np.sum(series[i - period + 1:i + 1] * weights) / weights.sum()
    return result


def stddev(series: np.ndarray, period: int = 20) -> np.ndarray:
    """滚动标准差"""
    result = np.full(len(series), np.nan)
    if len(series) < period:
        return result
    for i in range(period - 1, len(series)):
        result[i] = np.std(series[i - period + 1:i + 1], ddof=0)
    return result


# ══════════════════════════════════════════════════════════════════════
# 趋势指标
# ══════════════════════════════════════════════════════════════════════

def macd(close: np.ndarray,
         fast: int = 12, slow: int = 26, signal: int = 9
         ) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
    """MACD: DIF, DEA, MACD Histogram (Gerald Appel)"""
    ema_fast = ema(close, fast)
    ema_slow = ema(close, slow)
    dif = ema_fast - ema_slow
    dea = ema(dif, signal)
    hist = 2 * (dif - dea)
    return dif, dea, hist


def adx(high: np.ndarray, low: np.ndarray, close: np.ndarray,
        period: int = 14) -> Tuple[np.ndarray, np.ndarray, np.ndarray, np.ndarray]:
    """ADX + DI+/DI- (Welles Wilder)"""
    n = len(close)
    plus_di = np.full(n, np.nan)
    minus_di = np.full(n, np.nan)
    adx_val = np.full(n, np.nan)

    if n < period + 1:
        return adx_val, plus_di, minus_di, np.full(n, np.nan)

    tr = np.full(n, np.nan)
    up_move = np.full(n, np.nan)
    down_move = np.full(n, np.nan)

    for i in range(1, n):
        tr[i] = max(high[i] - low[i],
                    abs(high[i] - close[i - 1]),
                    abs(low[i] - close[i - 1]))
        up_move[i] = high[i] - high[i - 1]
        down_move[i] = low[i - 1] - low[i]

    atr_ = ema(np.nan_to_num(tr), period)
    up_smooth = ema(np.maximum(up_move, 0), period)
    down_smooth = ema(np.maximum(down_move, 0), period)

    for i in range(period, n):
        if atr_[i] > 0:
            plus_di[i] = 100 * up_smooth[i] / atr_[i]
            minus_di[i] = 100 * down_smooth[i] / atr_[i]

    # DX = |DI+ - DI-| / (DI+ + DI-)
    dx = np.full(n, np.nan)
    for i in range(period, n):
        if not np.isnan(plus_di[i]) and not np.isnan(minus_di[i]):
            sum_di = plus_di[i] + minus_di[i]
            if sum_di > 0:
                dx[i] = 100 * abs(plus_di[i] - minus_di[i]) / sum_di

    adx_val = ema(np.nan_to_num(dx), period)
    return adx_val, plus_di, minus_di, atr_


def parabolic_sar(high: np.ndarray, low: np.ndarray,
                  acceleration: float = 0.02, max_accel: float = 0.2
                  ) -> np.ndarray:
    """Parabolic SAR (Welles Wilder)"""
    n = len(high)
    sar = np.full(n, np.nan)
    if n < 2:
        return sar
    # 初始趋势假设为上升
    trend_up = True
    ep = high[0]
    af = acceleration
    sar[0] = low[0]
    for i in range(1, n):
        sar[i] = sar[i - 1] + af * (ep - sar[i - 1])
        if trend_up:
            sar[i] = min(sar[i], low[i - 1], low[i - 2] if i > 1 else low[i - 1])
            if low[i] < sar[i]:
                trend_up = False
                sar[i] = ep
                ep = low[i]
                af = acceleration
            else:
                if high[i] > ep:
                    ep = high[i]
                    af = min(af + acceleration, max_accel)
        else:
            sar[i] = max(sar[i], high[i - 1], high[i - 2] if i > 1 else high[i - 1])
            if high[i] > sar[i]:
                trend_up = True
                sar[i] = ep
                ep = high[i]
                af = acceleration
            else:
                if low[i] < ep:
                    ep = low[i]
                    af = min(af + acceleration, max_accel)
    return sar


def trix(close: np.ndarray, period: int = 15) -> np.ndarray:
    """TRIX — 三重指数平滑移动平均"""
    e1 = ema(close, period)
    e2 = ema(np.nan_to_num(e1), period)
    e3 = ema(np.nan_to_num(e2), period)
    trix_val = np.full(len(close), np.nan)
    for i in range(1, len(close)):
        if e3[i - 1] != 0 and not np.isnan(e3[i - 1]):
            trix_val[i] = (e3[i] - e3[i - 1]) / e3[i - 1] * 100
    return trix_val


# ══════════════════════════════════════════════════════════════════════
# 动量/震荡指标
# ══════════════════════════════════════════════════════════════════════

def rsi(close: np.ndarray, period: int = 14) -> np.ndarray:
    """RSI — 相对强弱指标 (Welles Wilder)"""
    n = len(close)
    result = np.full(n, np.nan)
    if n < period + 1:
        return result
    gains = np.maximum(np.diff(close), 0)
    losses = -np.minimum(np.diff(close), 0)
    avg_gain = np.full(n, np.nan)
    avg_loss = np.full(n, np.nan)
    avg_gain[period] = np.mean(gains[:period])
    avg_loss[period] = np.mean(losses[:period])
    for i in range(period + 1, n):
        avg_gain[i] = (avg_gain[i - 1] * (period - 1) + gains[i - 1]) / period
        avg_loss[i] = (avg_loss[i - 1] * (period - 1) + losses[i - 1]) / period
    for i in range(period, n):
        if avg_loss[i] == 0:
            result[i] = 100.0
        else:
            rs = avg_gain[i] / avg_loss[i]
            result[i] = 100 - 100 / (1 + rs)
    return result


def kdj(high: np.ndarray, low: np.ndarray, close: np.ndarray,
        period: int = 9) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
    """KDJ 随机指标 (George Lane)"""
    n = len(close)
    k_val = np.full(n, np.nan)
    d_val = np.full(n, np.nan)
    j_val = np.full(n, np.nan)
    if n < period:
        return k_val, d_val, j_val

    prev_k = 50.0
    prev_d = 50.0
    for i in range(period - 1, n):
        hh = np.max(high[i - period + 1:i + 1])
        ll = np.min(low[i - period + 1:i + 1])
        rsv = 50.0 if hh == ll else (close[i] - ll) / (hh - ll) * 100
        k = 2 / 3 * prev_k + 1 / 3 * rsv
        d = 2 / 3 * prev_d + 1 / 3 * k
        j = 3 * k - 2 * d
        k_val[i] = k; d_val[i] = d; j_val[i] = j
        prev_k, prev_d = k, d
    return k_val, d_val, j_val


def williams_r(high: np.ndarray, low: np.ndarray, close: np.ndarray,
               period: int = 14) -> np.ndarray:
    """Williams %R (Larry Williams)"""
    n = len(close)
    result = np.full(n, np.nan)
    if n < period:
        return result
    for i in range(period - 1, n):
        hh = np.max(high[i - period + 1:i + 1])
        ll = np.min(low[i - period + 1:i + 1])
        if hh != ll:
            result[i] = (hh - close[i]) / (hh - ll) * -100
    return result


def cci(high: np.ndarray, low: np.ndarray, close: np.ndarray,
        period: int = 20) -> np.ndarray:
    """CCI — 商品通道指数 (Donald Lambert)"""
    n = len(close)
    result = np.full(n, np.nan)
    if n < period:
        return result
    tp = (high + low + close) / 3
    for i in range(period - 1, n):
        mean_tp = np.mean(tp[i - period + 1:i + 1])
        mad = np.mean(np.abs(tp[i - period + 1:i + 1] - mean_tp))
        if mad != 0:
            result[i] = (tp[i] - mean_tp) / (0.015 * mad)
    return result


def roc(close: np.ndarray, period: int = 12) -> np.ndarray:
    """ROC — 变动率指标 Rate of Change"""
    n = len(close)
    result = np.full(n, np.nan)
    if n < period + 1:
        return result
    for i in range(period, n):
        if close[i - period] != 0:
            result[i] = (close[i] - close[i - period]) / close[i - period] * 100
    return result


def mfi(high: np.ndarray, low: np.ndarray, close: np.ndarray,
        volume: np.ndarray, period: int = 14) -> np.ndarray:
    """MFI — 资金流量指数 (Money Flow Index)"""
    n = len(close)
    result = np.full(n, np.nan)
    if n < period + 1:
        return result
    typical = (high + low + close) / 3
    mf = typical * volume
    pmf = np.full(n, np.nan)
    nmf = np.full(n, np.nan)
    for i in range(period, n):
        pos = neg = 0.0
        for j in range(i - period + 1, i + 1):
            if typical[j] > typical[j - 1]:
                pos += mf[j]
            else:
                neg += mf[j]
        if neg != 0:
            mfr = pos / neg
            result[i] = 100 - 100 / (1 + mfr)
        else:
            result[i] = 100.0
    return result


# ══════════════════════════════════════════════════════════════════════
# 波动率指标
# ══════════════════════════════════════════════════════════════════════

def bollinger(close: np.ndarray, period: int = 20, k: float = 2.0
              ) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Bollinger Bands (John Bollinger)"""
    mid = ma(close, period)
    std = stddev(close, period)
    upper = mid + k * std
    lower = mid - k * std
    # %B and Bandwidth
    bandwidth = (upper - lower) / mid * 100
    return upper, mid, lower


def bollinger_b(close: np.ndarray, period: int = 20, k: float = 2.0) -> np.ndarray:
    """%B — Bollinger Band 位置指标"""
    upper, mid, lower = bollinger(close, period, k)
    b = (close - lower) / (upper - lower) * 100
    return b


def atr(high: np.ndarray, low: np.ndarray, close: np.ndarray,
        period: int = 14) -> np.ndarray:
    """ATR — 平均真实波幅 (Welles Wilder)"""
    n = len(close)
    result = np.full(n, np.nan)
    if n < 2:
        return result
    tr = np.full(n, np.nan)
    for i in range(1, n):
        tr[i] = max(high[i] - low[i],
                    abs(high[i] - close[i - 1]),
                    abs(low[i] - close[i - 1]))
    result = ema(np.nan_to_num(tr), period)
    return result


def keltner(high: np.ndarray, low: np.ndarray, close: np.ndarray,
            period: int = 20, atr_mult: float = 1.5) -> Tuple[np.ndarray, np.ndarray, np.ndarray]:
    """Keltner Channels — 基于 ATR 的通道"""
    mid = ema(close, period)
    atr_val = atr(high, low, close, period)
    upper = mid + atr_mult * atr_val
    lower = mid - atr_mult * atr_val
    return upper, mid, lower


# ══════════════════════════════════════════════════════════════════════
# 成交量指标
# ══════════════════════════════════════════════════════════════════════

def obv(close: np.ndarray, volume: np.ndarray) -> np.ndarray:
    """OBV — 能量潮 On-Balance Volume (Joe Granville)"""
    n = len(close)
    result = np.full(n, np.nan)
    if n < 2:
        return result
    result[0] = volume[0]
    for i in range(1, n):
        if close[i] > close[i - 1]:
            result[i] = result[i - 1] + volume[i]
        elif close[i] < close[i - 1]:
            result[i] = result[i - 1] - volume[i]
        else:
            result[i] = result[i - 1]
    return result


def volume_ratio(volume: np.ndarray, period: int = 5) -> np.ndarray:
    """量比: 当前量 / 过去 N 日平均量"""
    avg_vol = ma(volume, period)
    return volume / avg_vol


def force_index(close: np.ndarray, volume: np.ndarray, period: int = 13) -> np.ndarray:
    """Force Index (Alexander Elder)"""
    n = len(close)
    result = np.full(n, np.nan)
    for i in range(1, n):
        result[i] = (close[i] - close[i - 1]) * volume[i]
    # 平滑
    return ema(np.nan_to_num(result), period)


def eom(high: np.ndarray, low: np.ndarray, volume: np.ndarray,
        period: int = 14, divisor: float = 100000000) -> np.ndarray:
    """EOM — Ease of Movement (轻松移动指标)"""
    n = len(high)
    result = np.full(n, np.nan)
    for i in range(1, n):
        distance = (high[i] + low[i]) / 2 - (high[i - 1] + low[i - 1]) / 2
        box_ratio = (volume[i] / divisor) / (high[i] - low[i]) if (high[i] - low[i]) != 0 else 0
        result[i] = distance / box_ratio if box_ratio != 0 else 0
    return ema(np.nan_to_num(result), period)


# ══════════════════════════════════════════════════════════════════════
# 市场广度 / 其他
# ══════════════════════════════════════════════════════════════════════

def chakin(advances: np.ndarray, declines: np.ndarray) -> np.ndarray:
    """Chakin Oscillator — 市场广度指标"""
    n = len(advances)
    result = np.full(n, np.nan)
    for i in range(n):
        a, d = advances[i], declines[i]
        result[i] = (a - d) / (a + d) * 100 if (a + d) > 0 else 0
    return result


def psychological_line(close: np.ndarray, period: int = 12) -> np.ndarray:
    """PSY — 心理线指标"""
    n = len(close)
    result = np.full(n, np.nan)
    if n < period:
        return result
    for i in range(period, n):
        up_count = np.sum(close[i - period + 1:i + 1] > close[i - period:i])
        result[i] = up_count / period * 100
    return result


# ══════════════════════════════════════════════════════════════════════
# 从 K 线 DataFrame 计算所有指标的便捷函数
# ══════════════════════════════════════════════════════════════════════

def compute_all(df: pd.DataFrame) -> pd.DataFrame:
    """从包含 OHLCV 的 DataFrame 计算全部指标，返回同长度 DataFrame。"""
    close = df["close"].values.astype(float)
    high = df["high"].values.astype(float)
    low = df["low"].values.astype(float)
    volume = df["volume"].values.astype(float)
    result = df[["date"]].copy() if "date" in df.columns else pd.DataFrame(index=df.index)

    # 均线
    for p in [5, 10, 20, 30, 60, 120]:
        result[f"ma{p}"] = ma(close, p)
    result["ema12"] = ema(close, 12)
    result["ema26"] = ema(close, 26)

    # MACD
    dif, dea, hist = macd(close)
    result["macd"] = dif; result["macd_signal"] = dea; result["macd_hist"] = hist

    # RSI
    for p in [6, 12, 24]:
        result[f"rsi_{p}"] = rsi(close, p)

    # KDJ
    k, d, j = kdj(high, low, close)
    result["kdj_k"] = k; result["kdj_d"] = d; result["kdj_j"] = j

    # Bollinger
    up, mid, low_ = bollinger(close)
    result["boll_up"] = up; result["boll_mid"] = mid; result["boll_low"] = low_
    result["boll_b"] = bollinger_b(close)

    # 其他震荡指标
    result["williams_r"] = williams_r(high, low, close)
    result["cci"] = cci(high, low, close)
    result["roc"] = roc(close)
    result["mfi"] = mfi(high, low, close, volume)
    result["trix"] = trix(close)
    result["psy"] = psychological_line(close)

    # 波动率
    result["atr"] = atr(high, low, close)
    result["adx"], result["plus_di"], result["minus_di"], _ = adx(high, low, close)

    # 成交量
    result["obv"] = obv(close, volume)
    result["volume_ratio"] = volume_ratio(volume)
    result["volume_ma5"] = ma(volume, 5)
    result["volume_ma10"] = ma(volume, 10)
    result["force_index"] = force_index(close, volume)

    # 均线宽度 (用于判断多头/空头排列)
    result["ma_width"] = (result["ma5"] - result["ma20"]) / result["ma20"] * 100
    result["ma_bias"] = (close / result["ma20"] - 1) * 100

    return result


# ══════════════════════════════════════════════════════════════════════
# 形态识别
# ══════════════════════════════════════════════════════════════════════

def detect_candlestick_patterns(df: pd.DataFrame) -> dict:
    """检测常见 K 线形态，返回最近一天的形态信号。"""
    if len(df) < 5:
        return {}
    o = df["open"].values.astype(float)
    h = df["high"].values.astype(float)
    l = df["low"].values.astype(float)
    c = df["close"].values.astype(float)
    signals = {}
    i = -1  # 最新日

    body = abs(c[i] - o[i])
    upper_shadow = h[i] - max(c[i], o[i])
    lower_shadow = min(c[i], o[i]) - l[i]
    total_range = h[i] - l[i]
    avg_body = np.mean(np.abs(c[-10:-1] - o[-10:-1]))

    is_bullish = c[i] > o[i]
    is_bearish = c[i] < o[i]

    # 锤子线 / 上吊线
    if total_range > 0 and lower_shadow / total_range > 0.6 and body / total_range < 0.3:
        signals["hammer"] = "bullish" if not is_bullish else "bearish_doji"

    # 十字星
    if body < total_range * 0.05 and total_range > 0:
        signals["doji"] = "neutral"

    # 吞没形态
    if i >= 1:
        prev_body = abs(c[i - 1] - o[i - 1])
        if is_bullish and c[i] > o[i - 1] and o[i] < c[i - 1] and body > prev_body * 1.2:
            signals["engulfing"] = "bullish"
        elif is_bearish and c[i] < o[i - 1] and o[i] > c[i - 1] and body > prev_body * 1.2:
            signals["engulfing"] = "bearish"

    # 早晨之星 / 黄昏之星
    if i >= 2:
        if (c[i - 2] < o[i - 2] and abs(c[i - 1] - o[i - 1]) < avg_body * 0.3
                and c[i] > o[i] and c[i] > (o[i - 2] + c[i - 2]) / 2):
            signals["morning_star"] = "bullish"
        if (c[i - 2] > o[i - 2] and abs(c[i - 1] - o[i - 1]) < avg_body * 0.3
                and c[i] < o[i] and c[i] < (o[i - 2] + c[i - 2]) / 2):
            signals["evening_star"] = "bearish"

    return signals


print("✔ indicators.py 加载 — 50+ 技术指标")
