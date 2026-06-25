from __future__ import annotations
"""
财务因子 — 多期财务趋势与衍生指标

覆盖:
  revenue_cagr_3y     — 营收3年CAGR
  profit_cagr_3y      — 净利润3年CAGR
  roe_trend           — ROE趋势（当前 vs 3年前）
  gross_margin_trend  — 毛利率趋势
  debt_ratio          — 资产负债率
  fcf_yield           — 自由现金流收益率
"""

from typing import Optional
import numpy as np

from .base import BaseFactor
from ..core.models import FactorMeta, FactorResult, FactorCategory
from ..core.registry import register_factor


def _safe_cagr(values: list) -> Optional[float]:
    """计算CAGR，处理负数/零"""
    vals = [v for v in values if v is not None and v > 0]
    if len(vals) < 2:
        return None
    vals = vals[:4]  # 最多取4期
    n = len(vals) - 1
    if n <= 0:
        return None
    try:
        return (vals[0] / vals[-1]) ** (1 / n) - 1
    except Exception:
        return None


def _safe_pct_change(values: list) -> Optional[float]:
    """当前 vs 最早的变化率"""
    vals = [v for v in values if v is not None]
    if len(vals) < 2:
        return None
    try:
        if vals[-1] == 0:
            return None
        return (vals[0] - vals[-1]) / abs(vals[-1])
    except Exception:
        return None


@register_factor
class RevenueCAGR(BaseFactor):
    """营收3年复合增长率"""
    meta = FactorMeta(
        name="revenue_cagr_3y",
        category=FactorCategory.GROWTH,
        description="近3年营收复合增长率",
        unit="%",
        higher_is_better=True,
        requires_financials=True,
    )

    def compute(self, code: str) -> Optional[FactorResult]:
        try:
            fin = self._de.financials(code)
            if not fin.success or not fin.data:
                return None
            revs = [f.revenue for f in fin.data[:4] if f.revenue]
            if len(revs) < 2:
                return None
            cagr = _safe_cagr(revs)
            if cagr is None:
                return None
            return FactorResult(
                name="revenue_cagr_3y",
                value=round(float(cagr * 100), 2),
                meta=self.meta,
                details={"revenues": [round(float(r), 2) for r in revs[:4]]}
            )
        except Exception:
            return None


@register_factor
class ProfitCAGR(BaseFactor):
    """净利润3年复合增长率"""
    meta = FactorMeta(
        name="profit_cagr_3y",
        category=FactorCategory.GROWTH,
        description="近3年净利润复合增长率",
        unit="%",
        higher_is_better=True,
        requires_financials=True,
    )

    def compute(self, code: str) -> Optional[FactorResult]:
        try:
            fin = self._de.financials(code)
            if not fin.success or not fin.data:
                return None
            profits = [f.net_profit for f in fin.data[:4] if f.net_profit]
            if len(profits) < 2:
                return None
            cagr = _safe_cagr(profits)
            if cagr is None:
                return None
            return FactorResult(
                name="profit_cagr_3y",
                value=round(float(cagr * 100), 2),
                meta=self.meta,
                details={"profits": [round(float(p), 2) for p in profits[:4]]}
            )
        except Exception:
            return None


@register_factor
class ROETrend(BaseFactor):
    """ROE趋势 — 当前ROE vs 3年前，正值表示改善"""
    meta = FactorMeta(
        name="roe_trend",
        category=FactorCategory.QUALITY,
        description="ROE变化趋势（当前 ROE - 3年前 ROE）",
        unit="%",
        higher_is_better=True,
        requires_financials=True,
    )

    def compute(self, code: str) -> Optional[FactorResult]:
        try:
            fin = self._de.financials(code)
            if not fin.success or not fin.data:
                return None
            roes = [f.roe for f in fin.data[:4] if f.roe]
            if len(roes) < 2:
                return None
            change = roes[0] - roes[-1]
            return FactorResult(
                name="roe_trend",
                value=round(float(change), 2),
                meta=self.meta,
                details={"current_roe": round(float(roes[0]), 2),
                         "prev_roe": round(float(roes[-1]), 2),
                         "all_roes": [round(float(r), 2) for r in roes[:4]]}
            )
        except Exception:
            return None


@register_factor
class GrossMarginTrend(BaseFactor):
    """毛利率趋势"""
    meta = FactorMeta(
        name="gross_margin_trend",
        category=FactorCategory.QUALITY,
        description="毛利率变化趋势（当前 - 3年前），正值改善",
        unit="%",
        higher_is_better=True,
        requires_financials=True,
    )

    def compute(self, code: str) -> Optional[FactorResult]:
        try:
            fin = self._de.financials(code)
            if not fin.success or not fin.data:
                return None
            margins = [f.gross_margin for f in fin.data[:4] if f.gross_margin]
            if len(margins) < 2:
                return None
            change = margins[0] - margins[-1]
            return FactorResult(
                name="gross_margin_trend",
                value=round(float(change), 2),
                meta=self.meta,
                details={"current": round(float(margins[0]), 2),
                         "prev": round(float(margins[-1]), 2)}
            )
        except Exception:
            return None


@register_factor
class DebtRatio(BaseFactor):
    """资产负债率（越低越保守，过高风险）"""
    meta = FactorMeta(
        name="debt_ratio",
        category=FactorCategory.RISK,
        description="资产负债率",
        unit="%",
        higher_is_better=False,  # 越低越安全
        requires_financials=True,
    )

    def compute(self, code: str) -> Optional[FactorResult]:
        try:
            fin = self._de.financials(code)
            if not fin.success or not fin.data:
                return None
            dr = fin.data[0].debt_ratio
            if dr is None:
                return None
            return FactorResult(
                name="debt_ratio",
                value=round(float(dr), 2),
                meta=self.meta,
            )
        except Exception:
            return None


@register_factor
class FCFYield(BaseFactor):
    """自由现金流收益率 — FCF / 市值"""
    meta = FactorMeta(
        name="fcf_yield",
        category=FactorCategory.QUALITY,
        description="自由现金流收益率 = 自由现金流 / 总市值",
        unit="%",
        higher_is_better=True,
        requires_financials=True,
        requires_realtime=True,
    )

    def compute(self, code: str) -> Optional[FactorResult]:
        try:
            cf = self._de.cash_flow(code)
            if not cf.success or not cf.data:
                return None
            fcf = cf.data[0].free_cash_flow
            if fcf is None:
                return None

            r = self._de.realtime(code)
            if not r.success or not r.data:
                return None
            mcap = r.data[0].market_cap
            if not mcap or mcap <= 0:
                return None

            yield_pct = (fcf / mcap) * 100
            return FactorResult(
                name="fcf_yield",
                value=round(float(yield_pct), 3),
                meta=self.meta,
                details={"free_cash_flow": round(float(fcf), 2),
                         "market_cap": round(float(mcap), 2)}
            )
        except Exception:
            return None
