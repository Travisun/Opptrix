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

    
    # ── 增强数据接入方法 (基于 a_stock_layer) ─────────────

    def _get_news(self, code: str, limit: int = 10):
        """获取新闻/公告"""
        try:
            r = self._de.news(code, page_size=limit)
            if r and r.success and r.data:
                return r.data
        except Exception:
            pass
        return None

    def _get_sentiment(self, code: str):
        """获取个股舆情数据"""
        try:
            r = self._de.sentiment(code)
            if r and r.success and r.data:
                return r.data
        except Exception:
            pass
        return None

    def _get_money_flow(self, code: str):
        """获取资金流向"""
        try:
            r = self._de.money_flow(code)
            if r and r.success and r.data:
                return r.data
        except Exception:
            pass
        return None

    def _get_dragon_tiger(self, date: str = ""):
        """获取龙虎榜数据"""
        try:
            r = self._de.dragon_tiger(date)
            if r and r.success and r.data:
                return r.data
        except Exception:
            pass
        return None

    def _get_margin_trade(self, code: str):
        """获取融资融券"""
        try:
            r = self._de.margin_trade(code)
            if r and r.success and r.data:
                return r.data
        except Exception:
            pass
        return None

    def _get_insider_trade(self, code: str):
        """获取内部人交易(增减持)"""
        try:
            r = self._de.insider_trade(code)
            if r and r.success and r.data:
                return r.data
        except Exception:
            pass
        return None

    def _get_inst_holding(self, code: str):
        """获取机构持仓"""
        try:
            r = self._de.inst_holding(code)
            if r and r.success and r.data:
                return r.data
        except Exception:
            pass
        return None

    def _get_share_pledge(self, code: str):
        """获取股权质押"""
        try:
            r = self._de.share_pledge(code)
            if r and r.success and r.data:
                return r.data
        except Exception:
            pass
        return None

    def _get_lockup_expiry(self, code: str):
        """获取限售解禁"""
        try:
            r = self._de.lockup_expiry(code)
            if r and r.success and r.data:
                return r.data
        except Exception:
            pass
        return None

    def _get_perf_forecast(self, code: str):
        """获取业绩预告"""
        try:
            r = self._de.perf_forecast(code)
            if r and r.success and r.data:
                return r.data
        except Exception:
            pass
        return None

    def _get_dividend(self, code: str):
        """获取分红数据"""
        try:
            r = self._de.dividend(code)
            if r and r.success and r.data:
                return r.data
        except Exception:
            pass
        return None

    def _get_peer_companies(self, code: str):
        """获取可比公司"""
        try:
            r = self._de.peer_companies(code)
            if r and r.success and r.data:
                return r.data
        except Exception:
            pass
        return None

    def _get_rd_investment(self, code: str):
        """获取研发投入"""
        try:
            r = self._de.rd_investment(code)
            if r and r.success and r.data:
                return r.data
        except Exception:
            pass
        return None

    def _get_main_business(self, code: str):
        """获取主营业务构成"""
        try:
            r = self._de.main_business(code)
            if r and r.success and r.data:
                return r.data
        except Exception:
            pass
        return None

    def _get_macro_indicator(self, indicator: str = "CPI"):
        """获取宏观经济指标"""
        try:
            r = self._de.macro_indicator(indicator)
            if r and r.success and r.data:
                return r.data
        except Exception:
            pass
        return None

    def _get_buyback(self, code: str):
        """获取股票回购"""
        try:
            r = self._de.buyback(code)
            if r and r.success and r.data:
                return r.data
        except Exception:
            pass
        return None

    def _get_institutional_visits(self, code: str):
        """获取机构调研"""
        try:
            r = self._de.institutional_visits(code)
            if r and r.success and r.data:
                return r.data
        except Exception:
            pass
        return None

    def _get_limit_updown(self, date: str = ""):
        """获取涨停跌停"""
        try:
            r = self._de.limit_updown(date)
            if r and r.success and r.data:
                return r.data
        except Exception:
            pass
        return None


    # ════════════════════════════════════════════════════════════════
    # 多源信号评估方法（可复用维度注入器）
    # 每个方法返回 Optional[EvalDimension]，评估器可选择性调用
    # ════════════════════════════════════════════════════════════════

    def _eval_news_sentiment(self, code: str, weight: float = 0.05
                             ) -> Optional[EvalDimension]:
        """新闻舆情维度 — 评估新闻情绪信号"""
        try:
            news = self._get_news(code, limit=8)
            if not news:
                return None
            pos = 0; neg = 0; total = 0
            for n in news:
                try:
                    title = getattr(n, 'title', '') or ''
                    sentiment = getattr(n, 'sentiment', None)
                    if sentiment is not None:
                        s = float(sentiment)
                        total += 1
                        if s > 0.3: pos += 1
                        elif s < -0.3: neg += 1
                    else:
                        title_lower = title.lower()
                        total += 1
                        pos_words = ['利好', '增长', '突破', '中标', '获批', '合作', '大涨', '预增']
                        neg_words = ['利空', '下跌', '亏损', '减持', '处罚', '风险', '预警', '下调']
                        if any(w in title for w in pos_words): pos += 1
                        elif any(w in title for w in neg_words): neg += 1
                except Exception:
                    pass
            if total == 0:
                return None
            score = 5.0
            ratio = (pos - neg) / total
            score += ratio * 3.0
            return EvalDimension("新闻舆情", max(1, min(10, score)), weight,
                                 f"正面{pos}/{neg}负面 共{total}条")
        except Exception:
            return None

    def _eval_money_flow_signal(self, code: str, weight: float = 0.05
                                ) -> Optional[EvalDimension]:
        """资金流向维度 — 主力/散户资金动向"""
        try:
            mf = self._get_money_flow(code)
            if not mf:
                return None
            entry = mf[0]
            main_net = self._safe_float(getattr(entry, 'main_net_inflow', None))
            total_net = self._safe_float(getattr(entry, 'net_inflow', None))
            score = 5.0; details = []
            if main_net is not None:
                if main_net > 5e7: score += 2.5; details.append(f"主力净流入{main_net/1e8:.1f}亿")
                elif main_net > 1e7: score += 1.5; details.append("主力小幅流入")
                elif main_net < -5e7: score -= 2.0; details.append(f"主力净流出{abs(main_net)/1e8:.1f}亿")
                elif main_net < -1e7: score -= 1.0
            if total_net is not None:
                if total_net > 0: score += 0.5
                else: score -= 0.5
            return EvalDimension("资金流向", max(1, min(10, score)), weight,
                                 "; ".join(details) or "资金中性")
        except Exception:
            return None

    def _eval_insider_confidence(self, code: str, weight: float = 0.05
                                 ) -> Optional[EvalDimension]:
        """增减持维度 — 内部人(高管/股东)增减持信号"""
        try:
            insider = self._get_insider_trade(code)
            if not insider:
                return None
            score = 5.0; net_qty = 0
            for t in insider[:20]:
                try:
                    chg = self._safe_float(getattr(t, 'change_qty', None))
                    if chg is not None:
                        net_qty += chg
                except Exception:
                    pass
            details = []
            if net_qty > 1e6:
                score += 3.0; details.append(f"净增持{net_qty/1e4:.0f}万股 信心强")
            elif net_qty > 1e5:
                score += 1.5; details.append("小幅增持")
            elif net_qty < -1e6:
                score -= 3.0; details.append(f"净减持{abs(net_qty)/1e4:.0f}万股 利空")
            elif net_qty < -1e5:
                score -= 1.5; details.append("小幅减持")
            else:
                details.append("增减持平衡")
            return EvalDimension("增减持信号", max(1, min(10, score)), weight,
                                 "; ".join(details))
        except Exception:
            return None

    def _eval_institutional_activity(self, code: str, weight: float = 0.05
                                     ) -> Optional[EvalDimension]:
        """机构调研维度 — 机构关注度"""
        try:
            visits = self._get_institutional_visits(code)
            if not visits:
                return None
            score = 5.0
            total_visits = 0; unique_inst = set()
            for v in visits[:30]:
                total_visits += 1
                inst_name = getattr(v, 'institution', '') or ''
                if inst_name:
                    unique_inst.add(inst_name)
            n_inst = len(unique_inst)
            detail_parts = []
            if total_visits > 10:
                score += 2.5; detail_parts.append(f"{total_visits}次调研 高度关注")
            elif total_visits > 5:
                score += 1.5; detail_parts.append(f"{total_visits}次调研 关注")
            elif total_visits > 2:
                score += 0.5
            if n_inst > 15:
                score += 1.5; detail_parts.append(f"{n_inst}家机构参与")
            elif n_inst > 8:
                score += 1.0
            return EvalDimension("机构调研热度", max(1, min(10, score)), weight,
                                 "; ".join(detail_parts) or "调研适中")
        except Exception:
            return None

    def _eval_dividend_quality(self, code: str, weight: float = 0.05
                               ) -> Optional[EvalDimension]:
        """分红质量维度 — 股息率与分红稳定性"""
        try:
            div = self._get_dividend(code)
            if not div:
                return None
            score = 5.0; details = []
            latest_yield = self._safe_float(getattr(div[0], 'dividend_yield', None))
            if latest_yield is not None:
                if latest_yield > 5: score += 3.0; details.append(f"高股息{latest_yield:.1f}%")
                elif latest_yield > 3: score += 2.0; details.append(f"股息{latest_yield:.1f}%良好")
                elif latest_yield > 1.5: score += 1.0; details.append(f"股息{latest_yield:.1f}%")
                else: score -= 0.5; details.append(f"股息率{latest_yield:.1f}%偏低")
            years = len(div)
            if years >= 5: score += 2.0; details.append(f"连续{years}年分红 稳定")
            elif years >= 3: score += 1.0
            return EvalDimension("分红质量", max(1, min(10, score)), weight,
                                 "; ".join(details) or "数据有限")
        except Exception:
            return None

    def _eval_share_pledge_risk(self, code: str, weight: float = 0.05
                                ) -> Optional[EvalDimension]:
        """股权质押风险维度 — 质押比例与爆仓风险"""
        try:
            pledge = self._get_share_pledge(code)
            if not pledge:
                return None
            score = 5.0; details = []
            pct = self._safe_float(getattr(pledge[0], 'pledge_ratio', None))
            if pct is not None:
                if pct > 50:
                    score -= 3.0; details.append(f"高质押{pct:.1f}% 爆仓风险")
                elif pct > 30:
                    score -= 1.5; details.append(f"质押{pct:.1f}% 需关注")
                elif pct > 10:
                    score -= 0.5; details.append(f"质押{pct:.1f}% 轻度")
                else:
                    score += 1.5; details.append(f"低质押{pct:.1f}% 安全")
            return EvalDimension("股权质押风险", max(1, min(10, score)), weight,
                                 "; ".join(details) or "无质押数据")
        except Exception:
            return None

    def _eval_margin_activity(self, code: str, weight: float = 0.05
                              ) -> Optional[EvalDimension]:
        """融资融券维度 — 杠杆资金情绪"""
        try:
            margin = self._get_margin_trade(code)
            if not margin:
                return None
            score = 5.0; details = []
            net_buy = self._safe_float(getattr(margin[0], 'net_buy_amt', None))
            margin_balance = self._safe_float(getattr(margin[0], 'margin_balance', None))
            if net_buy is not None:
                if net_buy > 5e7: score += 2.5; details.append(f"融资净买入{net_buy/1e8:.1f}亿 看多")
                elif net_buy > 1e7: score += 1.5; details.append("融资小幅净买入")
                elif net_buy < -5e7: score -= 2.0; details.append(f"融资净偿还{abs(net_buy)/1e8:.1f}亿")
                elif net_buy < -1e7: score -= 1.0
            if margin_balance and margin_balance > 1e9:
                score += 1.0; details.append("融资余额大 杠杆活跃")
            return EvalDimension("融资情绪", max(1, min(10, score)), weight,
                                 "; ".join(details) or "融资中性")
        except Exception:
            return None

    def _eval_buyback_signal(self, code: str, weight: float = 0.05
                             ) -> Optional[EvalDimension]:
        """回购维度 — 公司回购股票信号"""
        try:
            buyback = self._get_buyback(code)
            if not buyback:
                return None
            score = 5.0; details = []
            total_amt = 0
            for b in buyback[:10]:
                amt = self._safe_float(getattr(b, 'amount', None))
                if amt: total_amt += amt
            if total_amt > 5e8: score += 3.0; details.append(f"大额回购{total_amt/1e8:.1f}亿 信心强")
            elif total_amt > 1e8: score += 2.0; details.append(f"回购{total_amt/1e8:.1f}亿")
            elif total_amt > 1e7: score += 1.0; details.append("小额回购")
            else: score -= 0.5; details.append("回购金额小")
            return EvalDimension("回购信号", max(1, min(10, score)), weight,
                                 "; ".join(details))
        except Exception:
            return None

    def _eval_lockup_risk(self, code: str, weight: float = 0.05
                          ) -> Optional[EvalDimension]:
        """限售解禁维度 — 解禁压力评估"""
        try:
            lockup = self._get_lockup_expiry(code)
            if not lockup:
                return None
            score = 5.0; details = []
            total_ratio = 0
            for lk in lockup[:5]:
                ratio = self._safe_float(getattr(lk, 'unlock_ratio', None))
                if ratio: total_ratio += ratio
            if total_ratio > 30:
                score -= 3.0; details.append(f"巨量解禁{total_ratio:.1f}% 抛压大")
            elif total_ratio > 15:
                score -= 1.5; details.append(f"解禁{total_ratio:.1f}% 需关注")
            elif total_ratio > 5:
                score -= 0.5; details.append(f"解禁{total_ratio:.1f}% 影响有限")
            else:
                score += 1.0; details.append("无重大解禁")
            return EvalDimension("解禁风险", max(1, min(10, score)), weight,
                                 "; ".join(details))
        except Exception:
            return None

    def _eval_rd_strength(self, code: str, weight: float = 0.05
                          ) -> Optional[EvalDimension]:
        """研发投入维度 — 研发强度与持续投入能力"""
        try:
            rd = self._get_rd_investment(code)
            if not rd:
                return None
            score = 5.0; details = []
            rd_ratio = self._safe_float(getattr(rd[0], 'rd_ratio', None))
            rd_amt = self._safe_float(getattr(rd[0], 'rd_amount', None))
            if rd_ratio is not None:
                if rd_ratio > 15: score += 3.0; details.append(f"高研发{rd_ratio:.1f}% 技术驱动")
                elif rd_ratio > 8: score += 2.0; details.append(f"研发{rd_ratio:.1f}% 较强")
                elif rd_ratio > 3: score += 1.0; details.append(f"研发{rd_ratio:.1f}% 合理")
                else: score -= 0.5; details.append(f"研发{rd_ratio:.1f}% 偏低")
            if rd_amt and rd_amt > 5e9: score += 1.0; details.append(f"研发投入{rd_amt/1e8:.0f}亿 规模大")
            return EvalDimension("研发投入强度", max(1, min(10, score)), weight,
                                 "; ".join(details) or "")
        except Exception:
            return None

    def _eval_macro_context(self, code: str, weight: float = 0.05
                            ) -> Optional[EvalDimension]:
        """宏观环境维度 — CPI/PMI/GDP评估"""
        try:
            score = 5.0; details = []
            cpi = self._get_macro_indicator("CPI")
            if cpi:
                try:
                    cpi_val = self._safe_float(getattr(cpi[0], 'value', None))
                    if cpi_val is not None:
                        if 1 < cpi_val < 3:
                            score += 1.5; details.append(f"CPI{cpi_val:.1f}温和通胀 利好权益")
                        elif cpi_val > 5:
                            score -= 2.0; details.append(f"高CPI{cpi_val:.1f}% 紧缩风险")
                        elif cpi_val <= 0:
                            score -= 1.0; details.append(f"通缩CPI{cpi_val:.1f}% 需求疲弱")
                except Exception:
                    pass
            pmi = self._get_macro_indicator("PMI")
            if pmi:
                try:
                    pmi_val = self._safe_float(getattr(pmi[0], 'value', None))
                    if pmi_val is not None:
                        if pmi_val > 52: score += 1.5; details.append(f"PMI{pmi_val:.1f}经济扩张")
                        elif pmi_val > 50: score += 0.5; details.append(f"PMI{pmi_val:.1f}景气临界")
                        elif pmi_val < 48: score -= 1.5; details.append(f"PMI{pmi_val:.1f}收缩")
                        else: score -= 0.5
                except Exception:
                    pass
            gdp = self._get_macro_indicator("GDP")
            if gdp:
                try:
                    gdp_val = self._safe_float(getattr(gdp[0], 'value', None))
                    if gdp_val is not None and gdp_val < 4:
                        score -= 1.0; details.append(f"GDP{gdp_val:.1f}%增速放缓")
                except Exception:
                    pass
            if not details:
                return None
            return EvalDimension("宏观环境", max(1, min(10, score)), weight,
                                 "; ".join(details))
        except Exception:
            return None


    def __repr__(self) -> str:
        return f"<{self.institution}({self.model_name})>"
