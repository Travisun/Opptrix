from __future__ import annotations
"""
因子相关性矩阵 — 评估因子冗余度，指导权重调优

用法:
    from stock_eval.scoring.correlation import FactorCorrelation

    fc = FactorCorrelation()
    matrix = fc.compute(snapshots, ["roe", "gross_margin", "pe_percentile"])
    fc.report()   # 打印高度相关的因子对
    fc.heatmap()  # 返回相关性矩阵 DataFrame
"""

from typing import Optional, List, Dict, Tuple
import numpy as np
from dataclasses import dataclass, field

from ..core.models import StockSnapshot
from ..core.registry import REGISTRY


@dataclass
class CorrelatedPair:
    """高度相关的因子对"""
    factor_a: str
    factor_b: str
    correlation: float
    suggested_action: str = ""


REDUNDANCY_THRESHOLD = 0.75  # 超过此值视为冗余


class FactorCorrelation:
    """
    因子相关性分析

    对一组评估快照，计算各因子之间的 Pearson 相关系数。
    用于识别冗余因子、指导权重优化。
    """

    def __init__(self, threshold: float = REDUNDANCY_THRESHOLD):
        self._threshold = threshold
        self._matrix: Optional[np.ndarray] = None
        self._factor_names: List[str] = []
        self._redundant_pairs: List[CorrelatedPair] = []

    def compute(self, snapshots: List[StockSnapshot],
                factor_names: Optional[List[str]] = None) -> np.ndarray:
        """
        计算因子相关性矩阵

        参数:
          snapshots: 评估快照列表
          factor_names: 待分析的因子列表，None=全部

        返回: NxN 相关性矩阵
        """
        names = factor_names or REGISTRY.list()
        names = [n for n in names if REGISTRY.get_meta(n) is not None]

        # 提取有效数据
        data: Dict[str, List[float]] = {n: [] for n in names}
        for s in snapshots:
            for n in names:
                v = s.get(n)
                if v is not None and np.isfinite(v):
                    data[n].append(v)

        # 只保留有足够数据的因子
        names = [n for n in names if len(data.get(n, [])) >= 5]
        self._factor_names = names

        if len(names) < 2:
            self._matrix = np.array([[1.0]])
            return self._matrix

        # 对齐长度
        min_len = min(len(data[n]) for n in names)
        arr = np.column_stack([data[n][:min_len] for n in names])

        # 计算相关矩阵
        self._matrix = np.corrcoef(arr.T)
        self._find_redundant_pairs()

        return self._matrix

    def _find_redundant_pairs(self):
        """找出高度相关的因子对"""
        self._redundant_pairs = []
        n = len(self._factor_names)
        for i in range(n):
            for j in range(i + 1, n):
                corr = self._matrix[i, j]
                if abs(corr) >= self._threshold:
                    pair = CorrelatedPair(
                        factor_a=self._factor_names[i],
                        factor_b=self._factor_names[j],
                        correlation=round(float(corr), 3),
                    )
                    # 生成建议
                    meta_a = REGISTRY.get_meta(self._factor_names[i])
                    meta_b = REGISTRY.get_meta(self._factor_names[j])
                    if meta_a and meta_b and meta_a.category == meta_b.category:
                        pair.suggested_action = (
                            f"同属 [{meta_a.category.value}] 类别，建议合并或仅保留一个"
                        )
                    else:
                        pair.suggested_action = "跨类别相关，检查逻辑一致性"
                    self._redundant_pairs.append(pair)

    def get_matrix(self) -> Optional[np.ndarray]:
        return self._matrix

    def get_redundant_pairs(self) -> List[CorrelatedPair]:
        return self._redundant_pairs

    def get_factor_names(self) -> List[str]:
        return self._factor_names

    def suggest_weights(self, base_weights: Dict[str, float]
                        ) -> Dict[str, float]:
        """
        根据相关性建议权重调整

        对高度相关的因子对，将总权重减半分配（避免重复计算）。
        """
        result = dict(base_weights)
        for pair in self._redundant_pairs:
            wa = result.get(pair.factor_a, 0)
            wb = result.get(pair.factor_b, 0)
            if wa > 0 and wb > 0:
                avg = (wa + wb) / 2
                penalty = 0.6  # 60% 系数，减少冗余贡献
                result[pair.factor_a] = round(avg * penalty, 4)
                result[pair.factor_b] = round(avg * penalty, 4)
        return result

    def to_df(self):
        """返回 DataFrame 格式的相关矩阵"""
        import pandas as pd
        if self._matrix is None or not self._factor_names:
            return pd.DataFrame()
        return pd.DataFrame(
            self._matrix,
            index=self._factor_names,
            columns=self._factor_names,
        )

    def report(self) -> str:
        """打印可读的相关性报告"""
        lines = ["\n=== 因子相关性报告 ==="]
        if self._factor_names:
            lines.append(f"分析因子: {', '.join(self._factor_names)}")
            lines.append(f"样本数量: {self._matrix.shape[0]}")

        if not self._redundant_pairs:
            lines.append("\n✅ 未发现高度冗余的因子对 (< {:.0f}%)".format(
                self._threshold * 100))
        else:
            lines.append(f"\n⚠️ 发现 {len(self._redundant_pairs)} 对冗余因子:\n")
            for p in self._redundant_pairs:
                bar = "█" * int(abs(p.correlation) * 20)
                lines.append(
                    f"  {p.factor_a:28s} ↔ {p.factor_b:28s}  "
                    f"r={p.correlation:+.3f}  {bar}"
                )
                lines.append(f"  {' ' * 28}  → {p.suggested_action}")

        lines.append("\n建议:")
        if self._redundant_pairs:
            lines.append("  1. 将高度相关的因子合并或在一个评分卡中不要同时使用")
            lines.append("  2. 或使用 suggest_weights() 自动调整权重")
        else:
            lines.append("  当前因子结构良好，因子间区分度足够。")

        return "\n".join(lines)

    def __repr__(self):
        n = len(self._factor_names)
        p = len(self._redundant_pairs)
        return f"<FactorCorrelation {n}因子, {p}对冗余>"
