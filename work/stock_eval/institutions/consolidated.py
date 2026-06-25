"""
综合评级聚合器 — 将所有机构/视角的评级汇总为统一报告

功能:
  1. 运行所有已注册的评估器
  2. 输出综合评级聚合表
  3. 计算机构一致性/分歧度
  4. 综合信心评分
"""

from __future__ import annotations
from dataclasses import dataclass, field
from typing import Optional, List, Dict, Type, Callable
from datetime import datetime, timezone
import numpy as np

from .base import (
    InstitutionEvaluator, InstitutionRating,
    RatingLevel, EvalDimension,
)
from .international import (
    GoldmanSachsEvaluator, MorganStanleyEvaluator, JPMorganEvaluator,
    UBSEvaluator, CitiEvaluator, CreditSuisseEvaluator,
    BarclaysEvaluator, HSBCEvaluator, DeutscheBankEvaluator,
)
from .domestic import (
    CICCEvaluator, CITICEvaluator, HuataiEvaluator,
    CMSEvaluator, GuotaiJunanEvaluator,
)
from .national_team import (
    SocialSecurityEvaluator, HuijinEvaluator,
    CSFEvaluator, BigFundEvaluator,
)
from .northbound import NorthboundFundEvaluator
from .technical import TechnicalIndicatorEvaluator


# ── 全部评估器注册 ────────────────────────────────────────────────

ALL_EVALUATORS: List[Type[InstitutionEvaluator]] = [
    # 国际投行 (9)
    GoldmanSachsEvaluator,
    MorganStanleyEvaluator,
    JPMorganEvaluator,
    UBSEvaluator,
    CitiEvaluator,
    CreditSuisseEvaluator,
    BarclaysEvaluator,
    HSBCEvaluator,
    DeutscheBankEvaluator,
    # 国内券商 (5)
    CICCEvaluator,
    CITICEvaluator,
    HuataiEvaluator,
    CMSEvaluator,
    GuotaiJunanEvaluator,
    # 国家队 (4)
    SocialSecurityEvaluator,
    HuijinEvaluator,
    CSFEvaluator,
    BigFundEvaluator,
    # 外资
    NorthboundFundEvaluator,
    # 技术面
    TechnicalIndicatorEvaluator,
]

# ── 分组 ──────────────────────────────────────────────────────────

EVALUATOR_GROUPS: Dict[str, List[Type[InstitutionEvaluator]]] = {
    "国际投行": [
        GoldmanSachsEvaluator, MorganStanleyEvaluator, JPMorganEvaluator,
        UBSEvaluator, CitiEvaluator, CreditSuisseEvaluator,
        BarclaysEvaluator, HSBCEvaluator, DeutscheBankEvaluator,
    ],
    "国内券商": [
        CICCEvaluator, CITICEvaluator, HuataiEvaluator,
        CMSEvaluator, GuotaiJunanEvaluator,
    ],
    "国家队": [
        SocialSecurityEvaluator, HuijinEvaluator,
        CSFEvaluator, BigFundEvaluator,
    ],
    "其他": [
        NorthboundFundEvaluator,
        TechnicalIndicatorEvaluator,
    ],
}


# ── 聚合结果 ──────────────────────────────────────────────────────

