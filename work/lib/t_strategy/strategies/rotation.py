"""
Rotation Strategy — 行业/板块轮动
====================================
来源: 中金行业比较, 美林投资时钟, MS Sector Rotation

核心逻辑:
- 行业资金流向排名
- 行业相对强度 (RS)
- 概念板块热度
- 行业 ETF 动量
"""
from __future__ import annotations

from typing import Any, Dict, List

from ..base import BaseStrategy, Signal


class RotationStrategy(BaseStrategy):
    """行业轮动 — 在强势行业中做 T"""

    NAME = "rotation"
    DISPLAY_NAME = "行业轮动分析"
    SOURCE = "中金行业比较 + MS Sector"
    WEIGHT = 0.10

    def analyze(self, data: Dict[str, Any]) -> List[Signal]:
        signals = []
        smf = data.get("sector_money_flow")
        industry = data.get("industry", "")
        concepts = data.get("concepts", [])

        # 行业资金
        if smf:
            mp = smf.get("main_net_pct", 0) or 0
            if mp > 3:
                signals.append(Signal("Sector_Strong", "BUY", min(1.0, mp / 10), self.SOURCE,
                    f"所属行业\"{industry}\"资金流入{mp:.1f}%, 强于大盘"))
            elif mp < -3:
                signals.append(Signal("Sector_Weak", "SELL", min(1.0, abs(mp) / 10), self.SOURCE,
                    f"所属行业\"{industry}\"资金流出{abs(mp):.1f}%, 弱于大盘"))

        # 概念板块热度
        hot_concepts = [c for c in concepts if any(kw in c for kw in ["AI", "数字", "新能源", "半导体", "医药", "消费", "金融"])]
        if hot_concepts:
            signals.append(Signal("Hot_Concept", "BUY", 0.15, self.SOURCE,
                f"覆盖热门概念: {'/'.join(hot_concepts[:3])}"))

        return signals

print("  ✔ RotationStrategy")
