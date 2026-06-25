from __future__ import annotations
"""
条件 DSL — 筛选条件的定义和验证

用法:
    c1 = Condition("pe_percentile", "<", 20)    # PE处于最低20%分位
    c2 = Condition("roe", ">", 15)               # ROE > 15%
    c3 = Condition("debt_ratio", "<", 50)        # 负债率 < 50%
    c4 = Condition("dividend_yield", ">", 3)     # 股息率 > 3%
"""

from dataclasses import dataclass
from typing import Any, Optional
import operator


# 支持的运算符
OPERATORS = {
    ">": operator.gt,
    ">=": operator.ge,
    "<": operator.lt,
    "<=": operator.le,
    "==": operator.eq,
    "!=": operator.ne,
}


@dataclass
class Condition:
    """
    单条筛选条件

    factor:  因子名称（与 FactorRegistry 中的 name 一致）
    op:      运算符 (> >= < <= == !=)
    value:   比较值

    特殊用法:
      factor="debt_ratio", op="<", value=50   → 负债率 < 50%
      factor="pe_percentile", op="<", value=20 → PE处于最低20%分位
    """
    factor: str
    op: str
    value: Any

    def __post_init__(self):
        if self.op not in OPERATORS:
            raise ValueError(f"不支持的运算符: {self.op}，"
                             f"可选: {list(OPERATORS.keys())}")

    def evaluate(self, factor_value: Any) -> bool:
        """
        对单个因子值执行条件判断
        factor_value 为 None 时返回 False（数据不足视为不满足）
        """
        if factor_value is None:
            return False
        try:
            op_func = OPERATORS[self.op]
            return bool(op_func(factor_value, self.value))
        except (TypeError, ValueError):
            return False

    def to_dict(self) -> dict:
        return {"factor": self.factor, "op": self.op, "value": self.value}

    def __repr__(self):
        return f"Condition({self.factor} {self.op} {self.value})"


@dataclass
class ConditionGroup:
    """
    条件组 — 多个条件 AND/OR 组合

    用法:
        g = ConditionGroup([
            Condition("roe", ">", 15),
            Condition("debt_ratio", "<", 50),
        ], logic="AND")
    """
    conditions: list[Condition]
    logic: str = "AND"  # "AND" 或 "OR"

    def __post_init__(self):
        if self.logic not in ("AND", "OR"):
            raise ValueError(f"logic 必须是 AND 或 OR，收到: {self.logic}")

    def evaluate(self, factor_values: dict[str, Any]) -> bool:
        results = [c.evaluate(factor_values.get(c.factor))
                   for c in self.conditions]
        if self.logic == "AND":
            return all(results)
        else:
            return any(results)

    def __repr__(self):
        return f"ConditionGroup({self.logic}, {len(self.conditions)}条件)"
