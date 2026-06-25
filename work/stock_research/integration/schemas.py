"""
标准化输出 Schema — 每个功能一个独立类型，客户端按 feature 名解析

设计原则:
  - 每个 schema 是一个 dataclass，字段类型明确
  - to_dict() 用于 JSON 序列化
  - 所有字段都有类型标注，无 Any
  - 加字段不影响旧客户端（新字段可选/默认值）
"""

from __future__ import annotations
from dataclasses import dataclass, field, asdict
from typing import Optional, List, Dict, Tuple


def _skip_none(o):
    """asdict 辅助，跳过 None 值以减小传输体积"""
    if o is None:
        return None
    if isinstance(o, list):
        return [_skip_none(x) for x in o]
    if isinstance(o, dict):
        return {k: _skip_none(v) for k, v in o.items()}
    if hasattr(o, "_asdict"):
        return o._asdict()
    return o


# ════════════════════════════════════════════════════════════════
# 1. 个股诊断 — StockDiagnosisData
# ════════════════════════════════════════════════════════════════

@dataclass
class ScorecardDimension:
    """评分卡子维度"""
    name: str
    score: float
    weight: float


@dataclass
class FactorItem:
    """单个因子值"""
    name: str
    value: Optional[float] = None
    category: str = ""        # valuation / growth / quality / momentum / technical / risk / cashflow / composite


@dataclass
class StockDiagnosisData:
    """个股全景诊断"""
    code: str
    name: str
    total_score: float
    scorecard_name: str
    scorecard_dimensions: List[ScorecardDimension]
    factors: List[FactorItem]
    valid_factor_count: int
    total_factor_count: int
    factor_categories: Dict[str, List[str]]  # {category: [factor_names]}
    timestamp: str = ""

    def to_dict(self) -> dict:
        return {
            "code": self.code, "name": self.name,
            "total_score": self.total_score,
            "scorecard_name": self.scorecard_name,
            "scorecard_dimensions": [asdict(d) for d in self.scorecard_dimensions],
            "factors": [asdict(f) for f in self.factors],
            "valid_factor_count": self.valid_factor_count,
            "total_factor_count": self.total_factor_count,
            "factor_categories": self.factor_categories,
            "timestamp": self.timestamp,
        }


# ════════════════════════════════════════════════════════════════
# 2. 机构评级 — InstitutionRatingData
# ════════════════════════════════════════════════════════════════

@dataclass
class RatingDimension:
    """评估维度"""
    name: str
    score: float
    weight: float
    detail: str = ""


@dataclass
class InstitutionRatingItem:
    """单个机构的评级"""
    institution: str
    institution_short: str
    rating: str            # strong_buy / buy / watch / hold / sell / strong_sell
    rating_cn: str         # 强烈买入 / 买入 ...
    confidence: float      # 0.1 - 10.0
    raw_confidence: float
    method_source: str     # documented / partial / research_style / behavioral
    model_name: str
    summary: str
    dimensions: Optional[List[RatingDimension]] = None
    group: str = ""        # 国际投行 / 国内券商 / 国家队 / 其他 / 补充机构


@dataclass
class GroupStatItem:
    """机构组统计"""
    avg: float
    count: int
    buy: int
    sell: int


@dataclass
class InstitutionRatingData:
    """多机构评级"""
    code: str
    name: str
    avg_confidence: float
    avg_raw_confidence: float
    consensus_rating: str
    consensus_rating_cn: str
    confidence_std: float
    agreement_rate: float
    rating_distribution: Dict[str, int]
    bullish_count: int
    bearish_count: int
    neutral_count: int
    group_stats: Dict[str, GroupStatItem]
    ratings: List[InstitutionRatingItem]
    avg_data_quality: float
    timestamp: str = ""

    def to_dict(self) -> dict:
        return {
            "code": self.code, "name": self.name,
            "avg_confidence": self.avg_confidence,
            "avg_raw_confidence": self.avg_raw_confidence,
            "consensus_rating": self.consensus_rating,
            "consensus_rating_cn": self.consensus_rating_cn,
            "confidence_std": self.confidence_std,
            "agreement_rate": self.agreement_rate,
            "rating_distribution": self.rating_distribution,
            "bullish_count": self.bullish_count,
            "bearish_count": self.bearish_count,
            "neutral_count": self.neutral_count,
            "avg_data_quality": self.avg_data_quality,
            "group_stats": {k: asdict(v) for k, v in self.group_stats.items()},
            "ratings": [asdict(r) for r in self.ratings],
            "timestamp": self.timestamp,
        }


