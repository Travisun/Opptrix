from __future__ import annotations
"""
评分卡系统 -- 多维度加权评分

核心概念：
  ScorecardTemplate -- 评分卡模版（命名、维度权重、归一化方法）
  Scorecard         -- 对一组股票执行评分
"""

from dataclasses import dataclass
from typing import Optional, List, Tuple
import pandas as pd

from ..core.models import StockSnapshot
from ..core.registry import REGISTRY
from .normalize import NORMALIZERS
from .weights import get_template_data, list_template_names


@dataclass
class ScorecardTemplate:
    """评分卡模版"""
    name: str
    description: str
    factors: List[Tuple[str, float, str]]

    def __post_init__(self):
        if not self.factors:
            raise ValueError("评分卡至少需要一个因子")
        total = sum(w for _, w, _ in self.factors)
        if abs(total - 1.0) > 0.001:
            self.factors = [
                (n, w / total, m) for n, w, m in self.factors
            ]

    @property
    def factor_names(self) -> List[str]:
        return [n for n, _, _ in self.factors]


class Scorecard:
    """评分卡执行器"""

    def __init__(self, template: ScorecardTemplate):
        self.template = template

    @property
    def name(self) -> str:
        return self.template.name

    def score(self, snapshots: List[StockSnapshot]) -> List[StockSnapshot]:
        if not snapshots:
            return snapshots

        for fname, weight, norm_method in self.template.factors:
            raw_values = [s.get(fname) for s in snapshots]
            meta = REGISTRY.get_meta(fname)
            hib = meta.higher_is_better if meta else True
            normalizer = NORMALIZERS.get(norm_method, NORMALIZERS["percentile"])
            normed = normalizer(raw_values, higher_is_better=hib)

            for s, score in zip(snapshots, normed):
                if s is not None and score is not None:
                    s.scores[f"{fname}_score"] = score

        for s in snapshots:
            total = 0.0
            effective_weight_sum = 0.0
            for fname, weight, _ in self.template.factors:
                key = f"{fname}_score"
                score = s.scores.get(key)
                if score is not None:
                    total += score * weight
                    effective_weight_sum += weight
            s.total_score = round(total / effective_weight_sum, 1) if effective_weight_sum > 0 else 0.0

        return snapshots

    def score_to_df(self, snapshots: List[StockSnapshot]) -> pd.DataFrame:
        self.score(snapshots)
        return pd.DataFrame([s.to_dict() for s in snapshots])

    def __repr__(self):
        names = ", ".join(n for n, _, _ in self.template.factors)
        return f"<Scorecard '{self.name}': [{names}]>"


# -- 工厂方法 -------------------------------------------------------

def create_scorecard(name: str) -> Scorecard:
    """从预置模版创建评分卡"""
    t_name, t_desc, t_factors = get_template_data(name)
    template = ScorecardTemplate(name=t_name, description=t_desc, factors=t_factors)
    return Scorecard(template)


def list_templates() -> List[str]:
    """列出可用的评分卡模板"""
    return list_template_names()
