from __future__ import annotations
"""
时间序列 delta 因子 — 财务指标的边际变化量

投研的核心逻辑是"变化"而非"现状"。
这些因子衡量季度的边际变化，用于识别业绩拐点。

覆盖:
  roe_delta_1q             ROE 环比变化（本季 - 上季）
  roe_delta_4q             ROE 同比变化（本季 - 一年前同季）
  revenue_delta_1q         营收环比变化率
  revenue_delta_4q         营收同比增长率
  profit_delta_1q          净利润环比变化率
  profit_delta_4q          净利润同比增长率
  gross_margin_delta_1q    毛利率环比变化（百分点）
  gross_margin_delta_4q    毛利率同比变化
  debt_ratio_delta_1q      负债率环比变化
  fcf_delta_1q             自由现金流环比变化率
"""

from typing import Optional
import numpy as np

from .base import BaseFactor
from ..core.models import FactorMeta, FactorResult, FactorCategory
from ..core.registry import register_factor


def _safe_delta(new, old):
    """安全计算差值，None 处理"""
    if new is None or old is None:
        return None
    return new - old


def _safe_pct_change(new, old):
    """安全计算变化率"""
    if new is None or old is None:
        return None
    if old == 0:
        return None
    return (new - old) / abs(old) * 100


def _get_financial_series(engine, code, attr: str, n: int = 5):
    """从 financials 获取一个字段的多期时间序列，最近的在最前"""
    try:
        fin = engine.financials(code)
        if not fin.success or not fin.data:
            return []
        return [getattr(f, attr) for f in fin.data[:n]]
    except Exception:
        return []


# ── ROE 变化因子 ────────────────────────────────────

@register_factor
class ROEDelta1Q(BaseFactor):
    meta = FactorMeta(
        name="roe_delta_1q",
        category=FactorCategory.GROWTH,
        description="ROE 环比变化（本季 ROE - 上季 ROE），正值改善",
        unit="%",
        higher_is_better=True,
        requires_financials=True,
    )

    def compute(self, code: str) -> Optional[FactorResult]:
        series = _get_financial_series(self._de, code, "roe", 3)
        if len(series) < 2:
            return None
        delta = _safe_delta(series[0], series[1])
        if delta is None:
            return None
        return FactorResult(
            name="roe_delta_1q", value=round(float(delta), 2),
            meta=self.meta,
            details={"current_roe": series[0], "prev_roe": series[1]}
        )


@register_factor
class ROEDelta4Q(BaseFactor):
    meta = FactorMeta(
        name="roe_delta_4q",
        category=FactorCategory.GROWTH,
        description="ROE 同比变化（本季 - 4季前），正值改善",
        unit="%",
        higher_is_better=True,
        requires_financials=True,
    )

    def compute(self, code: str) -> Optional[FactorResult]:
        series = _get_financial_series(self._de, code, "roe", 5)
        if len(series) < 5:
            # 数据不足时用能取到的最大间隔
            if len(series) < 2:
                return None
            delta = _safe_delta(series[0], series[-1])
        else:
            delta = _safe_delta(series[0], series[4])
        if delta is None:
            return None
        return FactorResult(
            name="roe_delta_4q", value=round(float(delta), 2),
            meta=self.meta,
        )


# ── 营收变化因子 ────────────────────────────────────

@register_factor
class RevenueDelta1Q(BaseFactor):
    meta = FactorMeta(
        name="revenue_delta_1q",
        category=FactorCategory.GROWTH,
        description="营收环比变化率（本季 / 上季 - 1），正值加速",
        unit="%",
        higher_is_better=True,
        requires_financials=True,
    )

    def compute(self, code: str) -> Optional[FactorResult]:
        series = _get_financial_series(self._de, code, "revenue", 3)
        if len(series) < 2:
            return None
        chg = _safe_pct_change(series[0], series[1])
        if chg is None:
            return None
        return FactorResult(
            name="revenue_delta_1q", value=round(float(chg), 2),
            meta=self.meta,
        )


@register_factor
class RevenueDelta4Q(BaseFactor):
    meta = FactorMeta(
        name="revenue_delta_4q",
        category=FactorCategory.GROWTH,
        description="营收同比增长率（本季 / 4季前 - 1），正值加速",
        unit="%",
        higher_is_better=True,
        requires_financials=True,
    )

    def compute(self, code: str) -> Optional[FactorResult]:
        series = _get_financial_series(self._de, code, "revenue", 5)
        if len(series) < 2:
            return None
        old = series[-1] if len(series) >= 5 else series[-1]
        chg = _safe_pct_change(series[0], old)
        if chg is None:
            return None
        return FactorResult(
            name="revenue_delta_4q", value=round(float(chg), 2),
            meta=self.meta,
        )


# ── 净利润变化因子 ──────────────────────────────────

@register_factor
class ProfitDelta1Q(BaseFactor):
    meta = FactorMeta(
        name="profit_delta_1q",
        category=FactorCategory.GROWTH,
        description="净利润环比变化率（本季 / 上季 - 1），正值加速",
        unit="%",
        higher_is_better=True,
        requires_financials=True,
    )

    def compute(self, code: str) -> Optional[FactorResult]:
        series = _get_financial_series(self._de, code, "net_profit", 3)
        if len(series) < 2:
            return None
        chg = _safe_pct_change(series[0], series[1])
        if chg is None:
            return None
        return FactorResult(
            name="profit_delta_1q", value=round(float(chg), 2),
            meta=self.meta,
        )


