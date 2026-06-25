from __future__ import annotations
"""
BaseFactor — 所有因子的抽象基类

子类需要:
  1. 设置类属性 `meta: FactorMeta`
  2. 实现 `compute(self, code) -> Optional[FactorResult]`
"""

from abc import ABC, abstractmethod
from typing import Optional

from a_stock_layer import AshareEngine
from ..core.models import FactorMeta, FactorResult


class BaseFactor(ABC):
    """
    因子抽象基类

    用法:
        class PEBand(BaseFactor):
            meta = FactorMeta(
                name="pe_band",
                category=FactorCategory.VALUATION,
                description="PE 处于历史估值的百分位",
                unit="%",
                higher_is_better=False,
                requires_realtime=True,
                requires_financials=True,
            )

            def compute(self, code: str) -> Optional[FactorResult]:
                # 实现计算逻辑
                ...
    """

    meta: FactorMeta = None  # 子类必须覆盖

    def __init__(self, data_engine: AshareEngine):
        self._de = data_engine

    @abstractmethod
    def compute(self, code: str) -> Optional[FactorResult]:
        """
        计算因子值
        返回 None 表示该因子对这只股票不适用
        """
        ...

    @property
    def engine(self):
        return self._de

    def __repr__(self):
        name = self.meta.name if self.meta else "?"
        return f"<{type(self).__name__}[{name}]>"