@dataclass
class ConsolidatedRating:
    """
    综合评级报告 — 一只股票在多个机构视角下的评价

    机构评级表:
      institution | rating | confidence | summary

    综合统计:
      平均信心评分
      评级分布 (Buy/Watch/Hold/Sell 计数)
      分歧度 (标准差)
      一致性最高的机构组
    """
    code: str
    name: str = ""
    timestamp: str = ""

    # 所有机构的评级
    ratings: List[InstitutionRating] = field(default_factory=list)

    # 聚合统计
    avg_confidence: float = 0.0
    consensus_rating: RatingLevel = RatingLevel.HOLD
    rating_distribution: Dict[str, int] = field(default_factory=dict)
    confidence_std: float = 0.0
    bullish_count: int = 0
    bearish_count: int = 0
    neutral_count: int = 0

    # 各组统计
    group_stats: Dict[str, dict] = field(default_factory=dict)

    # 成功/失败计数
    success_count: int = 0
    error_count: int = 0
    total_evaluators: int = 0

    def __post_init__(self):
        if not self.timestamp:
            self.timestamp = datetime.now(
                timezone.utc
            ).astimezone().strftime("%Y-%m-%d %H:%M:%S")

    @property
    def rating_summary(self) -> str:
        """一句话综合评级"""
        dist = self.rating_distribution
        buy = dist.get("buy", 0) + dist.get("strong_buy", 0)
        sell = dist.get("sell", 0) + dist.get("strong_sell", 0)
        watch = dist.get("watch", 0)
        hold = dist.get("hold", 0)

        if buy > sell + hold and buy >= watch:
            return f"综合看多 ({buy}家机构推荐买入)"
        elif buy >= watch and buy > 0:
            return f"综合偏多，观望中 ({watch}家观望)"
        elif sell > buy and sell > watch:
            return f"综合看空 ({sell}家机构建议卖出)"
        elif hold >= buy and hold >= sell:
            return f"综合持有观望 ({hold}家建议持有)"
        else:
            return f"机构观点分歧 (买入{buy}/观望{watch}/持有{hold}/卖出{sell})"

    def to_report(self) -> "ConsolidatedReport":
        """转换为详细报告"""
        return ConsolidatedReport(self)


@dataclass
class ConsolidatedReport:
    """
    综合评级详细报告 — 可打印的文本报告
    """
    consolidated: ConsolidatedRating

    def format_text(self) -> str:
        """生成格式化的文本报告"""
        c = self.consolidated
        lines = []
        sep = "─" * 72

        lines.append(f"\n{'=' * 72}")
        lines.append(f"  多机构综合评级报告")
        lines.append(f"{'=' * 72}")
        lines.append(f"  股票: {c.name} ({c.code})")
        lines.append(f"  时间: {c.timestamp}")
        lines.append(f"  扫描机构: {c.total_evaluators}家")
        lines.append(f"{sep}")

        # 综合统计
        lines.append(f"  综合信心评分: {c.avg_confidence:.2f} / 10.0")
        lines.append(f"  共识评级: {c.consensus_rating.label_cn} ({c.consensus_rating.label_en})")
        lines.append(f"  评级分布: 买入{c.bullish_count} | 观望{c.neutral_count} | "
                      f"持有/卖出{c.bearish_count}")
        lines.append(f"  {c.rating_summary}")
        if len(c.ratings) > 1:
            lines.append(f"  机构分歧度(σ): {c.confidence_std:.2f}")
        lines.append(f"{sep}")

        # 各组统计
        for group_name, stats in c.group_stats.items():
            g_avg = stats.get("avg", 0)
            g_count = stats.get("count", 0)
            g_buy = stats.get("buy", 0)
            g_sell = stats.get("sell", 0)
            lines.append(f"\n  [{group_name}] 均{g_avg:.1f}分 | "
                          f"{g_count}家 | 买入{g_buy} 卖出{g_sell}")

        lines.append(f"\n{sep}")
        lines.append(f"  各机构评级明细:")
        lines.append(f"{sep}")

        # 表头
        header = f"  {'机构':<22} {'评级':<8} {'信心':<6} {'模型':<16} {'要点'}"
        lines.append(header)
        lines.append(f"  {'─' * 68}")

        for r in c.ratings:
            inst = r.institution_short[:20]
            rating_s = f"{r.rating_label_cn}/{r.rating_label_en[:5]}"
            conf = f"{r.confidence:.1f}"
            model = r.model_name[:14]
            summary = r.summary[:25] if r.summary else ""
            lines.append(f"  {inst:<22} {rating_s:<8} {conf:<6} {model:<16} {summary}")

        lines.append(f"{sep}")
        # 底部指引
        buy_count = c.bullish_count
        total = len(c.ratings)
        buy_ratio = buy_count / total * 100 if total > 0 else 0
        if buy_ratio >= 60:
            lines.append(f"  → 机构看多一致性强 ({buy_ratio:.0f}%看多)")
        elif buy_ratio >= 40:
            lines.append(f"  → 机构偏多但存在分歧 ({buy_ratio:.0f}%看多)")
        elif buy_ratio >= 20:
            lines.append(f"  → 机构偏谨慎 ({buy_ratio:.0f}%看多)")
        else:
            lines.append(f"  → 机构普遍谨慎 ({buy_ratio:.0f}%看多)")

        lines.append(f"{'=' * 72}\n")
        return "\n".join(lines)


