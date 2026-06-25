"""所有策略模块的注册表"""
from .trend import TrendStrategy
from .mean_reversion import MeanReversionStrategy
from .momentum_flow import MomentumFlowStrategy
from .volume_price import VolumePriceStrategy
from .market_context import MarketContextStrategy
from .behavioral import BehavioralStrategy
from .anomaly import AnomalyStrategy
from .value_factor import ValueFactorStrategy
from .rotation import RotationStrategy

STRATEGY_REGISTRY = {
    "trend":           TrendStrategy,
    "mean_reversion":  MeanReversionStrategy,
    "momentum_flow":   MomentumFlowStrategy,
    "volume_price":    VolumePriceStrategy,
    "market_context":  MarketContextStrategy,
    "behavioral":      BehavioralStrategy,
    "anomaly":         AnomalyStrategy,
    "value_factor":    ValueFactorStrategy,
    "rotation":        RotationStrategy,
}

def get_strategy(name: str):
    """按名称获取策略类"""
    cls = STRATEGY_REGISTRY.get(name)
    if cls is None:
        raise KeyError(f"未知策略: {name}, 可用: {list(STRATEGY_REGISTRY.keys())}")
    return cls

def list_strategies() -> list:
    """列出所有可用策略"""
    return [
        {"name": k, "cls": v.__name__, "desc": v.__doc__.strip().split(chr(10))[0] if v.__doc__ else ""}
        for k, v in STRATEGY_REGISTRY.items()
    ]

print("✔ strategies 注册表加载 — 9 个策略")
