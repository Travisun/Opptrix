from __future__ import annotations
"""
组合分析器 — 组合层面的因子暴露、集中度、风险归因

用法:
    from stock_eval.analysis.portfolio import PortfolioAnalyzer

    analyzer = PortfolioAnalyzer(eval_engine)
    result = analyzer.analyze([
        ("600519", 0.40),
        ("000858", 0.30),
        ("000333", 0.30),
    ])

    print(result.factor_exposure_report())
    print(result.concentration_report())
"""

from typing import Optional, List, Tuple, Dict
from dataclasses import dataclass, field
import numpy as np

from ..core.models import StockSnapshot, FactorCategory
from ..core.registry import REGISTRY
from ..core.engine import EvaluationEngine


@dataclass
class FactorExposure:
    """组合在某个因子上的暴露程度"""
    factor_name: str
    category: str
    portfolio_value: Optional[float]  # 组合加权平均值
    benchmark_value: Optional[float]  # 全市场或基准值
    active_exposure: Optional[float]  # 组合 - 基准
    interpretation: str = ""          # 解读


@dataclass
class PortfolioResult:
    """组合分析结果"""
    holdings: List[Tuple[str, str, float, float]]  # (code, name, weight, score)
    num_stocks: int
    weighted_avg_score: Optional[float]
    industry_exposure: Dict[str, float]            # {行业: 权重比例}
    factor_exposures: List[FactorExposure]
    top_factor_bets: List[FactorExposure]          # 最大主动暴露
    herfindahl: float                              # 赫芬达尔指数（集中度）

    def factor_exposure_report(self) -> str:
        lines = ["\n=== 组合因子暴露分析 ==="]
        lines.append(f"{'因子':30s} {'组合值':>8} {'基准值':>8} {'主动暴露':>8}  解读")
        lines.append("-" * 80)
        for fe in self.factor_exposures:
            pv = f"{fe.portfolio_value:.2f}" if fe.portfolio_value else "N/A"
            bv = f"{fe.benchmark_value:.2f}" if fe.benchmark_value else "N/A"
            ae = f"{fe.active_exposure:+.2f}" if fe.active_exposure else "N/A"
            lines.append(
                f"{fe.factor_name:30s} {pv:>8} {bv:>8} {ae:>8}  {fe.interpretation}"
            )
        return "\n".join(lines)

    def concentration_report(self) -> str:
        lines = ["\n=== 组合集中度分析 ==="]
        lines.append(f"持仓数量: {self.num_stocks}")
        lines.append(f"赫芬达尔指数: {self.herfindahl:.4f} "
                     f"(参考: <0.1 分散, 0.1-0.3 集中, >0.3 高度集中)")
        lines.append(f"加权平均评分: {self.weighted_avg_score:.1f}" if self.weighted_avg_score else "")
        lines.append(f"\n行业分布:")
        for ind, wgt in sorted(self.industry_exposure.items(),
                                key=lambda x: -x[1]):
            bar = "█" * int(wgt * 30)
            lines.append(f"  {ind:15s} {wgt:6.1%} {bar}")
        return "\n".join(lines)