# ════════════════════════════════════════════════════════════════
# 3. 智能选股 — ScreeningData
# ════════════════════════════════════════════════════════════════

@dataclass
class ScreenedItem:
    """筛选出的个股"""
    code: str
    name: str
    total_score: float
    key_factors: Dict[str, float]  # 命中条件的关键因子


@dataclass
class ScreeningData:
    """智能选股结果"""
    total_scanned: int
    passed: int
    scorecard: str
    items: List[ScreenedItem]

    def to_dict(self) -> dict:
        return {
            "total_scanned": self.total_scanned,
            "passed": self.passed,
            "scorecard": self.scorecard,
            "items": [asdict(i) for i in self.items],
        }


# ════════════════════════════════════════════════════════════════
# 4. 策略信号 — StrategySignalData
# ════════════════════════════════════════════════════════════════

@dataclass
class SingleStrategySignal:
    """单个策略的信号"""
    name: str
    direction: str     # 看多 / 看空 / 中性
    confidence: float  # 0.0 - 1.0
    detail: str = ""


@dataclass
class StrategySignalData:
    """策略信号汇总"""
    code: str
    name: str
    summary: str       # "综合看多(趋势+动量共振)" / "中性"
    bullish_count: int
    bearish_count: int
    neutral_count: int
    signals: List[SingleStrategySignal]
    timestamp: str = ""

    def to_dict(self) -> dict:
        return {
            "code": self.code, "name": self.name,
            "summary": self.summary,
            "bullish_count": self.bullish_count,
            "bearish_count": self.bearish_count,
            "neutral_count": self.neutral_count,
            "signals": [asdict(s) for s in self.signals],
            "timestamp": self.timestamp,
        }


# ════════════════════════════════════════════════════════════════
# 5. 策略验证 — StrategyVerifyData
# ════════════════════════════════════════════════════════════════

@dataclass
class StrategyPerformanceItem:
    """单个策略的历史表现"""
    name: str
    overall_win_rate: float
    avg_return: float
    sharpe: Optional[float]
    signal_count: int
    accuracy_by_direction: Optional[Dict[str, float]] = None


@dataclass
class StrategyVerifyData:
    """策略历史验证"""
    code: str
    name: str
    checkpoints: int
    forward_days: int
    date_range: List[str]
    avg_win_rate: float
    best_strategy: Optional[Dict[str, float]]  # {"name": str, "win_rate": float}
    performances: List[StrategyPerformanceItem]

    def to_dict(self) -> dict:
        return {
            "code": self.code, "name": self.name,
            "checkpoints": self.checkpoints,
            "forward_days": self.forward_days,
            "date_range": self.date_range,
            "avg_win_rate": self.avg_win_rate,
            "best_strategy": self.best_strategy,
            "performances": [asdict(p) for p in self.performances],
        }


# ════════════════════════════════════════════════════════════════
# 6. 组合分析 — PortfolioAnalysisData
# ════════════════════════════════════════════════════════════════

@dataclass
class FactorExposureItem:
    """因子暴露"""
    factor: str
    category: str
    active: Optional[float]
    interpretation: str


@dataclass
class PortfolioHoldingItem:
    """持仓单项"""
    code: str
    name: str
    weight: float
    score: Optional[float]


