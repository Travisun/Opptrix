"""
财务衍生计算 — CAGR、趋势、杜邦分析等
"""

from typing import Optional


def cagr(values: list[float], n_years: Optional[int] = None) -> Optional[float]:
    """
    复合增长率

    参数:
      values: [最近值, ..., 最早值] 或 [最早, ..., 最近]
      n_years: 跨期年数，None 则自动根据 values 长度推断
    """
    vals = [v for v in values if v is not None and v > 0]
    if len(vals) < 2:
        return None
    if n_years is None:
        n_years = len(vals) - 1
    if n_years <= 0:
        return None
    try:
        return (vals[0] / vals[-1]) ** (1 / n_years) - 1
    except (ZeroDivisionError, ValueError):
        return None


def safe_pct_change(new: float, old: float) -> Optional[float]:
    """安全计算百分比变化"""
    if old == 0 or new is None or old is None:
        return None
    return (new - old) / abs(old)


def dupont_analysis(roe: float, net_profit_margin: float,
                    asset_turnover: float, equity_multiplier: float) -> dict:
    """
    杜邦分析

    ROE = 净利率 × 资产周转率 × 权益乘数

    返回每项贡献度
    """
    calc_npm = roe / (asset_turnover * equity_multiplier) if (
        asset_turnover * equity_multiplier) != 0 else 0
    return {
        "roe": roe,
        "net_profit_margin": net_profit_margin,
        "asset_turnover": asset_turnover,
        "equity_multiplier": equity_multiplier,
        "profit_driver": net_profit_margin / (net_profit_margin + asset_turnover + equity_multiplier) * 100 if (net_profit_margin + asset_turnover + equity_multiplier) != 0 else 0,
        "efficiency_driver": asset_turnover / (net_profit_margin + asset_turnover + equity_multiplier) * 100 if (net_profit_margin + asset_turnover + equity_multiplier) != 0 else 0,
        "leverage_driver": equity_multiplier / (net_profit_margin + asset_turnover + equity_multiplier) * 100 if (net_profit_margin + asset_turnover + equity_multiplier) != 0 else 0,
    }


def classify_roe_quality(roe: float, roe_trend: float) -> str:
    """ROE质量分类"""
    if roe is None:
        return "数据不足"
    if roe >= 20 and roe_trend >= 0:
        return "优秀（高ROE且持续改善）"
    elif roe >= 15:
        return "良好"
    elif roe >= 10:
        return "中等"
    elif roe >= 0:
        return "待改善"
    else:
        return "亏损"