class PortfolioAnalyzer:
    """
    组合分析器

    对一组持仓进行因子暴露、行业集中度、风险归因分析。
    """

    def __init__(self, eval_engine: EvaluationEngine,
                 benchmark_codes: Optional[List[str]] = None):
        self._ee = eval_engine
        # 基准: 默认用持仓等权作为benchmark，或外部传入
        self._benchmark_codes = benchmark_codes

    def analyze(self, holdings: List[Tuple[str, float]],
                factor_names: Optional[List[str]] = None,
                scorecard=None) -> PortfolioResult:
        """
        分析组合

        参数:
          holdings: [(code, weight), ...]  权重和应为1.0
          factor_names: 需要分析的因子列表
          scorecard: 评分卡（可选，用于计算组合得分）

        返回: PortfolioResult
        """
        total_w = sum(w for _, w in holdings)
        if total_w <= 0:
            raise ValueError("组合权重和必须为正")

        # 归一化权重
        weights = {c: w / total_w for c, w in holdings}
        codes = list(weights.keys())

        # 1. 批量分析
        snapshots = self._ee.analyze_batch(
            codes, factor_names=factor_names or REGISTRY.list()
        )

        # 2. 评分
        if scorecard:
            snaps_list = [snapshots[c] for c in codes if c in snapshots]
            scorecard.score(snaps_list)

        # 3. 计算各维度
        names = factor_names or REGISTRY.list()

        # 行业暴露
        industry_exp = self._calc_industry_exposure(snapshots, weights)

        # 因子暴露
        exposures = self._calc_factor_exposures(snapshots, weights, names)

        # 集中度
        hhi = sum(w ** 2 for w in weights.values())

        # 加权评分
        wavg_score = None
        if scorecard:
            scores = [
                (snapshots[c].total_score or 0) * weights[c]
                for c in codes if c in snapshots
                and snapshots[c].total_score is not None
            ]
            if scores:
                wavg_score = sum(scores)

        # 持仓详情
        holdings_detail = []
        for c in codes:
            s = snapshots.get(c)
            name = s.name if s else c
            score = s.total_score if s else None
            holdings_detail.append((c, name, weights[c], score or 0))

        return PortfolioResult(
            holdings=holdings_detail,
            num_stocks=len(codes),
            weighted_avg_score=wavg_score,
            industry_exposure=industry_exp,
            factor_exposures=exposures,
            top_factor_bets=sorted(exposures, key=lambda x: abs(x.active_exposure or 0), reverse=True)[:5],
            herfindahl=hhi,
        )

    def _calc_industry_exposure(self, snapshots: Dict[str, StockSnapshot],
                                 weights: Dict[str, float]) -> Dict[str, float]:
        """计算行业暴露"""
        industry_weights: Dict[str, float] = {}
        for code, w in weights.items():
            s = snapshots.get(code)
            ind = getattr(s, "industry", None)
            if not ind:
                continue
            industry_weights[ind] = industry_weights.get(ind, 0) + w
        return industry_weights

    def _calc_factor_exposures(self, snapshots: Dict[str, StockSnapshot],
                                weights: Dict[str, float],
                                factor_names: List[str]) -> List[FactorExposure]:
        """计算因子暴露"""
        exposures = []

        for fname in factor_names:
            meta = REGISTRY.get_meta(fname)
            if meta is None:
                continue

            # 组合加权值
            pv_sum = 0.0
            pv_count = 0
            for code, w in weights.items():
                s = snapshots.get(code)
                val = s.get(fname) if s else None
                if val is not None:
                    pv_sum += val * w
                    pv_count += 1
            portfolio_val = pv_sum / sum(weights.values()) if weights else None

            # 基准值（等权平均）
            bench_vals = []
            for code, w in weights.items():
                s = snapshots.get(code)
                val = s.get(fname) if s else None
                if val is not None:
                    bench_vals.append(val)
            bench_val = float(np.mean(bench_vals)) if bench_vals else None

            # 主动暴露
            active = None
            if portfolio_val is not None and bench_val is not None:
                if bench_val != 0:
                    active = ((portfolio_val - bench_val) / abs(bench_val)) * 100
                else:
                    active = portfolio_val * 100

            # 解读
            cat = meta.category.value
            if active is not None:
                if abs(active) > 20:
                    interp = f"大幅{'超配' if active > 0 else '低配'}"
                elif abs(active) > 10:
                    interp = f"适度{'超配' if active > 0 else '低配'}"
                else:
                    interp = "接近基准"
            else:
                interp = "数据不足"

            exposures.append(FactorExposure(
                factor_name=fname,
                category=cat,
                portfolio_value=round(float(portfolio_val), 2) if portfolio_val else None,
                benchmark_value=round(float(bench_val), 2) if bench_val else None,
                active_exposure=round(float(active), 2) if active else None,
                interpretation=interp,
            ))

        return exposures
