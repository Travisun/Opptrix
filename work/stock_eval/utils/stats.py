from __future__ import annotations
"""基础统计工具 — 纯 numpy，零外部依赖"""

from typing import Tuple
import numpy as np


def spearman_rank(x: np.ndarray, y: np.ndarray) -> Tuple[float, float]:
    """
    Spearman 秩相关系数 (纯 numpy)

    返回 (correlation, p_value_approx)
    p_value 是近似值，仅供趋势参考。
    """
    n = len(x)
    if n < 3:
        return 0.0, 1.0

    x_rank = np.argsort(np.argsort(x)).astype(float)
    y_rank = np.argsort(np.argsort(y)).astype(float)

    r = float(np.corrcoef(x_rank, y_rank)[0, 1])

    # p-value 近似: T = r * sqrt((n-2)/(1-r^2)) ~ t(n-2)
    import math
    try:
        t = r * math.sqrt((n - 2) / max(1 - r * r, 1e-10))
        from numpy.random import standard_t
        # 用正态近似代替 t 分布 (大样本下等价)
        p = 2 * (1 - 0.5 * (1 + math.erf(abs(t) / math.sqrt(2))))
    except Exception:
        p = 1.0

    return r, p
