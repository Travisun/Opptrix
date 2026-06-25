from __future__ import annotations
"""
技术面因子 — K线衍生指标

覆盖:
  beta_1y             — 1年Beta（相对大盘）
  volatility_1y       — 1年年化波动率
  max_drawdown_1y     — 1年最大回撤
  ma_position         — 当前价相对MA60的位置(%)
  rsi_score           — RSI估值水平评分（14日）
  volume_ratio        — 量比（近期日均量 vs 中期日均量）
"""

from typing import Optional
import numpy as np

from .base import BaseFactor
from ..core.models import FactorMeta, FactorResult, FactorCategory
from ..core.registry import register_factor


@register_factor
class Beta1Y(BaseFactor):
    """1年Beta — 个股 vs 沪深300"""
    meta = FactorMeta(
        name="beta_1y",
        category=FactorCategory.RISK,
        description="1年期Beta（相对沪深300），>1 高波动，<1 低波动",
        unit="",
        higher_is_better=False,  # Beta适中为佳
        requires_kline=True,
    )

    def compute(self, code: str) -> Optional[FactorResult]:
        try:
            # 取个股近1年日K线
            k = self._de.kline(code, period="daily", count=250)
            if not k.success or len(k.data) < 30:
                return None

            stock_closes = np.array([d.close for d in k.data])
            stock_returns = np.diff(stock_closes) / stock_closes[:-1]

            # 沪深300作为基准
            idx = self._de.index_kline("000300", period="daily")
            if not idx.success or len(idx.data) < 30:
                return None

            # 对齐长度
            idx_closes = np.array([d.close for d in idx.data])
            idx_returns = np.diff(idx_closes) / idx_closes[:-1]

            min_len = min(len(stock_returns), len(idx_returns))
            if min_len < 20:
                return None

            stock_r = stock_returns[-min_len:]
            idx_r = idx_returns[-min_len:]

            cov = np.cov(stock_r, idx_r)[0, 1]
            var = np.var(idx_r)
            if var == 0:
                return None
            beta = cov / var

            return FactorResult(
                name="beta_1y",
                value=round(float(beta), 3),
                meta=self.meta,
                details={"period_days": min_len}
            )
        except Exception:
            return None


@register_factor
class Volatility1Y(BaseFactor):
    """1年年化波动率"""
    meta = FactorMeta(
        name="volatility_1y",
        category=FactorCategory.RISK,
        description="1年期日收益率年化波动率",
        unit="%",
        higher_is_better=False,  # 低波动更稳定
        requires_kline=True,
    )

    def compute(self, code: str) -> Optional[FactorResult]:
        try:
            k = self._de.kline(code, period="daily", count=250)
            if not k.success or len(k.data) < 20:
                return None
            closes = np.array([d.close for d in k.data])
            returns = np.diff(closes) / closes[:-1]
            daily_vol = np.std(returns, ddof=1)
            annual_vol = daily_vol * np.sqrt(252) * 100
            return FactorResult(
                name="volatility_1y",
                value=round(float(annual_vol), 2),
                meta=self.meta,
                details={"daily_vol_pct": round(float(daily_vol * 100), 3)}
            )
        except Exception:
            return None


@register_factor
class MaxDrawdown1Y(BaseFactor):
    """1年最大回撤"""
    meta = FactorMeta(
        name="max_drawdown_1y",
        category=FactorCategory.RISK,
        description="近1年最大回撤幅度",
        unit="%",
        higher_is_better=False,  # 回撤越小越好
        requires_kline=True,
    )

    def compute(self, code: str) -> Optional[FactorResult]:
        try:
            k = self._de.kline(code, period="daily", count=250)
            if not k.success or not k.data:
                return None
            closes = np.array([d.close for d in k.data])
            peak = np.maximum.accumulate(closes)
            drawdown = (closes - peak) / peak
            mdd = float(np.min(drawdown) * 100)
            return FactorResult(
                name="max_drawdown_1y",
                value=round(mdd, 2),
                meta=self.meta,
            )
        except Exception:
            return None


