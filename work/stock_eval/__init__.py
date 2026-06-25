"""
stock_eval — A股个股评估与投研工具包
"""

# ── 自动路径初始化 ──────────────────────────────
import os, sys
_lib_init = os.path.join(
    os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
    "lib", "__init__.py"
)
if os.path.exists(_lib_init):
    import importlib.util
    spec = importlib.util.spec_from_file_location("_lib_bootstrap", _lib_init)
    if spec and spec.loader:
        try:
            spec.loader.exec_module(importlib.util.module_from_spec(spec))
        except Exception:
            pass
# ──────────────────────────────────────────────────


"""
stock_eval — A股个股评估与投研工具包
"""

from . import core
from . import factors
from . import scoring
from . import screening
from . import utils
from . import analysis
from . import backtest

from .core.engine import EvaluationEngine
from .core.registry import REGISTRY, register_factor
from .core.store import SnapshotStore, StoredSnapshot
from .core.config import EvalConfig, DEFAULT_CONFIG
from .scoring.neutralizer import IndustryNeutralizer, IndustryGroup
from .scoring.correlation import FactorCorrelation
from .scoring.outliers import clean_factors, winsorize
from .scoring.regime import MarketRegimeDetector, RegimeWeightAdjuster, MarketRegime
from .analysis.portfolio import PortfolioAnalyzer

__all__ = [
    "EvaluationEngine", "REGISTRY", "register_factor",
    "SnapshotStore", "StoredSnapshot",
    "EvalConfig", "DEFAULT_CONFIG",
    "IndustryNeutralizer", "IndustryGroup",
    "FactorCorrelation",
    "clean_factors", "winsorize",
    "MarketRegimeDetector", "RegimeWeightAdjuster", "MarketRegime",
    "PortfolioAnalyzer",
]

__version__ = "0.2.0"
