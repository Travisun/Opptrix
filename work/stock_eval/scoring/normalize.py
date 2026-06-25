from __future__ import annotations
"""
归一化方法 — 将原始因子值映射到 [0, 100] 分数

支持三种方法:
  percentile — 百分位法（推荐，最稳健）
  zscore     — Z-Score 法（需正态假设）
  minmax     — 最大最小法（对异常值敏感）
"""

from typing import Optional
import numpy as np


def normalize_percentile(values: list[Optional[float]],
                         higher_is_better: bool = True,
                         reverse: bool = False) -> list[Optional[float]]:
    """
    百分位归一化 — 映射到 [0, 100]

    在全体股票中的相对排名位置。
    不受极端值影响，最稳健。

    参数:
      values: 因子值列表，None跳过
      higher_is_better: True=值越大分越高
      reverse: 强制反转（覆盖 higher_is_better）

    返回: [0-100] 分数，None 保持 None
    """
    valid = [(i, v) for i, v in enumerate(values)
             if v is not None and np.isfinite(v)]
    if not valid:
        return [None] * len(values)

    idxs = [v[0] for v in valid]
    vals = np.array([v[1] for v in valid])

    # 计算百分位排名
    sorted_vals = np.sort(vals)
    ranks = np.searchsorted(sorted_vals, vals, side='left')
    scores = ranks / len(vals) * 100

    if not (higher_is_better ^ reverse):
        scores = 100 - scores

    result = [None] * len(values)
    for i, s in zip(idxs, scores):
        result[i] = round(float(s), 1)

    return result


def normalize_zscore(values: list[Optional[float]],
                     higher_is_better: bool = True,
                     cap: float = 3.0) -> list[Optional[float]]:
    """
    Z-Score 归一化 — 映射到 [0, 100]

    假设因子值呈正态分布。
    用 caps 截断极端值。

    返回: [0-100] 分数
    """
    valid = [(i, v) for i, v in enumerate(values)
             if v is not None and np.isfinite(v)]
    if not valid:
        return [None] * len(values)

    idxs = [v[0] for v in valid]
    vals = np.array([v[1] for v in valid])

    mean = np.mean(vals)
    std = np.std(vals, ddof=1)
    if std == 0:
        return [50.0] * len(values)

    zscores = (vals - mean) / std
    zscores = np.clip(zscores, -cap, cap)

    # 映射 [-cap, cap] → [0, 100]
    scores = (zscores + cap) / (2 * cap) * 100
    if not higher_is_better:
        scores = 100 - scores

    result = [None] * len(values)
    for i, s in zip(idxs, scores):
        result[i] = round(float(s), 1)
    return result


def normalize_minmax(values: list[Optional[float]],
                     higher_is_better: bool = True,
                     clip_pct: float = 1.0) -> list[Optional[float]]:
    """
    最大最小归一化 — 映射到 [0, 100]

    可选 clip_pct% 截尾处理，减少极端值影响。

    返回: [0-100] 分数
    """
    valid = [(i, v) for i, v in enumerate(values)
             if v is not None and np.isfinite(v)]
    if not valid:
        return [None] * len(values)

    idxs = [v[0] for v in valid]
    vals = np.array([v[1] for v in valid])

    if clip_pct > 0:
        lo = np.percentile(vals, clip_pct)
        hi = np.percentile(vals, 100 - clip_pct)
        vals = np.clip(vals, lo, hi)

    vmin, vmax = np.min(vals), np.max(vals)
    if vmax == vmin:
        return [50.0] * len(values)

    scores = (vals - vmin) / (vmax - vmin) * 100
    if not higher_is_better:
        scores = 100 - scores

    result = [None] * len(values)
    for i, s in zip(idxs, scores):
        result[i] = round(float(s), 1)
    return result


# 分发表
NORMALIZERS = {
    "percentile": normalize_percentile,
    "zscore": normalize_zscore,
    "minmax": normalize_minmax,
}
