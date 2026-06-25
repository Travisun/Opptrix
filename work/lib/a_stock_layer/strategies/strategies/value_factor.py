"""
Value Factor Strategy — 价值/基本面因子
=========================================
来源: Fama-French (HML), Novy-Marx (盈利能力), AQR (质量)

核心逻辑:
- PB-ROE 象限分析
- 估值分位 (PE/PB 历史分位)
- 盈利质量 (毛利率、ROE)
- 盈利趋势 (YoY 增速)
- 戴维斯双击信号 (低PE + 低PEG + 盈利改善)
"""
from __future__ import annotations

from typing import Any, Dict, List

from ..base import BaseStrategy, Signal


class ValueFactorStrategy(BaseStrategy):
    """价值/基本面因子 — PB-ROE + 戴维斯双击"""

    NAME = "value_factor"
    DISPLAY_NAME = "价值因子 + 基本面"
    SOURCE = "Fama-French + AQR"
    WEIGHT = 0.10

    def analyze(self, data: Dict[str, Any]) -> List[Signal]:
        signals = []
        ti = data.get("indicators")
        rt = data.get("_realtime")
        price = data.get("price")

        if ti is None or price is None:
            return signals

        last = ti.iloc[-1] if hasattr(ti, 'iloc') else ti

        # ── 估值位置 (通过基本面因子) ──────────────────────
        factors = data.get("factors", {})
        pe = factors.get("pe_ttm", 0) or 0
        pb = factors.get("pb", 0) or 0
        roe = factors.get("roe", 0) or 0
        earnings_yield = factors.get("earnings_yield", 0) or 0
        div_yield = factors.get("dividend_yield", 0) or 0

        # PB-ROE 象限
        if pb > 0 and roe > 0:
            if pb < 3 and roe > 15:
                signals.append(Signal("PB_ROE_Golden", "BUY", 0.50, self.SOURCE,
                    f"PB={pb:.1f} ROE={roe:.1f}%, PB-ROE象限优良"))
            elif pb > 10 and roe < 10:
                signals.append(Signal("PB_ROE_Trap", "SELL", 0.40, self.SOURCE,
                    f"PB={pb:.1f} ROE={roe:.1f}%, 高PB低ROE警惕"))

        # 股息率
        if div_yield > 3:
            signals.append(Signal("High_Dividend", "BUY", 0.30, self.SOURCE,
                f"股息率{div_yield:.1f}% > 3%"))

        # 盈利收益率 vs 国债 (简化)
        if earnings_yield > 5:
            signals.append(Signal("Earnings_Yield_Attractive", "BUY", 0.25, self.SOURCE,
                f"盈利收益率{earnings_yield:.1f}%"))

        # 盈利趋势
        ny = factors.get("net_profit_yoy", 0) or 0
        if ny > 30:
            signals.append(Signal("Earnings_Growth", "BUY", 0.30, self.SOURCE,
                f"净利润同比{ny:.0f}%, 高增长"))
        elif ny < -30:
            signals.append(Signal("Earnings_Danger", "SELL", 0.40, self.SOURCE,
                f"净利润同比{ny:.0f}%, 大幅下滑"))

        # 营收趋势
        ry = factors.get("revenue_yoy", 0) or 0
        if ry > 20:
            signals.append(Signal("Revenue_Growth", "BUY", 0.20, self.SOURCE,
                f"营收同比{ry:.0f}%, 高增长"))

        # ── 均线偏离度 (MA Bias) ──────────────────────────
        ma_bias = last.get("ma_bias")
        if ma_bias is not None:
            if ma_bias < -15:
                signals.append(Signal("MA_Deep_Below", "BUY", 0.35, self.SOURCE,
                    f"价格远离MA20({abs(ma_bias):.0f}%), 超跌"))
            elif ma_bias > 20:
                signals.append(Signal("MA_Far_Above", "SELL", 0.30, self.SOURCE,
                    f"价格远超MA20({ma_bias:.0f}%), 偏离过大"))

        return signals

print("  ✔ ValueFactorStrategy")
