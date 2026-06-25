"""
Asset Allocation Models — 资产配置模型
=========================================
来源: Markowitz (MPT), Bridgewater (Risk Parity), Black-Litterman
"""
from __future__ import annotations

import numpy as np


def risk_parity_weights(cov_matrix: np.ndarray) -> np.ndarray:
    """风险平价权重 (Risk Parity) — 使每种资产的风险贡献度相等。"""
    n = cov_matrix.shape[0]
    inv_vol = 1.0 / np.sqrt(np.diag(cov_matrix))
    return inv_vol / inv_vol.sum()


def mean_variance_weights(expected_returns: np.ndarray,
                          cov_matrix: np.ndarray,
                          risk_aversion: float = 2.0) -> np.ndarray:
    """均值-方差最优权重 (Markowitz MPT)。"""
    n = len(expected_returns)
    inv_cov = np.linalg.inv(cov_matrix)
    ones = np.ones(n)
    # 简化版: 不约束做空
    w = np.dot(inv_cov, expected_returns) / risk_aversion
    return w / np.sum(w)


def kelly_fraction(win_rate: float, avg_win: float, avg_loss: float) -> float:
    """凯利公式最优投注比例。"""
    if avg_loss == 0:
        return 0
    b = avg_win / avg_loss
    q = 1 - win_rate
    f = (b * win_rate - q) / b
    return max(0, min(1, f))


def half_kelly(win_rate: float, avg_win: float, avg_loss: float) -> float:
    """半凯利 (更保守)。"""
    return kelly_fraction(win_rate, avg_win, avg_loss) * 0.5


def max_drawdown_limit(total_risk: float, max_dd: float = 0.15) -> float:
    """最大回撤限制下的仓位比例。"""
    if total_risk <= 0:
        return 0
    return min(1.0, max_dd / total_risk)


print("  ✔ portfolio/allocation")
