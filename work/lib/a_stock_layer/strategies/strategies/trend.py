"""
Trend Strategy — 多周期趋势对齐
===============================
来源: Goldman Sachs GAT, Barclays Momentum, 道氏理论

核心逻辑:
- 日线 MA 多头/空头排列
- 价格 vs MA60 (牛熊分界)
- 60分钟短线趋势
- 动量方向确认 (12-1M momentum)
"""
from __future__ import annotations

import numpy as np
from typing import Any, Dict, List

from ..base import BaseStrategy, Signal


class TrendStrategy(BaseStrategy):
    """多周期趋势对齐 — 只在主要趋势方向做 T"""

    NAME = "trend"
    DISPLAY_NAME = "多周期趋势对齐"
    SOURCE = "Goldman Sachs GAT + 道氏理论"
    WEIGHT = 0.25

    def analyze(self, data: Dict[str, Any]) -> List[Signal]:
        signals = []
        ti = data.get("indicators")
        k60 = data.get("kline_60m")
        price = data.get("price")
        if ti is None or price is None:
            return signals

        last = ti.iloc[-1] if hasattr(ti, 'iloc') else ti
        s, reasons = 0.0, []

        ma5 = last.get("ma5"); ma10 = last.get("ma10")
        ma20 = last.get("ma20"); ma60 = last.get("ma60")

        # 多头/空头排列
        if all(v is not None for v in [ma5, ma10, ma20]):
            if ma5 > ma10 and ma10 > ma20:
                s += 0.40
                reasons.append(f"多头排列 MA5({ma5:.1f})>MA10({ma10:.1f})>MA20({ma20:.1f})")
            elif ma5 < ma10 and ma10 < ma20:
                s -= 0.40
                reasons.append(f"空头排列 MA5({ma5:.1f})<MA10({ma10:.1f})<MA20({ma20:.1f})")
            elif ma5 > ma10:
                s += 0.15
                reasons.append("短线偏多")

        # MA60 牛熊分界
        if ma60 is not None:
            if price > ma60:
                s += 0.25
                reasons.append(f"价在MA60({ma60:.1f})上 — 中长期多头")
            else:
                s -= 0.25
                reasons.append(f"价在MA60({ma60:.1f})下 — 中长期空头")

        # 均线宽度 (MA5-MA20)
        ma_width = last.get("ma_width")
        if ma_width is not None:
            if ma_width > 5:
                s += 0.15
                reasons.append(f"均线发散向上({ma_width:.1f}%)")
            elif ma_width < -5:
                s -= 0.15
                reasons.append(f"均线发散向下({ma_width:.1f}%)")

        # 60分钟短线
        if k60 is not None and len(k60) >= 10:
            c60 = k60["close"].values.astype(float)
            if np.mean(c60[-5:]) > np.mean(c60[-10:]):
                s += 0.30; reasons.append("60分短多")
            else:
                s -= 0.30; reasons.append("60分短空")

        # 动量因子确认
        mom = data.get("momentum_factors", {})
        mom_6m = mom.get("mom_6m", 0) or 0
        if mom_6m > 10:
            s += 0.10; reasons.append(f"6月动量强势({mom_6m:.0f}%)")
        elif mom_6m < -10:
            s -= 0.10; reasons.append(f"6月动量弱势({mom_6m:.0f}%)")

        s = max(-1.0, min(1.0, s))
        if s >= 0.3:
            signals.append(Signal("Trend_Buy", "BUY", s, self.SOURCE, "; ".join(reasons)))
        elif s <= -0.3:
            signals.append(Signal("Trend_Sell", "SELL", abs(s), self.SOURCE, "; ".join(reasons)))
        return signals

print("  ✔ TrendStrategy")
