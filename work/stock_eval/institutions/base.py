"""
机构评估基类 — 数据模型 + 抽象评估器

核心数据模型:
  InstitutionRating — 统一评级输出
  RatingLevel      — 四档评级: Buy / Watch / Hold / Sell
  EvalDimension    — 单个评估维度（含评分、权重、说明）

评估基类:
  InstitutionEvaluator — 抽象基类，每个机构实现 compute() 方法
"""

from __future__ import annotations
from dataclasses import dataclass, field
from enum import Enum
from typing import Optional, List, Dict, Any


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


@dataclass
class EvalDimension:
    """
    单个评估维度

    例如:
      name="估值吸引力", score=7.5, weight=0.25,
      detail="PE处于5年15%百分位, 低于行业均值"
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

    Metrics:
      data_completeness  — 数据完整性 0.0-1.0 (实际用到多少数据)
      data_timeliness    — 数据时效性 0.0-1.0 (数据是否够新)
      dimensions_planned — 计划评估的维度数
      dimensions_actual  — 实际完成的维度数
      has_realtime       — 是否有实时行情
      has_kline          — 是否有K线
      has_financials     — 是否有财报
      kline_days         — K线天数
      financial_periods  — 财报期数
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
        """数据质量标签"""
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
        """信心乘数 — 用于下调信心评分"""
        if self.data_completeness >= 0.85:
            return 1.0
        elif self.data_completeness >= 0.65:
            return 0.85
        elif self.data_completeness >= 0.40:
            return 0.65
        else:
            return 0.40


@dataclass
class InstitutionRating:
    """
    统一评级输出 — 一个机构对一个股票的评估结果

    Fields:
      institution      — 机构名称(中文+英文)
      code             — 股票代码
      rating           — 评级等级
      confidence       — 信心评分 0.1-10.0
      raw_confidence   — 未校准的原始信心评分
      dimensions       — 各评估维度详情
      summary          — 一句话总结
      model_name       — 使用的评估模型名
      factors          — 关键参考因子值
      data_quality     — 数据质量评估
    """

    institution: str                # 例如 "高盛 Goldman Sachs"
    institution_short: str          # 例如 "Goldman Sachs"
    code: str                       # 股票代码
    rating: RatingLevel             # 评级
    confidence: float               # 信心评分 0.1-10.0
    dimensions: List[EvalDimension] = field(default_factory=list)
    summary: str = ""               # 一句话总结
    model_name: str = ""            # 使用的评估模型名
    factors: Dict[str, float] = field(default_factory=dict)  # 关键因子值
    errors: List[str] = field(default_factory=list)

    data_quality: Optional[EvalQuality] = None
    raw_confidence: float = 0.0

    def __post_init__(self):
        self.confidence = max(0.1, min(10.0, self.confidence))
        self.raw_confidence = max(0.0, min(10.0, self.raw_confidence))

    @property
    def quality_gap(self) -> float:
        """原始信心 vs 校准后信心的差距, 越大说明数据支撑越弱"""
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

    子类可覆盖:
      - institution       : 机构全称
      - institution_short : 机构简称
      - model_name        : 评估模型名称
      - dimension_weights : 默认维度权重配置
    """

    institution: str = "未命名机构"
    institution_short: str = "unknown"
    model_name: str = "通用模型"
    description: str = ""

    # 维度权重 {维度名称: 权重}
    dimension_weights: Dict[str, float] = field(default_factory=dict)

    def __init__(self, data_engine):
        self._de = data_engine

    def compute(self, code: str) -> InstitutionRating:
        """
        对一个股票执行机构评估

        子类必须实现此方法
        """
        raise NotImplementedError(
            f"{type(self).__name__} 必须实现 compute()"
        )

    def _make_rating(self, code: str,
                     dimensions: List[EvalDimension],
                     summary: str = "",
                     extra_factors: Optional[Dict[str, float]] = None,
                     errors: Optional[List[str]] = None,
                     quality: Optional[EvalQuality] = None,
                     ) -> InstitutionRating:
        """
        工具方法: 从评估维度列表自动计算加权信心评分, 并进行数据质量校准

        计算逻辑:
          1. 各维度评分 * 权重 加权平均 -> 原始综合评分(0-10)
          2. 数据质量校准 -> 根据EvalQuality计算信心乘数
          3. 校准后信心评分 = 原始评分 * 信心乘数
          4. 校准后信心评分映射到 RatingLevel
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

        # 计算加权得分
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

        # 数据质量校准
        if quality is not None:
            calibrated = raw_confidence * quality.confidence_multiplier
        else:
            calibrated = raw_confidence

        # 综合评分 -> 评级
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
            factors=extra_factors or {},
            errors=errors or [],
            data_quality=quality or EvalQuality(),
        )

    def _safe_float(self, val, default=None) -> Optional[float]:
        """安全转换浮点数"""
        if val is None:
            return default
        try:
            v = float(val)
            if not (v != v):  # 排除 NaN
                return v
        except (ValueError, TypeError):
            pass
        return default

    def _get_realtime(self, code: str):
        """获取实时行情，处理错误"""
        try:
            r = self._de.realtime(code)
            if r and r.success and r.data:
                return r.data[0]
        except Exception:
            pass
        return None

    def _get_kline(self, code: str, period: str = "daily", count: int = 250):
        """获取K线数据，处理错误"""
        try:
            k = self._de.kline(code, period=period, count=count)
            if k and k.success and k.data:
                return k.data
        except Exception:
            pass
        return None

    def _get_financials(self, code: str):
        """获取财报摘要"""
        try:
            f = self._de.financials(code)
            if f and f.success and f.data:
                return f.data
        except Exception:
            pass
        return None

    def __repr__(self) -> str:
        return f"<{self.institution}({self.model_name})>"
