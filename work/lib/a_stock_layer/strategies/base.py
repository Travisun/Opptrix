"""
Base Strategy — 策略基类和信号定义
=====================================
"""
from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List


@dataclass
class Signal:
    """单条交易信号"""
    name: str
    direction: str          # "BUY" / "SELL" / "HOLD"
    strength: float         # 0~1
    source: str             # 策略来源
    reason: str = ""        # 信号理由

    def __post_init__(self):
        self.strength = max(0.0, min(1.0, self.strength))


@dataclass
class AnalysisResult:
    """个股完整分析结果"""
    code: str
    strategy_name: str = ""
    signals: List[Signal] = field(default_factory=list)
    score: float = 0.0          # -100 ~ +100
    verdict: str = "HOLD"       # BUY / SELL / HOLD
    confidence: float = 0.0     # 0~1
    price: float = 0.0
    reasons: List[str] = field(default_factory=list)
    details: dict = field(default_factory=dict)


class BaseStrategy:
    """所有策略的基类。子类只需实现 analyze() 方法。"""

    NAME = "base"
    DISPLAY_NAME = "基础策略"
    SOURCE = ""
    WEIGHT = 0.1

    def analyze(self, data: Dict[str, Any]) -> List[Signal]:
        """分析数据，返回信号列表。"""
        raise NotImplementedError

    def __repr__(self) -> str:
        return f"<{self.DISPLAY_NAME} ({self.SOURCE}) weight={self.WEIGHT}>"

print("✔ base.py 加载")
