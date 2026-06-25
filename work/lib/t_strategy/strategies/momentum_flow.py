"""
Momentum Flow Strategy — 动量 + 资金流向
==========================================
来源: Morgan Stanley Quantitative Strategy

核心逻辑:
- MACD 金叉/死叉/柱状线扩张收缩
- KDJ 超买超卖 + 金叉死叉
- 主力资金净流入/流出
- 融资融券余额变化
- Force Index
"""
from __future__ import annotations

from typing import Any, Dict, List

from ..base import BaseStrategy, Signal


class MomentumFlowStrategy(BaseStrategy):
    """动量 + 资金流向 — MACD+KDJ+主力资金确认"""

    NAME = "momentum_flow"
    DISPLAY_NAME = "动量 + 资金流向"
    SOURCE = "Morgan Stanley Quant"
    WEIGHT = 0.20

    def analyze(self, data: Dict[str, Any]) -> List[Signal]:
        signals = []
        ti = data.get("indicators")
        mf = data.get("money_flow")
        if ti is None:
            return signals

        last = ti.iloc[-1] if hasattr(ti, 'iloc') else ti
        df = ti if hasattr(ti, 'iloc') else None

        # ── MACD ───────────────────────────────────────────────
        macd = last.get("macd"); sig = last.get("macd_signal"); hist = last.get("macd_hist")
        if all(v is not None for v in [macd, sig, hist]):
            # 金叉
            if macd > sig and hist > 0 and df is not None and len(df) >= 2:
                prev = df.iloc[-2]
                if prev.get("macd", 0) < prev.get("macd_signal", 0):
                    signals.append(Signal("MACD_GoldenCross", "BUY", 0.65, self.SOURCE, "MACD金叉"))
                else:
                    # 柱状线扩张
                    if len(df) >= 3:
                        h1 = df.iloc[-2].get("macd_hist", 0) or 0
                        h2 = df.iloc[-3].get("macd_hist", 0) or 0
                        if abs(hist or 0) > abs(h1) > abs(h2):
                            signals.append(Signal("MACD_Hist_Expand", "BUY", 0.40, self.SOURCE, "MACD柱扩张"))
                    else:
                        signals.append(Signal("MACD_Bullish", "BUY", 0.30, self.SOURCE, "MACD多头运行"))
            # 死叉
            elif macd < sig and hist < 0 and df is not None and len(df) >= 2:
                prev = df.iloc[-2]
                if prev.get("macd", 0) > prev.get("macd_signal", 0):
                    signals.append(Signal("MACD_DeathCross", "SELL", 0.65, self.SOURCE, "MACD死叉"))
                else:
                    if len(df) >= 3:
                        h1 = df.iloc[-2].get("macd_hist", 0) or 0
                        h2 = df.iloc[-3].get("macd_hist", 0) or 0
                        if abs(hist or 0) > abs(h1) > abs(h2):
                            signals.append(Signal("MACD_Hist_Shrink", "SELL", 0.40, self.SOURCE, "MACD柱扩张(空)"))
                    else:
                        signals.append(Signal("MACD_Bearish", "SELL", 0.30, self.SOURCE, "MACD空头运行"))

        # ── KDJ ────────────────────────────────────────────────
        k = last.get("kdj_k"); d = last.get("kdj_d"); j = last.get("kdj_j")
        if all(v is not None for v in [k, d, j]):
            if j < 0 and k < 20:
                signals.append(Signal("KDJ_Oversold", "BUY", 0.50, self.SOURCE, f"KDJ超卖 J={j:.0f}"))
            elif j > 100 and k > 80:
                signals.append(Signal("KDJ_Overbought", "SELL", 0.50, self.SOURCE, f"KDJ超买 J={j:.0f}"))
            elif k > d and df is not None and len(df) >= 2:
                pk = df.iloc[-2].get("kdj_k", 0); pd_ = df.iloc[-2].get("kdj_d", 0)
                if pk < pd_:
                    signals.append(Signal("KDJ_CrossUp", "BUY", 0.35, self.SOURCE, "KDJ金叉"))
            elif k < d and df is not None and len(df) >= 2:
                pk = df.iloc[-2].get("kdj_k", 0); pd_ = df.iloc[-2].get("kdj_d", 0)
                if pk > pd_:
                    signals.append(Signal("KDJ_CrossDown", "SELL", 0.35, self.SOURCE, "KDJ死叉"))

        # ── ADX 趋势强度 ─────────────────────────────────────
        adx_val = last.get("adx")
        plus_di = last.get("plus_di")
        minus_di = last.get("minus_di")
        if adx_val is not None:
            if adx_val > 25 and plus_di is not None and minus_di is not None:
                if plus_di > minus_di:
                    signals.append(Signal("ADX_Strong_Up", "BUY", 0.30, self.SOURCE,
                        f"ADX={adx_val:.0f}+DI>{minus_di:.0f}, 上升趋势强劲"))
                else:
                    signals.append(Signal("ADX_Strong_Down", "SELL", 0.30, self.SOURCE,
                        f"ADX={adx_val:.0f}-DI>{plus_di:.0f}, 下降趋势强劲"))

        # ── TRIX ─────────────────────────────────────────────
        trix_val = last.get("trix")
        if trix_val is not None:
            if trix_val > 0 and df is not None and len(df) >= 2:
                prev_t = df.iloc[-2].get("trix", 0) or 0
                if prev_t < 0:
                    signals.append(Signal("TRIX_CrossUp", "BUY", 0.40, self.SOURCE, f"TRIX上穿零轴({trix_val:.1f})"))

        # ── 主力资金流 ──────────────────────────────────────
        if mf is not None and not mf.empty:
            lm = mf.iloc[-1]
            mn = lm.get("main_net", 0) or 0
            mp = lm.get("main_net_pct", 0) or 0
            if mn > 0 and abs(mp) > 3:
                signals.append(Signal("MoneyFlow_In", "BUY", min(1.0, abs(mp) / 20), self.SOURCE,
                    f"主力净流入{mn/1e8:.1f}亿({mp:.1f}%)"))
            elif mn < 0 and abs(mp) > 3:
                signals.append(Signal("MoneyFlow_Out", "SELL", min(1.0, abs(mp) / 20), self.SOURCE,
                    f"主力净流出{abs(mn)/1e8:.1f}亿({abs(mp):.1f}%)"))

        return signals

print("  ✔ MomentumFlowStrategy")
