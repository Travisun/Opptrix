"""
Behavioral Strategy — 行为金融学信号
======================================
来源: Kahneman & Tversky (前景理论), Shefrin & Statman (处置效应)

核心逻辑:
- 舆情情绪极端值 (恐惧/贪婪)
- RSI/KDJ 极端值 (过度自信/恐慌)
- 换手率极端值 (恐慌/狂热)
- 量比极端值 (羊群效应)
"""
from __future__ import annotations

from typing import Any, Dict, List

from ..base import BaseStrategy, Signal


class BehavioralStrategy(BaseStrategy):
    """行为金融学 — 利用市场非理性行为"""

    NAME = "behavioral"
    DISPLAY_NAME = "行为金融学信号"
    SOURCE = "Kahneman & Shefrin"
    WEIGHT = 0.10

    def analyze(self, data: Dict[str, Any]) -> List[Signal]:
        signals = []
        ti = data.get("indicators")
        price = data.get("price")
        vr = data.get("volume_ratio", 1.0) or 1.0
        tr = data.get("turnover_rate", 0) or 0

        if ti is None or price is None:
            return signals

        last = ti.iloc[-1] if hasattr(ti, 'iloc') else ti

        rsi_6 = last.get("rsi_6")
        rsi_24 = last.get("rsi_24")

        # ── 极端恐惧 → 买入机会 ────────────────────────────
        if rsi_6 is not None and rsi_6 < 20:
            signals.append(Signal("Extreme_Fear", "BUY", 0.70, self.SOURCE,
                f"RSI(6)={rsi_6:.0f} < 20, 极度恐慌, 逆向买入机会"))
        elif rsi_24 is not None and rsi_24 < 30:
            signals.append(Signal("Mid_Fear", "BUY", 0.45, self.SOURCE,
                f"RSI(24)={rsi_24:.0f} < 30, 中期恐慌"))

        # ── 极端贪婪 → 卖出机会 ────────────────────────────
        if rsi_6 is not None and rsi_6 > 80:
            signals.append(Signal("Extreme_Greed", "SELL", 0.70, self.SOURCE,
                f"RSI(6)={rsi_6:.0f} > 80, 极度贪婪, 逆向卖出机会"))

        # ── 羊群效应: 天量换手 ──────────────────────────────
        if tr > 20:
            signals.append(Signal("Herding_Panic", "SELL", 0.50, self.SOURCE,
                f"换手率{tr:.1f}% 极高, 羊群效应警惕"))

        # ── 恐慌性抛售: 放量暴跌 ────────────────────────────
        change = data.get("change_pct", 0) or 0
        if change < -5 and vr > 2:
            signals.append(Signal("Panic_Sell", "BUY", 0.55, self.SOURCE,
                f"放量暴跌 {change:.1f}%, 恐慌性抛售, 逆向买入"))

        # ── 狂热追涨: 放量暴涨 ────────────────────────────
        if change > 7 and vr > 2:
            signals.append(Signal("FOMO_Climax", "SELL", 0.50, self.SOURCE,
                f"放量暴涨 {change:.1f}%, 追涨情绪高潮, 警惕回调"))

        return signals

print("  ✔ BehavioralStrategy")