@dataclass
class PortfolioAnalysisData:
    """组合分析"""
    num_stocks: int
    weighted_score: float
    herfindahl: float
    concentration_label: str   # 分散 / 集中 / 高度集中
    industry_exposure: Dict[str, float]
    holdings: List[PortfolioHoldingItem]
    factor_exposures: List[FactorExposureItem]

    def to_dict(self) -> dict:
        return {
            "num_stocks": self.num_stocks,
            "weighted_score": self.weighted_score,
            "herfindahl": self.herfindahl,
            "concentration_label": self.concentration_label,
            "industry_exposure": self.industry_exposure,
            "holdings": [asdict(h) for h in self.holdings],
            "factor_exposures": [asdict(f) for f in self.factor_exposures],
        }


# ════════════════════════════════════════════════════════════════
# 7. 产业透视 — IndustryMiningData
# ════════════════════════════════════════════════════════════════

@dataclass
class IndustryMiningData:
    """产业链挖掘"""
    industry: str
    summary: str                     # 3000字以内的报告摘要
    chain_overview: str = ""         # 产业链全景描述
    key_companies: int = 0
    full_report: str = ""            # 完整报告（客户端可选展示）

    def to_dict(self) -> dict:
        return {
            "industry": self.industry,
            "summary": self.summary,
            "chain_overview": self.chain_overview,
            "key_companies": self.key_companies,
        }


# ════════════════════════════════════════════════════════════════
# 8. 市场日报 — MarketReportData
# ════════════════════════════════════════════════════════════════

@dataclass
class MarketReportData:
    """市场日报（早报/收盘共用）"""
    report_type: str                  # morning / closing
    title: str
    summary: str                      # 核心结论
    sections: List[Dict]              # 结构化段落 [{title, content}]
    raw_text: str = ""                # 完整文本（客户端可选展开）

    def to_dict(self) -> dict:
        return {
            "report_type": self.report_type,
            "title": self.title,
            "summary": self.summary,
            "sections": self.sections,
        }


# ════════════════════════════════════════════════════════════════
# 9. 股票搜索 — SearchStocksData
# ════════════════════════════════════════════════════════════════

@dataclass
class StockSearchItem:
    code: str
    name: str
    industry: str = ""


@dataclass
class SearchStocksData:
    """股票搜索"""
    keyword: str
    results: List[StockSearchItem]

    def to_dict(self) -> dict:
        return {
            "keyword": self.keyword,
            "results": [asdict(r) for r in self.results],
        }


# ════════════════════════════════════════════════════════════════
# 10. 回测结果 — BacktestResultData
# ════════════════════════════════════════════════════════════════

@dataclass
class FactorICItem:
    """单因子的 IC 表现"""
    factor_name: str
    mean_ic: Optional[float]
    icir: Optional[float]
    hit_rate: Optional[float]
    n_periods: int


@dataclass
class BacktestResultData:
    """因子/评分卡回测"""
    n_periods: int
    universe_size: int
    factor_ics: List[FactorICItem]
    scorecard_ics: List[FactorICItem]

    def to_dict(self) -> dict:
        return {
            "n_periods": self.n_periods,
            "universe_size": self.universe_size,
            "factor_ics": [asdict(f) for f in self.factor_ics],
            "scorecard_ics": [asdict(s) for s in self.scorecard_ics],
        }


# ════════════════════════════════════════════════════════════════
# 11. 历史评估 — LatestEvalData
# ════════════════════════════════════════════════════════════════

@dataclass
class LatestEvalData:
    """最近一次评估快照"""
    code: str
    name: str
    timestamp: str
    scorecard: str
    total_score: float
    factor_values: Dict[str, Optional[float]]

    def to_dict(self) -> dict:
        return {
            "code": self.code, "name": self.name,
            "timestamp": self.timestamp,
            "scorecard": self.scorecard,
            "total_score": self.total_score,
            "factors": self.factor_values,
        }


# ════════════════════════════════════════════════════════════════
# 12. 机构报告文本 — ReportTextData
# ════════════════════════════════════════════════════════════════

@dataclass
class ReportTextData:
    """通用文本报告"""
    code: str
    name: str
    report_type: str
    text: str

    def to_dict(self) -> dict:
        return {
            "code": self.code, "name": self.name,
            "report_type": self.report_type,
            "text": self.text,
        }
