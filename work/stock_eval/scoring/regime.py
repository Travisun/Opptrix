from __future__ import annotations
"""
市场状态检测器 — 根据当前市场环境动态调整评分权重

核心逻辑:
  不同市场状态下，同一因子的有效性不同。
  低波动市场 → 质量/价值因子更有效
  高波动市场 → 动量/技术因子更有效
  牛市 → 成长/动量更有效
  熊市 → 低风险/质量更有效

用法:
    detector = MarketRegimeDetector(data_engine)
    regime = detector.detect()
    # → MarketRegime(name="牛市_成长", volatility="low", trend="bullish")

    adjuster = RegimeWeightAdjuster(detector)
    adjusted_weights = adjuster.get_weights("综合评估")
"""

from typing import Optional, Dict, List
from dataclasses import dataclass, field
import numpy as np
from enum import Enum


class TrendState(Enum):
    BULLISH = "bullish"       # 上升趋势
    BEARISH = "bearish"       # 下降趋势
    SIDEWAYS = "sideways"     # 横盘震荡
    REBOUND = "rebound"       # 超跌反弹


class VolState(Enum):
    HIGH = "high_vol"         # 高波动
    NORMAL = "normal_vol"     # 正常波动
    LOW = "low_vol"           # 低波动


class LiquidityState(Enum):
    EASY = "easy"             # 流动性宽松（放量）
    NORMAL = "normal"         # 正常
    TIGHT = "tight"           # 流动性紧张（缩量）


@dataclass
class MarketRegime:
    """当前市场状态快照"""
    trend: TrendState = TrendState.SIDEWAYS
    volatility: VolState = VolState.NORMAL
    liquidity: LiquidityState = LiquidityState.NORMAL
    index_change_20d: float = 0.0       # 沪深300近20日涨跌幅
    index_change_60d: float = 0.0       # 近60日涨跌幅
    annual_vol: float = 0.0            # 年化波动率
    volume_ratio: float = 1.0          # 量比
    advance_pct: float = 0.5           # 上涨家数占比

    @property
    def name(self) -> str:
        """人类可读的市场状态名称"""
        parts = []
        if self.trend == TrendState.BULLISH:
            parts.append("牛市")
        elif self.trend == TrendState.BEARISH:
            parts.append("熊市")
        elif self.trend == TrendState.REBOUND:
            parts.append("反弹")
        else:
            parts.append("震荡")

        if self.volatility == VolState.HIGH:
            parts.append("高波动")
        elif self.volatility == VolState.LOW:
            parts.append("低波动")

        if self.liquidity == LiquidityState.EASY:
            parts.append("放量")
        elif self.liquidity == LiquidityState.TIGHT:
            parts.append("缩量")

        return "_".join(parts) if parts else "正常"

    def to_dict(self) -> dict:
        return {
            "name": self.name,
            "trend": self.trend.value,
            "volatility": self.volatility.value,
            "liquidity": self.liquidity.value,
            "index_change_20d": round(self.index_change_20d, 2),
            "index_change_60d": round(self.index_change_60d, 2),
            "annual_vol": round(self.annual_vol, 2),
            "volume_ratio": round(self.volume_ratio, 2),
            "advance_pct": round(self.advance_pct, 2),
        }


# 不同市场状态下的评分卡权重调节系数
# key = regime.name 或部分匹配, value = {因子类型: 乘数}
REGIME_ADJUSTMENTS: Dict[str, Dict[str, float]] = {
    "牛市": {
        "momentum": 1.5,
        "growth": 1.3,
        "quality": 0.8,
        "valuation": 0.7,
        "risk": 0.5,
        "technical": 1.2,
    },
    "熊市": {
        "risk": 1.5,
        "valuation": 1.3,
        "quality": 1.2,
        "momentum": 0.5,
        "growth": 0.6,
        "technical": 0.8,
    },
    "震荡": {
        "valuation": 1.2,
        "quality": 1.1,
        "technical": 1.0,
        "momentum": 0.8,
        "growth": 0.9,
        "risk": 1.1,
    },
    "反弹": {
        "momentum": 1.4,
        "technical": 1.3,
        "valuation": 1.2,
        "growth": 1.1,
        "quality": 0.8,
        "risk": 0.7,
    },
    "高波动": {
        "risk": 1.5,
        "quality": 1.3,
        "valuation": 1.2,
        "technical": 0.8,
        "momentum": 0.6,
        "growth": 0.7,
    },
    "低波动": {
        "quality": 1.3,
        "momentum": 1.2,
        "growth": 1.1,
        "valuation": 1.0,
        "risk": 0.8,
        "technical": 0.9,
    },
    "放量": {
        "momentum": 1.3,
        "technical": 1.2,
        "growth": 1.1,
        "quality": 0.9,
        "valuation": 0.9,
        "risk": 0.8,
    },
    "缩量": {
        "quality": 1.3,
        "valuation": 1.2,
        "risk": 1.1,
        "momentum": 0.7,
        "growth": 0.8,
        "technical": 0.7,
    },
}

# 因子名 → 因子类别的映射（从注册表自动构建）
# 用于在权重调整时按类别查找因子