@register_factor
class MAPosition(BaseFactor):
    """当前价相对MA60的位置——偏离度"""
    meta = FactorMeta(
        name="ma_position",
        category=FactorCategory.TECHNICAL,
        description="当前价相对MA60的偏离百分比，正值在均线上方",
        unit="%",
        higher_is_better=False,  # 偏离太多可能回调
        requires_kline=True,
    )

    def compute(self, code: str) -> Optional[FactorResult]:
        try:
            k = self._de.kline(code, period="daily", count=120)
            if not k.success or len(k.data) < 60:
                return None

            closes = np.array([d.close for d in k.data])
            current = closes[-1]
            ma60 = np.mean(closes[-60:])
            deviation = (current - ma60) / ma60 * 100

            # 也返回 MA20/MA60 的金叉死叉信号
            ma20 = np.mean(closes[-20:]) if len(closes) >= 20 else None
            cross_signal = None
            if ma20 and len(closes) >= 60:
                prev_ma20 = np.mean(closes[-21:-1])
                prev_ma60 = np.mean(closes[-61:-1])
                if prev_ma20 and prev_ma60:
                    if ma20 > ma60 and prev_ma20 <= prev_ma60:
                        cross_signal = "golden_cross"
                    elif ma20 < ma60 and prev_ma20 >= prev_ma60:
                        cross_signal = "dead_cross"

            return FactorResult(
                name="ma_position",
                value=round(float(deviation), 2),
                meta=self.meta,
                details={"current": round(float(current), 2),
                         "ma60": round(float(ma60), 2),
                         "ma20": round(float(ma20), 2) if ma20 else None,
                         "cross_signal": cross_signal}
            )
        except Exception:
            return None


@register_factor
class RSIScore(BaseFactor):
    """RSI(14) 估值水平——量化超买/超卖程度"""
    meta = FactorMeta(
        name="rsi_score",
        category=FactorCategory.TECHNICAL,
        description="RSI(14日)值，<30 超卖，>70 超买",
        unit="",
        higher_is_better=False,  # 越低（超卖）越可能有反弹机会
        requires_kline=True,
        min_value=0,
        max_value=100,
    )

    def compute(self, code: str) -> Optional[FactorResult]:
        try:
            k = self._de.kline(code, period="daily", count=30)
            if not k.success or len(k.data) < 15:
                return None
            closes = np.array([d.close for d in k.data])
            gains = np.diff(closes)
            gains[gains < 0] = 0
            losses = np.diff(closes)
            losses[losses > 0] = 0
            losses = np.abs(losses)

            avg_gain = np.mean(gains[-14:])
            avg_loss = np.mean(losses[-14:])
            if avg_loss == 0:
                rsi = 100.0
            else:
                rs = avg_gain / avg_loss
                rsi = 100 - (100 / (1 + rs))

            return FactorResult(
                name="rsi_score",
                value=round(float(rsi), 1),
                meta=self.meta,
                details={"rsi_period": 14}
            )
        except Exception:
            return None


@register_factor
class VolumeRatio(BaseFactor):
    """量比 — 近5日均量 / 近60日均量"""
    meta = FactorMeta(
        name="volume_ratio",
        category=FactorCategory.TECHNICAL,
        description="近5日均量 / 近60日均量，>1 放量",
        unit="倍",
        higher_is_better=False,  # 放量配合方向判断
        requires_kline=True,
    )

    def compute(self, code: str) -> Optional[FactorResult]:
        try:
            k = self._de.kline(code, period="daily", count=120)
            if not k.success or len(k.data) < 60:
                return None
            volumes = np.array([d.volume for d in k.data], dtype=float)
            vol_5 = np.mean(volumes[-5:])
            vol_60 = np.mean(volumes[-60:])
            if vol_60 == 0:
                return None
            ratio = vol_5 / vol_60
            return FactorResult(
                name="volume_ratio",
                value=round(float(ratio), 3),
                meta=self.meta,
                details={"vol_5d_avg": round(float(vol_5), 0),
                         "vol_60d_avg": round(float(vol_60), 0)}
            )
        except Exception:
            return None
