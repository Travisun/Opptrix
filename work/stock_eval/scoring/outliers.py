from __future__ import annotations
"""
异常值处理 — Winsorize / 截断 / 缺失值填充

在归一化之前调用，防止极端值污染百分位排名。

用法:
    from stock_eval.scoring.outliers import winsorize, clean_factors
    cleaned = winsorize(raw_values, pct=1.0)  # 两端各截1%
    snapshots = clean_factors(snapshots, ["roe", "pe_percentile"])
"""

from typing import Optional, List, Dict
import numpy as np

from ..core.models import StockSnapshot


def winsorize(values: List[Optional[float]],
              pct: float = 1.0,
              clip_min: Optional[float] = None,
              clip_max: Optional[float] = None) -> List[Optional[float]]:
    """
    Winsorize 截尾 — 将两端极端值替换为最近的合理值

    参数:
      pct: 每端截尾百分位 (0.5 → 两端各截 0.5%)
      clip_min/clip_max: 硬性上下界
    """
    valid = [(i, v) for i, v in enumerate(values)
             if v is not None and np.isfinite(v)]
    if not valid:
        return values

    idxs = [v[0] for v in valid]
    vals = np.array([v[1] for v in valid])

    lo = clip_min if clip_min is not None else np.percentile(vals, pct)
    hi = clip_max if clip_max is not None else np.percentile(vals, 100 - pct)
    clipped = np.clip(vals, lo, hi)

    result = list(values)
    for i, v in zip(idxs, clipped):
        result[i] = round(float(v), 4) if isinstance(values[i], (int, float)) else values[i]
    return result


def fill_missing(values: List[Optional[float]],
                 strategy: str = "mean") -> List[Optional[float]]:
    """缺失值填充"""
    valid = [v for v in values if v is not None and np.isfinite(v)]
    if not valid:
        return values

    if strategy == "mean":
        fill = float(np.mean(valid))
    elif strategy == "median":
        fill = float(np.median(valid))
    elif strategy == "zero":
        fill = 0.0
    else:
        return values  # skip

    return [v if v is not None else fill for v in values]


def clean_factors(snapshots: List[StockSnapshot],
                  factor_names: Optional[List[str]] = None,
                  winsorize_pct: float = 1.0,
                  missing_strategy: str = "skip",
                  clip_rules: Optional[Dict[str, tuple]] = None
                  ) -> List[StockSnapshot]:
    """
    批量清洗因子值

    参数:
      clip_rules: {因子名: (min, max)} 硬性边界
    """
    from ..core.registry import REGISTRY

    names = factor_names or REGISTRY.list()
    clip_rules = clip_rules or {}

    for fname in names:
        meta = REGISTRY.get_meta(fname)
        if meta is None:
            continue

        raw = [s.get(fname) for s in snapshots]

        # 1. 硬性边界裁剪
        lo, hi = clip_rules.get(fname, (None, None))
        if lo is not None or hi is not None:
            raw = [
                v if v is None else max(lo, min(hi, v))
                for v in raw
            ]

        # 2. Winsorize
        cleaned = winsorize(raw, pct=winsorize_pct)

        # 3. 缺失值
        if missing_strategy != "skip":
            cleaned = fill_missing(cleaned, missing_strategy)

        # 4. 写回
        for s, val in zip(snapshots, cleaned):
            if s.factors.get(fname) is not None:
                s.factors[fname].value = val

    return snapshots
