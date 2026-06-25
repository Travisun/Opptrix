from __future__ import annotations
"""
行业中性化处理器

把因子值从"全市场排名"转换成"行业内排名"，消除行业偏见。

核心逻辑:
  PE在银行股和科技股的含义完全不同。
  行业中性化让评分只衡量"在同行中的相对位置",
  而不是因为某行业整体估值低就给它高分。

用法:
    neutralizer = IndustryNeutralizer()
    neutralizer.compute(snapshots, ["pe_percentile", "roe"])
    # 之后每个 snapshot.scores 会多出 pe_percentile_adj_score
    # 以及被记录所属行业
"""

from typing import Optional, List, Dict
import numpy as np
from dataclasses import dataclass

from ..core.models import StockSnapshot
from ..core.registry import REGISTRY


@dataclass
class IndustryGroup:
    """一个行业分组的统计结果"""
    industry: str
    count: int
    mean_value: Optional[float] = None
    std_value: Optional[float] = None


class IndustryNeutralizer:
    """
    行业中性化

    对一组股票的快照，按行业分组，对每个因子计算行业内百分位。

    参数:
      data_engine: 需要传入 AshareEngine 以获取行业归属
      min_industry_size: 行业少于多少只股票时不作中性化（数据太少无统计意义）
    """

    def __init__(self, data_engine=None, min_industry_size: int = 5):
        self._de = data_engine
        self._min_size = min_industry_size

    def compute(self, snapshots: List[StockSnapshot],
                factor_names: Optional[List[str]] = None,
                inplace: bool = True) -> List[StockSnapshot]:
        """
        对一批评估快照执行行业中性化

        参数:
          snapshots: 评估快照列表
          factor_names: 需要中性化的因子列表，None=全部
          inplace: 是否原地修改

        返回: 同列表（原地或新列表），每个 snapshot 被注入:
            .industry: str                    -- 所属行业
            .scores["{fn}_industry_score"]    -- 行业内百分位分数
        """
        if not inplace:
            snapshots = snapshots[:]  # 浅拷贝

        names = factor_names or REGISTRY.list()
        names = [n for n in names if REGISTRY.get_meta(n) is not None]

        # 1. 获取行业归属（如没有现成的，从 a_stock_layer 获取）
        self._assign_industries(snapshots)

        # 2. 按行业分组
        groups: Dict[str, List[StockSnapshot]] = {}
        for s in snapshots:
            ind = getattr(s, "industry", None) or "未知"
            groups.setdefault(ind, []).append(s)

        # 3. 对每个行业、每个因子，计算行业内百分位
        for ind, members in groups.items():
            if len(members) < self._min_size:
                # 行业样本太少，回退到整体百分位（即保持原样）
                for s in members:
                    for fn in names:
                        key = f"{fn}_industry_score"
                        raw = s.get(fn)
                        if raw is not None:
                            s.scores[key] = 50.0  # 中性值
                continue

            for fn in names:
                values = np.array([
                    s.get(fn) for s in members
                ], dtype=float)

                valid_mask = ~np.isnan(values)
                if not valid_mask.any():
                    continue

                valid_vals = values[valid_mask]
                sorted_vals = np.sort(valid_vals)
                ranks = np.searchsorted(sorted_vals, valid_vals, side="left")
                pcts = ranks / len(valid_vals) * 100

                # 写入
                j = 0
                for i, s in enumerate(members):
                    key = f"{fn}_industry_score"
                    if valid_mask[i]:
                        s.scores[key] = round(float(pcts[j]), 1)
                        j += 1
                    else:
                        s.scores[key] = None

        return snapshots

    def _assign_industries(self, snapshots: List[StockSnapshot]):
        """为快照补全行业信息"""
        # 跳过已有行业的
        need = [s for s in snapshots
                if not hasattr(s, "industry") or not s.industry]
        if not need or self._de is None:
            return

        for s in need:
            try:
                r = self._de.profile(s.code)
                if r.success and r.data:
                    ind = r.data[0].industry or "未知"
                    if isinstance(ind, str) and "/" in ind:
                        ind = ind.split("/")[0].strip()
                    s.industry = ind
                else:
                    s.industry = "未知"
            except Exception:
                s.industry = "未知"

    def get_industry_breakdown(self, snapshots: List[StockSnapshot]
                               ) -> Dict[str, IndustryGroup]:
        """返回行业分组统计"""
        groups = {}
        for s in snapshots:
            ind = getattr(s, "industry", None) or "未知"
            if ind not in groups:
                groups[ind] = IndustryGroup(industry=ind, count=0)
            groups[ind].count += 1
        return groups

    def summary(self, snapshots: List[StockSnapshot],
                factor_name: str) -> str:
        """打印一个因子的行业分布摘要"""
        import numpy as np  # noqa
        lines = [f"\n--- 行业中性化报告: {factor_name} ---"]
        groups = self.get_industry_breakdown(snapshots)

        # 先补全行业
        self._assign_industries(snapshots)

        ind_values = {}
        for s in snapshots:
            ind = getattr(s, "industry", "未知")
            val = s.get(factor_name)
            if val is not None:
                ind_values.setdefault(ind, []).append(val)

        for ind in sorted(ind_values.keys()):
            vals = ind_values[ind]
            mean = np.mean(vals)
            std = np.std(vals, ddof=1)
            lines.append(
                f"  {ind:20s} n={len(vals):4d}  "
                f"mean={mean:8.2f}  std={std:8.2f}"
            )

        return "\n".join(lines)
