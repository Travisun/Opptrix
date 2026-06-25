from __future__ import annotations
"""
回测与因子监控指标

核心指标:
  IC (Information Coefficient)    — 因子值与后续收益的秩相关系数
  RankIC                          — Spearman 秩IC
  ICIR (IC Information Ratio)     — IC均值 / IC标准差
  Factor Return                   — 多空组合收益
  Hit Rate                        — 因子方向预测准确率

用法:
    from stock_eval.backtest.metrics import FactorIC

    ic = FactorIC()
    ic.add_period(factor_values={"600519": 0.8, "000858": 0.6},
                  forward_return={"600519": 0.05, "000858": -0.02})
    print(ic.report())
"""

from typing import Optional, List, Dict, Tuple
from dataclasses import dataclass, field
import numpy as np
from ..utils.stats import spearman_rank


@dataclass
class ICPeriod:
    """一个时间周期的 IC 记录"""
    date: str
    pearson_ic: Optional[float]   # Pearson IC
    rank_ic: Optional[float]      # Rank IC (Spearman)
    factor_values: Dict[str, float]
    forward_returns: Dict[str, float]
    n_stocks: int = 0


class FactorIC:
    """
    因子 IC 追踪器

    追踪一个因子在多个时间周期的 IC，计算 ICIR、IR、Hit Rate。
    用于评估因子的预测能力和稳定性。
    """

    def __init__(self, factor_name: str = ""):
        self.factor_name = factor_name
        self.periods: List[ICPeriod] = []

    def add_period(self,
                   factor_values: Dict[str, float],
                   forward_return: Dict[str, float],
                   date: str = ""):
        """
        添加一个周期的 IC 数据

        参数:
          factor_values: {code: factor_value}
          forward_return: {code: forward_return_pct}
          date: 日期标签
        """
        # 取交集
        common = set(factor_values.keys()) & set(forward_return.keys())
        if len(common) < 5:
            return

        fv = np.array([factor_values[c] for c in common])
        fr = np.array([forward_return[c] for c in common])

        # Pearson
        pearson_ic = None
        try:
            pearson_ic = float(np.corrcoef(fv, fr)[0, 1])
        except Exception:
            pass

        # Rank IC (Spearman)
        rank_ic = None
        try:
            rank_ic, _ = spearman_rank(fv, fr)
            rank_ic = float(rank_ic)
        except Exception:
            pass

        self.periods.append(ICPeriod(
            date=date,
            pearson_ic=pearson_ic,
            rank_ic=rank_ic,
            factor_values=dict(zip(common, fv)),
            forward_returns=dict(zip(common, fr)),
            n_stocks=len(common),
        ))

    # ── 汇总指标 ──────────────────────────────────

    @property
    def ic_series(self) -> List[float]:
        """Pearson IC 时间序列"""
        return [p.pearson_ic for p in self.periods if p.pearson_ic is not None]

    @property
    def rank_ic_series(self) -> List[float]:
        return [p.rank_ic for p in self.periods if p.rank_ic is not None]

    @property
    def mean_ic(self) -> Optional[float]:
        vals = self.ic_series
        return float(np.mean(vals)) if vals else None

    @property
    def mean_rank_ic(self) -> Optional[float]:
        vals = self.rank_ic_series
        return float(np.mean(vals)) if vals else None

    @property
    def ic_std(self) -> Optional[float]:
        vals = self.ic_series
        return float(np.std(vals, ddof=1)) if len(vals) > 1 else None

    @property
    def icir(self) -> Optional[float]:
        """IC Information Ratio"""
        m = self.mean_ic
        s = self.ic_std
        if m is not None and s and s > 0:
            return m / s
        return None

    @property
    def rank_icir(self) -> Optional[float]:
        m = self.mean_rank_ic
        vals = self.rank_ic_series
        s = float(np.std(vals, ddof=1)) if len(vals) > 1 else None
        if m is not None and s and s > 0:
            return m / s
        return None

    @property
    def hit_rate(self) -> Optional[float]:
        """IC 方向正确率（Pearson IC > 0 的比例）"""
        vals = self.ic_series
        if not vals:
            return None
        return sum(1 for v in vals if v > 0) / len(vals)

    @property
    def n_periods(self) -> int:
        return len(self.periods)

    def report(self) -> str:
        lines = [f"\n=== 因子IC报告: {self.factor_name} ==="]
        lines.append(f"周期数: {self.n_periods}")
        lines.append(f"Mean IC:    {self.mean_ic:+.4f}" if self.mean_ic else "Mean IC: N/A")
        lines.append(f"Mean RankIC:{self.mean_rank_ic:+.4f}" if self.mean_rank_ic else "Mean RankIC: N/A")
        lines.append(f"IC Std:     {self.ic_std:.4f}" if self.ic_std else "IC Std: N/A")
        lines.append(f"ICIR:       {self.icir:.4f}" if self.icir else "ICIR: N/A")
        lines.append(f"Hit Rate:   {self.hit_rate:.1%}" if self.hit_rate else "Hit Rate: N/A")

        if self.ic_series:
            max_ic = max(self.ic_series, key=abs)
            lines.append(f"") 
            lines.append(f"评价:")
            if self.mean_ic and abs(self.mean_ic) < 0.02:
                lines.append("  ⚠️ 因子IC接近0，预测能力不足")
            if self.icir and self.icir < 0.5:
                lines.append("  ⚠️ ICIR < 0.5，IC稳定性不足")
            if self.hit_rate and self.hit_rate < 0.55:
                lines.append("  ⚠️ Hit Rate < 55%，方向预测不可靠")
            if self.mean_ic and abs(self.mean_ic) >= 0.05 and self.icir and self.icir >= 0.5:
                lines.append("  ✅ 因子IC表现良好，具有稳定预测能力")

        return "\n".join(lines)


@dataclass
class BacktestMetrics:
    """回测整体指标"""
    total_periods: int = 0
    mean_ic: Optional[float] = None
    mean_rank_ic: Optional[float] = None
    icir: Optional[float] = None
    hit_rate: Optional[float] = None
    factor_returns: Dict[str, float] = field(default_factory=dict)
    factor_ir: Dict[str, float] = field(default_factory=dict)

    def summary(self) -> str:
        lines = ["\n=== 回测指标汇总 ==="]
        lines.append(f"回测周期数: {self.total_periods}")
        if self.mean_ic is not None:
            lines.append(f"全因子 Mean IC: {self.mean_ic:+.4f}")
            lines.append(f"全因子 ICIR:   {self.icir:.4f}" if self.icir else "")
            lines.append(f"全因子 HitRate: {self.hit_rate:.1%}" if self.hit_rate else "")
        lines.append("")
        if self.factor_returns:
            lines.append("各因子多空收益:")
            for fn, ret in sorted(self.factor_returns.items(),
                                   key=lambda x: -abs(x[1])):
                lines.append(f"  {fn:30s} {ret:+.2f}%")
        return "\n".join(lines)
