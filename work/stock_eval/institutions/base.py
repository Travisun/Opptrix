"""
机构评估基类 — 数据模型 + 抽象评估器

核心数据模型:
  InstitutionRating — 统一评级输出
  RatingLevel      — 六档评级: StrongSell/Sell/Hold/Watch/Buy/StrongBuy
  EvalDimension    — 单个评估维度（含评分、权重、说明）

评估基类:
  InstitutionEvaluator — 抽象基类，每个机构实现 compute() 方法
"""

from __future__ import annotations
from dataclasses import dataclass, field
from enum import Enum
from typing import Optional, List, Dict, Any
import numpy as np


class RatingLevel(Enum):
    """评级等级"""
    STRONG_SELL = "strong_sell"
    SELL = "sell"
    HOLD = "hold"
    WATCH = "watch"
    BUY = "buy"
    STRONG_BUY = "strong_buy"

    @classmethod
    def from_confidence(cls, confidence: float) -> "RatingLevel":
        """将信心评分(0.1-10.0)映射为评级"""
        if confidence >= 8.5:
            return cls.STRONG_BUY
        elif confidence >= 6.5:
            return cls.BUY
        elif confidence >= 5.0:
            return cls.WATCH
        elif confidence >= 3.5:
            return cls.HOLD
        elif confidence >= 1.5:
            return cls.SELL
        else:
            return cls.STRONG_SELL

    @property
    def label_cn(self) -> str:
        return {
            "strong_sell": "强烈卖出", "sell": "卖出",
            "hold": "持有", "watch": "观望",
            "buy": "买入", "strong_buy": "强烈买入",
        }[self.value]

    @property
    def label_en(self) -> str:
        return {
            "strong_sell": "Strong Sell", "sell": "Sell",
            "hold": "Hold", "watch": "Watch",
            "buy": "Buy", "strong_buy": "Strong Buy",
        }[self.value]


class MethodSource(Enum):
    """方法论来源可靠性等级 — 影响信心评分的权重"""
    DOCUMENTED = "documented"          # 有公开文档可查证的官方框架
    PARTIALLY_DOCUMENTED = "partial"   # 部分可查证 (概念真实但整合方式为构造)
    RESEARCH_STYLE = "research_style"  # 基于公开研报风格方向构建
    BEHAVIORAL = "behavioral"          # 基于行为/持仓数据推断

    @property
    def label_cn(self) -> str:
        return {
            "documented": "官方框架",
            "partial": "部分可查证",
            "research_style": "研报风格",
            "behavioral": "行为推断",
        }[self.value]

    @property
    def confidence_weight(self) -> float:
        """
        方法论可靠性权重
        在 _make_rating 中使用平滑公式:
          final = raw * (0.4 + 0.6 * weight)
        这样 behavioral(0.65) => min multiplier 0.79
        而 documented(1.0) => multiplier 1.0
        """
        return {
            "documented": 1.0,
            "partial": 0.85,
            "research_style": 0.70,
            "behavioral": 0.65,
        }[self.value]


@dataclass
class EvalDimension:
    """
    单个评估维度
    """
    name: str                    # 维度名称（中文）
    score: float                 # 评分 0-10
    weight: float = 1.0          # 在该机构模型中的权重
    detail: str = ""             # 详细说明/数据支撑
    raw_value: Optional[float] = None  # 原始指标值

    def __post_init__(self):
        self.score = max(0.0, min(10.0, self.score))


@dataclass
class EvalQuality:
    """
    数据质量评估 — 该评估的数据支撑度
    """
    data_completeness: float = 0.0
    data_timeliness: float = 0.0
    dimensions_planned: int = 0
    dimensions_actual: int = 0
    has_realtime: bool = False
    has_kline: bool = False
    has_financials: bool = False
    kline_days: int = 0
    financial_periods: int = 0

    @property
    def quality_label(self) -> str:
        if self.data_completeness >= 0.85:
            return "优质-A"
        elif self.data_completeness >= 0.65:
            return "良好-B"
        elif self.data_completeness >= 0.40:
            return "一般-C"
        else:
            return "不足-D"

    @property
    def confidence_multiplier(self) -> float:
        """
        信心乘数 — 平滑公式: 0.5 + 0.5 * completeness
        确保无数据时仍保留0.5，完美数据=1.0
        """
        return 0.5 + 0.5 * self.data_completeness


