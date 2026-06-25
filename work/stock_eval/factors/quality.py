from __future__ import annotations
"""
质量因子 — 盈利质量与经营效率

覆盖:
  roe                — ROE 净资产收益率
  gross_margin       — 毛利率
  operating_margin   — 营业利润率
  asset_turnover     — 总资产周转率（收入/总资产）
"""

from typing import Optional

from .base import BaseFactor
from ..core.models import FactorMeta, FactorResult, FactorCategory
from ..core.registry import register_factor


@register_factor
class ROE(BaseFactor):
    meta = FactorMeta(
        name="roe",
        category=FactorCategory.QUALITY,
        description="净资产收益率(ROE)，衡量股东回报效率",
        unit="%",
        higher_is_better=True,
        requires_financials=True,
        min_value=0,
        max_value=100,
    )

    def compute(self, code: str) -> Optional[FactorResult]:
        try:
            fin = self._de.financials(code)
            if not fin.success or not fin.data:
                return None
            roe_val = fin.data[0].roe
            if roe_val is None:
                return None
            return FactorResult(name="roe", value=round(float(roe_val), 2),
                                meta=self.meta)
        except Exception:
            return None


@register_factor
class GrossMargin(BaseFactor):
    meta = FactorMeta(
        name="gross_margin",
        category=FactorCategory.QUALITY,
        description="毛利率，反映产品定价权与成本控制",
        unit="%",
        higher_is_better=True,
        requires_financials=True,
    )

    def compute(self, code: str) -> Optional[FactorResult]:
        try:
            fin = self._de.financials(code)
            if not fin.success or not fin.data:
                return None
            gm = fin.data[0].gross_margin
            if gm is None:
                return None
            return FactorResult(
                name="gross_margin", value=round(float(gm), 2),
                meta=self.meta)
        except Exception:
            return None


@register_factor
class OperatingMargin(BaseFactor):
    meta = FactorMeta(
        name="operating_margin",
        category=FactorCategory.QUALITY,
        description="营业利润率 = 营业利润 / 营业收入",
        unit="%",
        higher_is_better=True,
        requires_financials=True,
    )

    def compute(self, code: str) -> Optional[FactorResult]:
        try:
            inc = self._de.income_statement(code)
            if not inc.success or not inc.data:
                return None
            latest = inc.data[0]
            rev = latest.revenue or 0
            op = latest.operating_profit or 0
            if rev == 0:
                return None
            margin = op / rev * 100
            return FactorResult(
                name="operating_margin", value=round(float(margin), 2),
                meta=self.meta,
                details={"revenue": round(float(rev), 2),
                         "operating_profit": round(float(op), 2)}
            )
        except Exception:
            return None


@register_factor
class AssetTurnover(BaseFactor):
    """总资产周转率 = 营业收入 / 总资产"""
    meta = FactorMeta(
        name="asset_turnover",
        category=FactorCategory.QUALITY,
        description="总资产周转率 = 营收 / 总资产，衡量运营效率",
        unit="倍",
        higher_is_better=True,
        requires_financials=True,
    )

    def compute(self, code: str) -> Optional[FactorResult]:
        try:
            fin = self._de.financials(code)
            bs = self._de.balance_sheet(code)
            if not fin.success or not fin.data:
                return None
            if not bs.success or not bs.data:
                return None
            rev = fin.data[0].revenue or 0
            assets = bs.data[0].total_assets or 0
            if assets == 0:
                return None
            turnover = rev / assets
            return FactorResult(
                name="asset_turnover", value=round(float(turnover), 3),
                meta=self.meta,
                details={"revenue": round(float(rev), 2),
                         "total_assets": round(float(assets), 2)}
            )
        except Exception:
            return None


@register_factor
class NetProfitMargin(BaseFactor):
    """净利率 = 净利润 / 营收"""
    meta = FactorMeta(
        name="net_profit_margin",
        category=FactorCategory.QUALITY,
        description="净利润率 = 净利润 / 营业收入",
        unit="%",
        higher_is_better=True,
        requires_financials=True,
    )

    def compute(self, code: str) -> Optional[FactorResult]:
        try:
            fin = self._de.financials(code)
            if not fin.success or not fin.data:
                return None
            rev = fin.data[0].revenue or 0
            np_val = fin.data[0].net_profit or 0
            if rev == 0:
                return None
            npm = np_val / rev * 100
            return FactorResult(
                name="net_profit_margin", value=round(float(npm), 2),
                meta=self.meta)
        except Exception:
            return None
