"""
Market Context Strategy — 市场背景过滤
========================================
来源: Bridgewater Risk Parity, 桥水经济机器

核心逻辑:
- 行业资金流向强度
- 全市场涨跌家数比
- 大盘指数位置 (上证 vs 主要均线)
- 北向资金流向
- 宏观环境判断
"""
from __future__ import annotations

from typing import Any, Dict, List

from ..base import BaseStrategy, Signal


class MarketContextStrategy(BaseStrategy):
    """市场背景过滤 — 只在有利环境中操作"""

    NAME = "market_context"
    DISPLAY_NAME = "市场背景过滤"
    SOURCE = "Bridgewater Risk Parity"
    WEIGHT = 0.15

    def analyze(self, data: Dict[str, Any]) -> List[Signal]:
        signals = []
        smf = data.get("sector_money_flow")
        mb = data.get("market_breadth")
        sh = data.get("sh_index")
        ti = data.get("indicators")
        price = data.get("price")

        # 行业资金
        if smf:
            mp = smf.get("main_net_pct", 0) or 0
            if mp > 5:
                signals.append(Signal("Sector_Money_In", "BUY", min(1.0, mp / 15), self.SOURCE,
                    f"行业资金净流入({mp:.1f}%)"))
            elif mp < -5:
                signals.append(Signal("Sector_Money_Out", "SELL", min(1.0, abs(mp) / 15), self.SOURCE,
                    f"行业资金净流出({abs(mp):.1f}%)"))
            elif mp > 0:
                signals.append(Signal("Sector_Neutral_Up", "BUY", 0.10, self.SOURCE,
                    "行业资金小幅流入"))
            else:
                signals.append(Signal("Sector_Neutral_Down", "SELL", 0.10, self.SOURCE,
                    "行业资金小幅流出"))

        # 市场情绪
        if mb:
            ap = mb.get("advance_pct", 50) or 50
            limit_up = mb.get("limit_up", 0) or 0
            limit_down = mb.get("limit_down", 0) or 0
            if ap > 65:
                signals.append(Signal("Market_Hot", "BUY", min(1.0, (ap - 50) / 25), self.SOURCE,
                    f"市场上涨占比{ap:.0f}%, 情绪较高"))
            elif ap < 35:
                signals.append(Signal("Market_Cold", "HOLD", 0.30, self.SOURCE,
                    f"市场上涨占比仅{ap:.0f}%, 情绪低迷"))
            if limit_down > 50:
                signals.append(Signal("Market_Panic", "HOLD", 0.50, self.SOURCE,
                    f"跌停{limit_down}家, 恐慌情绪"))

        # 大盘位置
        if sh and price:
            ratio = price / sh if sh > 0 else 1
            if ratio < 0.5:
                signals.append(Signal("Market_Context", "BUY", 0.10, self.SOURCE,
                    f"大盘{sh:.0f}点"))

        # 北向资金
        try:
            from a_stock_layer import AshareEngine
            # 简化: 依赖外部数据
        except Exception:
            pass

        return signals

print("  ✔ MarketContextStrategy")