@dataclass
class InstitutionRating:
    """
    统一评级输出 — 一个机构对一个股票的评估结果
    """
    institution: str
    institution_short: str
    code: str
    rating: RatingLevel
    confidence: float
    dimensions: List[EvalDimension] = field(default_factory=list)
    summary: str = ""
    model_name: str = ""
    factors: Dict[str, float] = field(default_factory=dict)
    errors: List[str] = field(default_factory=list)

    data_quality: Optional[EvalQuality] = None
    raw_confidence: float = 0.0
    method_source: str = ""
    method_label: str = ""

    def __post_init__(self):
        self.confidence = max(0.1, min(10.0, self.confidence))
        self.raw_confidence = max(0.0, min(10.0, self.raw_confidence))

    @property
    def quality_gap(self) -> float:
        return round(self.raw_confidence - self.confidence, 2)

    @property
    def rating_label_cn(self) -> str:
        return self.rating.label_cn

    @property
    def rating_label_en(self) -> str:
        return self.rating.label_en

    def to_dict(self) -> dict:
        dq = self.data_quality
        return {
            "institution": self.institution,
            "institution_short": self.institution_short,
            "code": self.code,
            "rating": self.rating.value,
            "rating_cn": self.rating_label_cn,
            "confidence": self.confidence,
            "raw_confidence": self.raw_confidence,
            "quality_gap": self.quality_gap,
            "method_source": self.method_source,
            "method_label": self.method_label,
            "model_name": self.model_name,
            "summary": self.summary,
            "dimensions": [
                {k: v for k, v in d.__dict__.items() if v is not None}
                for d in self.dimensions
            ],
            "factors": self.factors,
            "errors": self.errors,
            "data_quality": {
                "completeness": dq.data_completeness if dq else 0,
                "label": dq.quality_label if dq else "N/A",
                "dimensions_planned": dq.dimensions_planned if dq else 0,
                "dimensions_actual": dq.dimensions_actual if dq else 0,
                "has_realtime": dq.has_realtime if dq else False,
                "has_kline": dq.has_kline if dq else False,
                "has_financials": dq.has_financials if dq else False,
            } if dq else None,
        }


