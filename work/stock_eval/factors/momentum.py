from __future__ import annotations
"""
动量因子 — 价格动量与反转

覆盖:
  momentum_1m       — 1月动量（近20日涨幅）
  momentum_3m       — 3月动量
  momentum_6m       — 6月动量
  momentum_12m_1m   — 12个月动量(剔除最近1个月，Jegadeesh & Titman)
  short_term_reversal — 短期反转（近5日跌幅，反转策略用）
"""

from typing import Optional
import numpy as np

from .base import BaseFactor
from ..core.models import FactorMeta, FactorResult, FactorCategory
from ..core.registry import register_factor


def _momentum(kline, period_days: int, label: str) -> Optional[FactorResult]:
    """通用动量计算"""
    if not kline.success or len(kline.data) < period_days + 5:
        return None
    closes = np.array([d.close for d in kline.data])
    if len(closes) < period_days + 1:
        return None
    old = closes[-period_days - 1]
    cur = closes[-1]
    if old == 0:
        return None
    ret = (cur - old) / old * 100
    return round(float(ret), 2)


@register_factor
class Momentum1M(BaseFactor):
    meta = FactorMeta(
        name="momentum_1m",
        category=FactorCategory.MOMENTUM,
        description="近1个月(20交易日)涨跌幅",
        unit="%",
        higher_is_better=True,
        requires_kline=True,
    )

    def compute(self, code: str) -> Optional[FactorResult]:
        k = self._de.kline(code, period="daily", count=60)
        v = _momentum(k, 20, "1m")
        if v is None:
            return None
        return FactorResult(name="momentum_1m", value=v, meta=self.meta)


@register_factor
class Momentum3M(BaseFactor):
    meta = FactorMeta(
        name="momentum_3m",
        category=FactorCategory.MOMENTUM,
        description="近3个月(60交易日)涨跌幅",
        unit="%",
        higher_is_better=True,
        requires_kline=True,
    )

    def compute(self, code: str) -> Optional[FactorResult]:
        k = self._de.kline(code, period="daily", count=120)
        v = _momentum(k, 60, "3m")
        if v is None:
            return None
        return FactorResult(name="momentum_3m", value=v, meta=self.meta)


@register_factor
class Momentum6M(BaseFactor):
    meta = FactorMeta(
        name="momentum_6m",
        category=FactorCategory.MOMENTUM,
        description="近6个月(120交易日)涨跌幅",
        unit="%",
        higher_is_better=True,
        requires_kline=True,
    )

    def compute(self, code: str) -> Optional[FactorResult]:
        k = self._de.kline(code, period="daily", count=250)
        v = _momentum(k, 120, "6m")
        if v is None:
            return None
        return FactorResult(name="momentum_6m", value=v, meta=self.meta)


@register_factor
class Momentum12M1M(BaseFactor):
    """
    12个月动量(剔除近1个月)
    Jegadeesh & Titman (1993) 经典动量因子
    """
    meta = FactorMeta(
        name="momentum_12m_1m",
        category=FactorCategory.MOMENTUM,
        description="12个月涨幅(剔除最近1个月)，经典动量因子",
        unit="%",
        higher_is_better=True,
        requires_kline=True,
    )

    def compute(self, code: str) -> Optional[FactorResult]:
        try:
            k = self._de.kline(code, period="daily", count=300)
            if not k.success or len(k.data) < 250:
                return None
            closes = np.array([d.close for d in k.data])
            # 12个月前 (252交易日) vs 1个月前 (20交易日)
            start = closes[-252] if len(closes) >= 252 else closes[0]
            end = closes[-21] if len(closes) >= 21 else closes[0]
            if start == 0:
                return None
            ret = (end - start) / start * 100
            return FactorResult(
                name="momentum_12m_1m",
                value=round(float(ret), 2),
                meta=self.meta,
            )
        except Exception:
            return None


@register_factor
class ShortTermReversal(BaseFactor):
    """短期反转 — 近5日涨跌幅，用于反转策略"""
    meta = FactorMeta(
        name="short_term_reversal",
        category=FactorCategory.MOMENTUM,
        description="近5日涨跌幅，短期反转策略使用",
        unit="%",
        higher_is_better=False,  # 反转策略：跌得越多越有机会反弹
        requires_kline=True,
    )

    def compute(self, code: str) -> Optional[FactorResult]:
        v = _momentum(self._de.kline(code, period="daily", count=30),
                      5, "5d")
        if v is None:
            return None
        return FactorResult(name="short_term_reversal", value=v, meta=self.meta)
