"""
Volume Price Strategy — 量价关系分析
======================================
来源: Morgan Stanley Quant, Joe Granville (OBV)

核心逻辑:
- 量比分析 (放量/缩量)
- OBV 趋势确认/背离
- Force Index 方向
- Ease of Movement 轻松移动
- 量价配合 vs 量价背离
"""
from __future__ import annotations

import numpy as np
from typing import Any, Dict, List

from ..base import BaseStrategy, Signal


class VolumePriceStrategy(BaseStrategy):
    """量价关系 — 放量突破/缩量衰竭确认"""

    NAME = "volume_price"
    DISPLAY_NAME = "量价关系分析"
    SOURCE = "Morgan Stanley Quant"
    WEIGHT = 0.15

    def analyze(self, data: Dict[str, Any]) -> List[Signal]:
        signals = []
        price = data.get("price")
        chg = data.get("change_pct", 0) or 0
        vr = data.get("volume_ratio", 1.0) or 1.0
        ti = data.get("indicators")
        kd = data.get("kline_daily")

        if price is None or ti is None:
            return signals

        last = ti.iloc[-1] if hasattr(ti, 'iloc') else ti
        df = ti if hasattr(ti, 'iloc') else None

        # ── 量比分析 ──────────────────────────────────────────
        if vr > 1.8:
            if chg > 2:
                signals.append(Signal("Vol_Breakout", "BUY", min(1.0, vr / 3), self.SOURCE,
                    f"放量上突 量比{vr:.1f}+{chg:.1f}%"))
            elif chg < -2:
                signals.append(Signal("Vol_Dump", "SELL", min(1.0, vr / 3), self.SOURCE,
                    f"放量下砸 量比{vr:.1f}+{chg:.1f}%"))
            elif chg > 0:
                signals.append(Signal("Vol_Buildup", "BUY", 0.25, self.SOURCE,
                    f"温和放量上涨 量比{vr:.1f}"))
        elif vr < 0.5:
            if chg < 0:
                signals.append(Signal("Vol_ThinDown", "BUY", 0.35, self.SOURCE,
                    f"缩量下跌 量比{vr:.1f} 抛压衰竭"))
            elif chg > 0:
                signals.append(Signal("Vol_ThinUp", "HOLD", 0.15, self.SOURCE,
                    f"缩量上涨 量比{vr:.1f} 趋势延续"))

        # ── 成交量均线 ──────────────────────────────────────
        vma5 = last.get("volume_ma5")
        vma10 = last.get("volume_ma10")
        if vma5 is not None and vma10 is not None:
            if vma5 > vma10 * 1.1 and chg > 0:
                signals.append(Signal("Vol_MA_Bullish", "BUY", 0.25, self.SOURCE,
                    "成交量MA5上穿MA10, 放量配合上涨"))

        # ── OBV 趋势 ─────────────────────────────────────────
        obv_val = last.get("obv")
        if obv_val is not None and df is not None and len(df) >= 10:
            obv_ma5 = np.mean(df["obv"].tail(5).values.astype(float)) if "obv" in df.columns else None
            obv_ma20 = np.mean(df["obv"].tail(20).values.astype(float)) if "obv" in df.columns else None
            if obv_ma5 and obv_ma20 and obv_ma5 > obv_ma20 and chg > 0:
                signals.append(Signal("OBV_Bullish", "BUY", 0.30, self.SOURCE, "OBV趋势向上, 量能支持上涨"))
            elif obv_ma5 and obv_ma20 and obv_ma5 < obv_ma20 and chg > 0:
                signals.append(Signal("OBV_Divergence", "SELL", 0.45, self.SOURCE,
                    "价格上涨但OBV走弱, 量价背离"))

        # ── Force Index ─────────────────────────────────────
        fi = last.get("force_index")
        if fi is not None:
            if fi > 0 and chg > 0:
                signals.append(Signal("Force_Up", "BUY", 0.20, self.SOURCE, "多头力量增强"))
            elif fi < 0 and chg < 0:
                signals.append(Signal("Force_Down", "SELL", 0.20, self.SOURCE, "空头力量增强"))

        # ── 换手率分析 ──────────────────────────────────────
        tr = data.get("turnover_rate", 0) or 0
        if tr > 10:
            signals.append(Signal("High_Turnover_Risk", "SELL", 0.20, self.SOURCE,
                f"换手率{tr:.1f}%过高, 筹码松动风险"))

        return signals

print("  ✔ VolumePriceStrategy")