class InstitutionEvaluator:
    """
    机构评估器抽象基类

    每个具体的机构评分器继承此类，实现:
      compute(code) -> InstitutionRating
    """

    institution: str = "未命名机构"
    institution_short: str = "unknown"
    model_name: str = "通用模型"
    method_source: MethodSource = MethodSource.RESEARCH_STYLE
    method_source_note: str = ""
    description: str = ""

    # 计划评估的维度数 (被 eval quality 使用)
    _planned_dimensions: int = 0

    dimension_weights: Dict[str, float] = field(default_factory=dict)

    def __init__(self, data_engine):
        self._de = data_engine

    def compute(self, code: str) -> InstitutionRating:
        raise NotImplementedError(
            f"{type(self).__name__} 必须实现 compute()"
        )

    # ── 评分校准核心方法 ──────────────────────────────────────

    def _make_rating(self, code: str,
                     dimensions: List[EvalDimension],
                     summary: str = "",
                     extra_factors: Optional[Dict[str, float]] = None,
                     errors: Optional[List[str]] = None,
                     quality: Optional[EvalQuality] = None,
                     ) -> InstitutionRating:
        """
        修复后的信心校准逻辑 (避免乘法杀伤效应):
          1. 各维度评分 * 权重 加权平均 -> 原始综合评分(0-10)
          2. 方法论平滑:  method_smoothed = raw * (0.4 + 0.6 * method_weight)
             — 确保 behavioral(0.65) 最低乘数 0.79, documented(1.0) 乘数 1.0
          3. 数据质量平滑:  quality_mult = 0.5 + 0.5 * completeness
             — 无数据=0.5, 完美数据=1.0
          4. 最终评分 = method_smoothed * quality_mult
        """
        if not dimensions:
            return InstitutionRating(
                institution=self.institution,
                institution_short=self.institution_short,
                code=code,
                rating=RatingLevel.HOLD,
                confidence=5.0,
                raw_confidence=5.0,
                dimensions=[],
                summary="数据不足，无法评估",
                model_name=self.model_name,
                errors=errors or ["无有效评估维度"],
            )

        total_weight = 0.0
        weighted_sum = 0.0
        for d in dimensions:
            w = d.weight
            total_weight += w
            weighted_sum += d.score * w

        if total_weight > 0:
            raw_confidence = weighted_sum / total_weight
        else:
            raw_confidence = 5.0

        # 方法论可靠性 — 平滑公式，避免乘法杀伤
        method_weight = self.method_source.confidence_weight
        method_smoothed = raw_confidence * (0.4 + 0.6 * method_weight)

        # 数据质量 — 平滑乘数
        quality_mult = quality.confidence_multiplier if quality is not None else 1.0

        # 最终校准
        calibrated = method_smoothed * quality_mult

        rating = RatingLevel.from_confidence(calibrated)

        return InstitutionRating(
            institution=self.institution,
            institution_short=self.institution_short,
            code=code,
            rating=rating,
            confidence=round(calibrated, 2),
            raw_confidence=round(raw_confidence, 2),
            dimensions=dimensions,
            summary=summary,
            model_name=self.model_name,
            method_source=self.method_source.value,
            method_label=self.method_source.label_cn,
            factors=extra_factors or {},
            errors=errors or [],
            data_quality=quality or EvalQuality(),
        )

    # ── 构建 EvalQuality ────────────────────────────────────

    def _build_quality(self,
                       has_realtime: bool = False,
                       has_kline: bool = False,
                       has_financials: bool = False,
                       kline_days: int = 0,
                       financial_periods: int = 0,
                       actual_dimensions: int = 0,
                       ) -> EvalQuality:
        """
        自动计算 data_completeness:
          - 实时行情: 20%
          - K线数据: 30% (>=250天30%, >=60天20%, <60天10%)
          - 财报数据: 35% (>=4期35%, >=2期25%, <2期15%)
          - 维度完整性: 15% (actual/planned)
        """
        completeness = 0.0
        if has_realtime:
            completeness += 20.0
        if has_kline and kline_days >= 250:
            completeness += 30.0
        elif has_kline and kline_days >= 60:
            completeness += 20.0
        elif has_kline:
            completeness += 10.0
        if has_financials and financial_periods >= 4:
            completeness += 35.0
        elif has_financials and financial_periods >= 2:
            completeness += 25.0
        elif has_financials:
            completeness += 15.0
        planned = self._planned_dimensions
        if planned > 0:
            dim_pct = min(1.0, actual_dimensions / planned)
            completeness += 15.0 * dim_pct

        timeliness = 1.0 if has_realtime else (0.7 if has_kline else 0.3)

        return EvalQuality(
            data_completeness=round(completeness / 100.0, 2),
            data_timeliness=round(timeliness, 2),
            dimensions_planned=planned,
            dimensions_actual=actual_dimensions,
            has_realtime=has_realtime,
            has_kline=has_kline,
            has_financials=has_financials,
            kline_days=kline_days,
            financial_periods=financial_periods,
        )

    # ── 行业相对评分方法 ────────────────────────────────────

    def _z_score(self, value: float, mean: float, std: float) -> float:
        """z-score转0-10评分, z=0=>5.0, z=+1=>6.5, z=-1=>3.5"""
        if std == 0:
            return 5.0
        z = (value - mean) / std
        mapped = 5.0 + z * 1.5
        return max(1.0, min(9.0, mapped))

    def _percentile_score(self, value: float,
                          p10: float, p50: float, p90: float) -> float:
        """基于百分位数的评分: <=p10=>2, p50=>5, >=p90=>8, 线性插值"""
        if value <= p10:
            return 2.0
        if value >= p90:
            return 8.0
        if value <= p50:
            ratio = (value - p10) / (p50 - p10) if p50 != p10 else 0.5
            return 2.0 + ratio * 3.0
        else:
            ratio = (value - p50) / (p90 - p50) if p90 != p50 else 0.5
            return 5.0 + ratio * 3.0

    # ── 数据获取安全方法 ──────────────────────────────────────

    def _safe_float(self, val, default=None) -> Optional[float]:
        if val is None:
            return default
        try:
            v = float(val)
            if not (v != v):
                return v
        except (ValueError, TypeError):
            pass
        return default

    def _get_realtime(self, code: str):
        try:
            r = self._de.realtime(code)
            if r and r.success and r.data:
                return r.data[0]
        except Exception:
            pass
        return None

    def _get_kline(self, code: str, period: str = "daily", count: int = 250):
        try:
            k = self._de.kline(code, period=period, count=count)
            if k and k.success and k.data:
                return k.data
        except Exception:
            pass
        return None

    def _get_financials(self, code: str):
        try:
            f = self._de.financials(code)
            if f and f.success and f.data:
                return f.data
        except Exception:
            pass
        return None

    def __repr__(self) -> str:
        return f"<{self.institution}({self.model_name})>"
