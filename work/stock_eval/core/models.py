"""
数据模型 — 因子元信息、计算结果、股票评估快照
"""

from dataclasses import dataclass, field
from typing import Optional
from enum import Enum


class FactorCategory(Enum):
    """因子分类枚举 — 新增分类直接加在这里"""
    VALUATION = "valuation"       # 估值因子
    FINANCIAL = "financial"       # 财务因子
    TECHNICAL = "technical"       # 技术面因子
    MOMENTUM = "momentum"         # 动量因子
    QUALITY = "quality"           # 质量因子 (盈利质量/现金流质量)
    MARKET = "market"             # 市场情绪因子
    GROWTH = "growth"             # 成长因子
    RISK = "risk"
    CASHFLOW = "cashflow"                 # 风险因子
    COMPOSITE = "composite"       # 综合因子

    @classmethod
    def from_str(cls, s: str) -> "FactorCategory":
        for cat in cls:
            if cat.value == s:
                return cat
        raise ValueError(f"Unknown category: {s}")


@dataclass
class FactorMeta:
    """
    因子元数据 — 每个因子对应的描述信息

    用法: 新增一个因子时声明此元数据，注册到 FactorRegistry
    """
    name: str                           # 唯一标识，如 "pe_percentile"
    category: FactorCategory            # 分类
    description: str                    # 人话描述
    unit: str = ""                      # 单位 ("%", "倍", "" 等)
    higher_is_better: bool = True       # 是否"越大越好"
    requires_financials: bool = False   # 是否需要财务数据
    requires_kline: bool = False        # 是否需要K线数据
    requires_realtime: bool = False     # 是否需要实时行情
    min_value: Optional[float] = None   # 合理范围下限（筛选时参考）
    max_value: Optional[float] = None   # 合理范围上限
    examples: tuple = ()                # 用法示例


@dataclass
class FactorResult:
    """
    单因子计算结果

    value=None 表示该因子当前无法计算（数据不足/股票类型不匹配）
    """
    name: str
    value: Optional[float]
    meta: FactorMeta
    details: dict = field(default_factory=dict)  # 额外上下文（如使用的财报日期）


@dataclass
class StockSnapshot:
    """
    个股评估快照 — 一次评估的全部输出

    .factors 存全部 FactorResult
    .scores 是评分系统注入的 {维度: 分}
    """
    code: str
    name: str
    factors: dict[str, FactorResult] = field(default_factory=dict)
    scores: dict[str, float] = field(default_factory=dict)
    total_score: Optional[float] = None
    rank: Optional[int] = None

    def get(self, factor_name: str) -> Optional[float]:
        """快捷取值"""
        fr = self.factors.get(factor_name)
        return fr.value if fr else None

    def to_dict(self) -> dict:
        """序列化，方便转 DataFrame"""
        d = {"code": self.code, "name": self.name,
             "total_score": self.total_score, "rank": self.rank}
        d.update(self.scores)
        for fname, fr in self.factors.items():
            d[fname] = fr.value
        return d
