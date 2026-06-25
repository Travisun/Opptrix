"""
机构评估模块 — 多机构视角的个股评级体系
"""

from .base import (
    InstitutionEvaluator,
    InstitutionRating,
    RatingLevel,
    EvalDimension, EvalQuality,
)

from .international import (
    GoldmanSachsEvaluator,
    MorganStanleyEvaluator,
    JPMorganEvaluator,
    UBSEvaluator,
    CitiEvaluator,
    CreditSuisseEvaluator,
    BarclaysEvaluator,
    HSBCEvaluator,
    DeutscheBankEvaluator,
)

from .domestic import (
    CICCEvaluator,
    CITICEvaluator,
    HuataiEvaluator,
    CMSEvaluator,
    GuotaiJunanEvaluator,
)

from .national_team import (
    SocialSecurityEvaluator,
    HuijinEvaluator,
    CSFEvaluator,
    BigFundEvaluator,
)

from .northbound import NorthboundFundEvaluator
from .technical import TechnicalIndicatorEvaluator

from .consolidated import (
    ConsolidatedRating,
    ConsolidatedReport,
    ConsolidatedEngine,
    ALL_EVALUATORS,
    EVALUATOR_GROUPS,
)

__all__ = [
    "InstitutionEvaluator", "InstitutionRating", "RatingLevel", "EvalDimension",
    "GoldmanSachsEvaluator", "MorganStanleyEvaluator", "JPMorganEvaluator",
    "UBSEvaluator", "CitiEvaluator", "CreditSuisseEvaluator",
    "BarclaysEvaluator", "HSBCEvaluator", "DeutscheBankEvaluator",
    "CICCEvaluator", "CITICEvaluator", "HuataiEvaluator",
    "CMSEvaluator", "GuotaiJunanEvaluator",
    "SocialSecurityEvaluator", "HuijinEvaluator",
    "CSFEvaluator", "BigFundEvaluator",
    "NorthboundFundEvaluator", "TechnicalIndicatorEvaluator",
    "ConsolidatedRating", "ConsolidatedReport", "ConsolidatedEngine",
    "ALL_EVALUATORS", "EVALUATOR_GROUPS",
]
