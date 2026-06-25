"""
Mean Reversion Strategy — 均值回归
====================================
来源: JP Morgan Technical Strategy, John Bollinger

核心逻辑:
- Bollinger Band 超买/超卖
- RSI 背离 (顶背离/底背离)
- %B 位置指标
- Williams %R 极端值
- CCI 极端值
"""
from __future__ import annotations

import numpy as np
from typing import Any, Dict, List

from ..base import BaseStrategy, Signal


class MeanReversionStrategy(BaseStrategy):
    """均值回归 — Bollinger+RSI 极端值反转"""

    NAME = "mean_reversion"
    DISPLAY_NAME = "均值回归 + RSI 背离"
    SOURCE = "JP Morgan Technical"
    WEIGHT = 0.25

    def analyze(self, data: Dict[str, Any]) -> List[Signal]:
        signals = []
        ti = data.get("indicators")
        kd = data.get("kline_daily")
        price = data.get("price")
        if ti is None or price is None:
            return signals

        last = ti.iloc[-1] if hasattr(ti, 'iloc') else ti
        df = ti if hasattr(ti, 'iloc') else None

        boll_up = last.get("boll_up")
        boll_mid = last.get("boll_mid")
        boll_low = last.get("boll_low")
        rsi_6 = last.get("rsi_6")
        rsi_12 = last.get("rsi_12")
        williams_r_val = last.get("williams_r")
        cci_val = last.get("cci")
        boll_b = last.get("boll_b")

        # ── Bollinger Band + RSI 超卖 ──────────────────────────
        if boll_low is not None and rsi_6 is not None:
            if price <= boll_low * 1.01 and rsi_6 < 35:
                st = max(0.3, min(1.0, (35 - rsi_6) / 20 + max(boll_low - price, 0) / max(price, 1)))
                signals.append(Signal("Bollinger_Oversold", "BUY", st, self.SOURCE,
                    f"触Boll下轨({boll_low:.1f})+RSI超卖({rsi_6:.0f})"))

        if boll_up is not None and rsi_6 is not None:
            if price >= boll_up * 0.99 and rsi_6 > 65:
                st = max(0.3, min(1.0, (rsi_6 - 65) / 20 + max(price - boll_up, 0) / max(price, 1)))
                signals.append(Signal("Bollinger_Overbought", "SELL", st, self.SOURCE,
                    f"触Boll上轨({boll_up:.1f})+RSI超买({rsi_6:.0f})"))

        # ── %B 极度位置 ──────────────────────────────────────
        if boll_b is not None:
            if boll_b < 0:
                signals.append(Signal("Boll_B_Below", "BUY", 0.4, self.SOURCE,
                    f"%B={boll_b:.0f}, 价格跌破下轨, 极端超卖"))
            elif boll_b > 100:
                signals.append(Signal("Boll_B_Above", "SELL", 0.4, self.SOURCE,
                    f"%B={boll_b:.0f}, 价格突破上轨, 极端超买"))

        # ── Williams %R ─────────────────────────────────────
        if williams_r_val is not None:
            if williams_r_val < -80:
                signals.append(Signal("Williams_Sold", "BUY", 0.45, self.SOURCE,
                    f"Williams%R={williams_r_val:.0f}, 超卖区"))
            elif williams_r_val > -20:
                signals.append(Signal("Williams_Bought", "SELL", 0.45, self.SOURCE,
                    f"Williams%R={williams_r_val:.0f}, 超买区"))

        # ── CCI ────────────────────────────────────────────
        if cci_val is not None:
            if cci_val < -100:
                signals.append(Signal("CCI_Sold", "BUY", 0.4, self.SOURCE,
                    f"CCI={cci_val:.0f} < -100, 超卖"))
            elif cci_val > 100:
                signals.append(Signal("CCI_Bought", "SELL", 0.4, self.SOURCE,
                    f"CCI={cci_val:.0f} > 100, 超买"))

        # ── RSI 背离 ────────────────────────────────────────
        if df is not None and kd is not None and len(df) >= 15:
            rc = kd.tail(5); pc = kd.iloc[-10:-5]
            if len(pc) >= 5:
                ri = "rsi_12" if "rsi_12" in df.columns else "rsi_6"
                if ri in df.columns:
                    if (rc["high"].max() > pc["high"].max() * 1.01 and
                        df[ri].tail(5).max() < df[ri].iloc[-10:-5].max() * 0.98):
                        signals.append(Signal("RSI_TopDiv", "SELL", 0.6, self.SOURCE, "RSI顶背离"))
                    if (rc["low"].min() < pc["low"].min() * 0.99 and
                        df[ri].tail(5).min() > df[ri].iloc[-10:-5].min() * 1.02):
                        signals.append(Signal("RSI_BottomDiv", "BUY", 0.6, self.SOURCE, "RSI底背离"))

        return signals

print("  ✔ MeanReversionStrategy")