@register_factor
class ProfitDelta4Q(BaseFactor):
    meta = FactorMeta(
        name="profit_delta_4q",
        category=FactorCategory.GROWTH,
        description="净利润同比增长率（本季 / 4季前 - 1），正值加速",
        unit="%",
        higher_is_better=True,
        requires_financials=True,
    )

    def compute(self, code: str) -> Optional[FactorResult]:
        series = _get_financial_series(self._de, code, "net_profit", 5)
        if len(series) < 2:
            return None
        old = series[-1] if len(series) >= 5 else series[-1]
        chg = _safe_pct_change(series[0], old)
        if chg is None:
            return None
        return FactorResult(
            name="profit_delta_4q", value=round(float(chg), 2),
            meta=self.meta,
        )


# ── 毛利率变化因子 ──────────────────────────────────

@register_factor
class GrossMarginDelta1Q(BaseFactor):
    meta = FactorMeta(
        name="gross_margin_delta_1q",
        category=FactorCategory.GROWTH,
        description="毛利率环比变化（百分点），正值定价能力改善",
        unit="%",
        higher_is_better=True,
        requires_financials=True,
    )

    def compute(self, code: str) -> Optional[FactorResult]:
        series = _get_financial_series(self._de, code, "gross_margin", 3)
        if len(series) < 2:
            return None
        delta = _safe_delta(series[0], series[1])
        if delta is None:
            return None
        return FactorResult(
            name="gross_margin_delta_1q", value=round(float(delta), 2),
            meta=self.meta,
        )


@register_factor
class GrossMarginDelta4Q(BaseFactor):
    meta = FactorMeta(
        name="gross_margin_delta_4q",
        category=FactorCategory.GROWTH,
        description="毛利率同比变化（百分点），正值定价能力改善",
        unit="%",
        higher_is_better=True,
        requires_financials=True,
    )

    def compute(self, code: str) -> Optional[FactorResult]:
        series = _get_financial_series(self._de, code, "gross_margin", 5)
        if len(series) < 5:
            if len(series) < 2:
                return None
            delta = _safe_delta(series[0], series[-1])
        else:
            delta = _safe_delta(series[0], series[4])
        if delta is None:
            return None
        return FactorResult(
            name="gross_margin_delta_4q", value=round(float(delta), 2),
            meta=self.meta,
        )


# ── 负债率变化因子 ──────────────────────────────────

@register_factor
class DebtRatioDelta1Q(BaseFactor):
    meta = FactorMeta(
        name="debt_ratio_delta_1q",
        category=FactorCategory.RISK,
        description="资产负债率环比变化（百分点），正值杠杆上升（风险增加）",
        unit="%",
        higher_is_better=False,  # 负债率上升是风险信号
        requires_financials=True,
    )

    def compute(self, code: str) -> Optional[FactorResult]:
        series = _get_financial_series(self._de, code, "debt_ratio", 3)
        if len(series) < 2:
            return None
        delta = _safe_delta(series[0], series[1])
        if delta is None:
            return None
        return FactorResult(
            name="debt_ratio_delta_1q", value=round(float(delta), 2),
            meta=self.meta,
            details={"current": series[0], "prev": series[1]}
        )


# ── 自由现金流变化因子 ──────────────────────────────

@register_factor
class FCFDelta1Q(BaseFactor):
    meta = FactorMeta(
        name="fcf_delta_1q",
        category=FactorCategory.CASHFLOW,
        description="自由现金流环比变化率，正值现金流改善",
        unit="%",
        higher_is_better=True,
        requires_financials=True,
    )

    def compute(self, code: str) -> Optional[FactorResult]:
        try:
            cf = self._de.cash_flow(code)
            if not cf.success or len(cf.data) < 2:
                return None
            fcf_vals = [d.free_cash_flow for d in cf.data[:3] if d.free_cash_flow]
            if len(fcf_vals) < 2:
                return None
            chg = _safe_pct_change(fcf_vals[0], fcf_vals[1])
            if chg is None:
                return None
            return FactorResult(
                name="fcf_delta_1q", value=round(float(chg), 2),
                meta=self.meta,
            )
        except Exception:
            return None


# ── 边际变化综合因子 ────────────────────────────────

@register_factor
class ImprovementScore(BaseFactor):
    """
    综合改善评分 — 多维度边际变化的汇总

    计算方法: ROE同比变化 + 毛利率同比变化 - 负债率同比变化
    正值表示整体经营在改善。
    """
    meta = FactorMeta(
        name="improvement_score",
        category=FactorCategory.COMPOSITE,
        description="多维边际变化综合评分 = ROE同比变化 + 毛利率同比变化 - 负债率同比变化",
        unit="",
        higher_is_better=True,
        requires_financials=True,
    )

    def compute(self, code: str) -> Optional[FactorResult]:
        try:
            fin = self._de.financials(code)
            if not fin.success or len(fin.data) < 3:
                return None

            # 取最近两期
            roe_0 = fin.data[0].roe
            roe_1 = fin.data[-1].roe
            gm_0 = fin.data[0].gross_margin
            gm_1 = fin.data[-1].gross_margin
            dr_0 = fin.data[0].debt_ratio
            dr_1 = fin.data[-1].debt_ratio

            if any(v is None for v in [roe_0, roe_1, gm_0, gm_1]):
                return None

            score = (roe_0 - roe_1) + (gm_0 - gm_1)
            if dr_0 is not None and dr_1 is not None:
                score -= (dr_0 - dr_1)  # 负债率上升为负向

            return FactorResult(
                name="improvement_score", value=round(float(score), 2),
                meta=self.meta,
                details={
                    "roe_change": round(float(roe_0 - roe_1), 2),
                    "gm_change": round(float(gm_0 - gm_1), 2),
                    "debt_change": round(float(dr_0 - dr_1), 2) if dr_0 is not None and dr_1 is not None else None,
                }
            )
        except Exception:
            return None