class MarketRegimeDetector:
    """
    市场状态检测器

    依赖: data_engine (AshareEngine) 获取指数数据和市场广度
    """

    def __init__(self, data_engine=None):
        self._de = data_engine
        self._cache: Optional[MarketRegime] = None

    def detect(self) -> MarketRegime:
        """检测当前市场状态"""
        regime = MarketRegime()

        if self._de is None:
            return regime

        try:
            # 沪深300近60日K线
            idx = self._de.index_kline("000300", "daily")
            if idx.success and len(idx.data) >= 20:
                closes = np.array([d.close for d in idx.data])
                prices = closes[-60:] if len(closes) >= 60 else closes

                # 涨跌幅
                regime.index_change_20d = (
                    (prices[-1] - prices[-21]) / prices[-21] * 100
                    if len(prices) >= 21 else 0
                )
                regime.index_change_60d = (
                    (prices[-1] - prices[0]) / prices[0] * 100
                    if len(prices) >= 2 else 0
                )

                # 波动率
                returns = np.diff(prices) / prices[:-1]
                regime.annual_vol = float(
                    np.std(returns, ddof=1) * np.sqrt(252) * 100
                )

            # 市场广度
            breadth = self._de.market_breadth()
            if breadth.success and breadth.data:
                b = breadth.data[0]
                regime.advance_pct = (
                    b.advance / (b.advance + b.decline + 1)
                )

        except Exception:
            pass

        # 状态判定
        self._classify(regime)
        self._cache = regime
        return regime

    def _classify(self, r: MarketRegime):
        """根据阈值判定趋势/波动/流动性"""
        # 趋势
        if r.index_change_20d > 3.0:
            r.trend = TrendState.BULLISH
        elif r.index_change_20d < -3.0:
            r.trend = TrendState.BEARISH
        elif r.index_change_20d > 1.0 and r.index_change_60d < -5.0:
            r.trend = TrendState.REBOUND
        else:
            r.trend = TrendState.SIDEWAYS

        # 波动
        if r.annual_vol > 25:
            r.volatility = VolState.HIGH
        elif r.annual_vol < 12:
            r.volatility = VolState.LOW
        else:
            r.volatility = VolState.NORMAL

        # 流动性 (通过量比估算，1.0为基准)
        if r.volume_ratio > 1.3:
            r.liquidity = LiquidityState.EASY
        elif r.volume_ratio < 0.7:
            r.liquidity = LiquidityState.TIGHT
        else:
            r.liquidity = LiquidityState.NORMAL

    @property
    def last_regime(self) -> Optional[MarketRegime]:
        return self._cache


class RegimeWeightAdjuster:
    """
    市场状态权重调节器

    根据当前市场状态，自动调整评分卡权重。
    """

    def __init__(self, detector: MarketRegimeDetector):
        self._detector = detector

    def adjust_weights(self,
                       base_weights: Dict[str, float],
                       factor_names: Optional[Dict[str, str]] = None
                       ) -> Dict[str, float]:
        """
        根据市场状态调节权重

        参数:
          base_weights: {因子名: 权重}
          factor_names: {因子名: 因子类别}，None自动从注册表获取

        返回: 调整后的 {因子名: 权重}
        """
        regime = self._detector.detect()
        adjustments = self._get_applicable_adjustments(regime)
        if not adjustments:
            return dict(base_weights)

        # 获取因子 → 分类映射
        if factor_names is None:
            from ..core.registry import REGISTRY
            factor_names = {}
            for fn in base_weights:
                meta = REGISTRY.get_meta(fn)
                if meta:
                    factor_names[fn] = meta.category.value

        result = {}
        for fn, w in base_weights.items():
            cat = factor_names.get(fn, "")
            multiplier = adjustments.get(cat, 1.0)
            result[fn] = round(w * multiplier, 4)

        # 保持权重和为1
        total = sum(result.values())
        if total > 0:
            result = {k: round(v / total, 4) for k, v in result.items()}

        return result

    def _get_applicable_adjustments(self, regime: MarketRegime
                                    ) -> Dict[str, float]:
        """获取适用当前市场状态的调节系数"""
        result = {}
        name = regime.name
        for keyword, adj in REGIME_ADJUSTMENTS.items():
            if keyword in name:
                for cat, mult in adj.items():
                    result[cat] = max(result.get(cat, 1.0), mult)
        return result

    def report(self, base_weights: Dict[str, float]) -> str:
        """打印调节报告"""
        regime = self._detector.detect()
        adjusted = self.adjust_weights(base_weights)

        lines = ["\n=== 市场状态权重调节 ==="]
        lines.append(f"当前状态: {regime.name}")
        lines.append(f"  沪深300 20日涨跌幅: {regime.index_change_20d:.1f}%")
        lines.append(f"  年化波动率: {regime.annual_vol:.1f}%")
        lines.append(f"  上涨家数占比: {regime.advance_pct:.0%}")
        lines.append("")

        for fn in sorted(base_weights.keys()):
            bw = base_weights[fn]
            aw = adjusted.get(fn, 0)
            if bw != aw:
                arrow = "↑" if aw > bw else "↓"
                lines.append(
                    f"  {fn:30s} {bw:.3f} → {aw:.3f} {arrow}"
                )

        return "\n".join(lines)