class ConsolidatedEngine:
    """
    综合评估引擎 — 运行所有机构评估器并聚合结果

    用法:
        engine = ConsolidatedEngine(data_engine)
        result = engine.evaluate("600519")
        print(result.to_report().format_text())
    """

    def __init__(self, data_engine,
                 evaluators: Optional[List[Type[InstitutionEvaluator]]] = None,
                 ):
        self._de = data_engine
        self._evaluator_types = evaluators or ALL_EVALUATORS

    def evaluate(self, code: str,
                 groups: Optional[List[str]] = None,
                 ) -> ConsolidatedRating:
        """
        对一只股票运行所有机构评估

        参数:
          code: 股票代码
          groups: 可选，只运行特定组 (如 ["国际投行", "国家队"])

        返回: ConsolidatedRating
        """
        # 确定运行的评估器
        if groups:
            types = []
            for g in groups:
                types.extend(EVALUATOR_GROUPS.get(g, []))
        else:
            types = self._evaluator_types

        # 获取股票名称
        name = code
        try:
            r = self._de.realtime(code)
            if r and r.success and r.data:
                name = r.data[0].name or code
        except Exception:
            pass

        # 运行每个评估器
        ratings: List[InstitutionRating] = []
        errors = 0

        for cls in types:
            try:
                evaluator = cls(self._de)
                rating = evaluator.compute(code)
                ratings.append(rating)
            except Exception:
                errors += 1

        # 聚合统计
        valid_ratings = [r for r in ratings if r.confidence > 0]
        success_count = len(valid_ratings)

        if not valid_ratings:
            return ConsolidatedRating(
                code=code, name=name,
                ratings=[],
                avg_confidence=0,
                consensus_rating=RatingLevel.HOLD,
                success_count=0,
                error_count=errors,
                total_evaluators=len(types),
            )

        # 平均信心
        confidences = [r.confidence for r in valid_ratings]
        avg_conf = float(np.mean(confidences))
        conf_std = float(np.std(confidences)) if len(confidences) > 1 else 0

        # 评级分布
        dist: Dict[str, int] = {}
        for r in valid_ratings:
            key = r.rating.value
            dist[key] = dist.get(key, 0) + 1

        bullish = sum(dist.get(k, 0) for k in ["buy", "strong_buy"])
        bearish = sum(dist.get(k, 0) for k in ["sell", "strong_sell", "hold"])
        neutral = dist.get("watch", 0)

        # 共识评级
        # 加权: 置信度高的机构权重更大
        weighted_sum = sum(r.confidence for r in valid_ratings)
        weighted_avg = weighted_sum / len(valid_ratings)
        consensus = RatingLevel.from_confidence(weighted_avg)

        # 分组统计
        group_stats: Dict[str, dict] = {}
        cls_to_group = {}
        for gname, gtypes in EVALUATOR_GROUPS.items():
            for gt in gtypes:
                cls_to_group[gt] = gname

        for gname in EVALUATOR_GROUPS:
            g_ratings = [r for r in valid_ratings
                         if type(r) in EVALUATOR_GROUPS[gname]]
            if g_ratings:
                g_conf = [r.confidence for r in g_ratings]
                g_buy = sum(1 for r in g_ratings
                            if r.rating in (RatingLevel.BUY, RatingLevel.STRONG_BUY))
                g_sell = sum(1 for r in g_ratings
                             if r.rating in (RatingLevel.SELL, RatingLevel.STRONG_SELL))
                group_stats[gname] = {
                    "avg": round(float(np.mean(g_conf)), 2),
                    "count": len(g_ratings),
                    "buy": g_buy,
                    "sell": g_sell,
                }

        return ConsolidatedRating(
            code=code, name=name,
            ratings=valid_ratings,
            avg_confidence=round(avg_conf, 2),
            consensus_rating=consensus,
            rating_distribution=dist,
            confidence_std=round(conf_std, 2),
            bullish_count=bullish,
            bearish_count=bearish,
            neutral_count=neutral,
            group_stats=group_stats,
            success_count=success_count,
            error_count=errors,
            total_evaluators=len(types),
        )
