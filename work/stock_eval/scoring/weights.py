from __future__ import annotations
"""
预置评分卡模板 — 包含 delta 因子
"""

_TEMPLATE_DATA: dict[str, tuple] = {
    "价值评估": (
        "价值评估",
        "基于历史估值百分位和收益率的低估评估",
        [
            ("pe_percentile", 0.25, "percentile"),
            ("pb_percentile", 0.20, "percentile"),
            ("dividend_yield", 0.20, "percentile"),
            ("fcf_yield", 0.20, "percentile"),
            ("peg", 0.15, "percentile"),
        ],
    ),
    "成长评估": (
        "成长评估",
        "基于营收/利润增速、ROE改善和边际变化的成长性评估",
        [
            ("revenue_cagr_3y", 0.15, "percentile"),
            ("profit_cagr_3y", 0.15, "percentile"),
            ("roe_trend", 0.10, "percentile"),
            ("revenue_delta_4q", 0.15, "percentile"),
            ("profit_delta_4q", 0.15, "percentile"),
            ("gross_margin_delta_4q", 0.10, "percentile"),
            ("improvement_score", 0.10, "percentile"),
            ("peg", 0.10, "percentile"),
        ],
    ),
    "质量评估": (
        "质量评估",
        "基于盈利能力、运营效率、财务健康、现金流质量的综合评估",
        [
            ("roe", 0.20, "percentile"),
            ("gross_margin", 0.15, "percentile"),
            ("operating_margin", 0.12, "percentile"),
            ("net_profit_margin", 0.10, "percentile"),
            ("asset_turnover", 0.08, "percentile"),
            ("debt_ratio", 0.10, "percentile"),
            ("fcf_yield", 0.10, "percentile"),
            ("roe_delta_4q", 0.05, "percentile"),
            ("fcf_delta_1q", 0.05, "percentile"),
            ("debt_ratio_delta_1q", 0.05, "percentile"),
        ],
    ),
    "技术评估": (
        "技术评估",
        "基于技术指标位置和量价关系的技术面评估",
        [
            ("ma_position", 0.25, "percentile"),
            ("rsi_score", 0.25, "percentile"),
            ("volume_ratio", 0.25, "percentile"),
            ("volatility_1y", 0.25, "percentile"),
        ],
    ),
    "动量评估": (
        "动量评估",
        "基于多周期价格动量的趋势评估",
        [
            ("momentum_1m", 0.20, "percentile"),
            ("momentum_3m", 0.25, "percentile"),
            ("momentum_6m", 0.25, "percentile"),
            ("momentum_12m_1m", 0.30, "percentile"),
        ],
    ),
    "综合评估": (
        "综合评估",
        "综合价值/成长/质量/技术/动量和边际变化的全面评估",
        [
            # 价值 (15%)
            ("pe_percentile", 0.06, "percentile"),
            ("pb_percentile", 0.04, "percentile"),
            ("dividend_yield", 0.05, "percentile"),
            # 成长 (25%)
            ("revenue_cagr_3y", 0.07, "percentile"),
            ("profit_cagr_3y", 0.07, "percentile"),
            ("profit_delta_4q", 0.06, "percentile"),
            ("revenue_delta_4q", 0.05, "percentile"),
            # 质量 (25%)
            ("roe", 0.08, "percentile"),
            ("gross_margin", 0.06, "percentile"),
            ("operating_margin", 0.04, "percentile"),
            ("debt_ratio", 0.04, "percentile"),
            ("fcf_yield", 0.03, "percentile"),
            # 边际变化 (12%)
            ("improvement_score", 0.06, "percentile"),
            ("roe_delta_4q", 0.03, "percentile"),
            ("gross_margin_delta_4q", 0.03, "percentile"),
            # 技术 (13%)
            ("ma_position", 0.04, "percentile"),
            ("rsi_score", 0.04, "percentile"),
            ("volume_ratio", 0.05, "percentile"),
            # 动量 (10%)
            ("momentum_3m", 0.05, "percentile"),
            ("momentum_6m", 0.05, "percentile"),
        ],
    ),
    "低风险评估": (
        "低风险评估",
        "基于负债率、波动率、回撤、Beta的风险评估",
        [
            ("debt_ratio", 0.20, "percentile"),
            ("debt_ratio_delta_1q", 0.10, "percentile"),
            ("volatility_1y", 0.20, "percentile"),
            ("max_drawdown_1y", 0.20, "percentile"),
            ("beta_1y", 0.20, "percentile"),
            ("fcf_yield", 0.10, "percentile"),
        ],
    ),
    "困境反转": (
        "困境反转",
        "识别短期超卖、估值低位、边际改善的反转标的",
        [
            ("short_term_reversal", 0.25, "percentile"),
            ("rsi_score", 0.15, "percentile"),
            ("pe_percentile", 0.15, "percentile"),
            ("ma_position", 0.15, "percentile"),
            ("improvement_score", 0.15, "percentile"),
            ("profit_delta_1q", 0.15, "percentile"),
        ],
    ),
}

TEMPLATE_CATEGORIES: dict[str, list[str]] = {
    "估值": ["价值评估"],
    "成长": ["成长评估"],
    "质量": ["质量评估"],
    "技术": ["技术评估"],
    "动量": ["动量评估"],
    "风险": ["低风险评估"],
    "反转": ["困境反转"],
    "综合": ["综合评估"],
}


def get_template_data(name: str) -> tuple:
    if name not in _TEMPLATE_DATA:
        raise KeyError(f"未知评分卡模板: {name}")
    return _TEMPLATE_DATA[name]


def list_template_names() -> list[str]:
    return list(_TEMPLATE_DATA.keys())
