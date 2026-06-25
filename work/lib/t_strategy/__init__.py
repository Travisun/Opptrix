"""
t-strategy — A股投行级策略研究框架
=====================================
来源: Goldman Sachs, JP Morgan, Morgan Stanley, Bridgewater,
      Fama-French, AQR, 中金, 中信等

完整能力索引:
─────────────
信号引擎:
  signal_engine.SignalEngine      — 多策略信号融合引擎
  signal_engine.quick_assess      — 一句话快速评估
  signal_engine.scan_portfolio    — 持仓批量扫描
  reports.generate                — 完整分析报告

技术指标 (50+):
  indicators.ma, ema, wma         — 移动均线
  indicators.macd                 — MACD (Appel)
  indicators.rsi                  — RSI (Wilder)
  indicators.kdj                  — KDJ (Lane)
  indicators.bollinger            — Bollinger Bands (Bollinger)
  indicators.adx                  — ADX (Wilder)
  indicators.atr                  — ATR (Wilder)
  indicators.cci                  — CCI (Lambert)
  indicators.mfi                  — MFI
  indicators.obv                  — OBV (Granville)
  indicators.williams_r           — Williams %R
  indicators.detect_candlestick_patterns — K线形态识别
  indicators.compute_all          — 一键计算全部指标

基本面因子:
  factors.compute_value_factors   — 估值因子
  factors.compute_momentum_factors — 动量因子
  factors.compute_quality_factors — 质量因子
  factors.compute_low_vol_factors — 低波因子

组合与风控:
  portfolio.allocation.risk_parity_weights — 风险平价
  portfolio.allocation.kelly_fraction       — 凯利公式
  portfolio.risk.fixed_stop_loss            — 固定止损
  portfolio.risk.trailing_stop              — 移动止损
  portfolio.risk.position_sizing            — 仓位计算
  portfolio.risk.sharpe_ratio               — 夏普比率

策略列表 (9 个):
  strategies.TrendStrategy              — 多周期趋势 (GS GAT)
  strategies.MeanReversionStrategy       — 均值回归 (JP Morgan)
  strategies.MomentumFlowStrategy        — 动量+资金 (MS)
  strategies.VolumePriceStrategy         — 量价关系 (MS)
  strategies.MarketContextStrategy        — 市场背景 (Bridgewater)
  strategies.BehavioralStrategy          — 行为金融
  strategies.AnomalyStrategy             — 市场异象+事件
  strategies.ValueFactorStrategy         — 价值因子
  strategies.RotationStrategy            — 行业轮动
"""
from __future__ import annotations

from . import indicators, factors, data, portfolio
from .signal_engine import SignalEngine, quick_assess, scan_portfolio
from .base import AnalysisResult, BaseStrategy, Signal
from .strategies import STRATEGY_REGISTRY, list_strategies, get_strategy
from .reports import generate as generate_report, strategy_summary
from .data import gather_all, clear_cache, fetch_kline

__all__ = [
    # 引擎
    "SignalEngine", "quick_assess", "scan_portfolio",
    # 报告
    "generate_report", "strategy_summary",
    # 数据
    "gather_all", "clear_cache", "fetch_kline",
    # 子模块
    "indicators", "factors", "data", "portfolio",
    # 策略系统
    "STRATEGY_REGISTRY", "list_strategies", "get_strategy",
    # 基础类
    "AnalysisResult", "BaseStrategy", "Signal",
]

# 模块级__repr__
def __str__():
    return (
        "t-strategy v1.0 — A股投行级策略研究框架\n"
        "  • 9 个策略 (GS/JP/MS/Bridgewater/行为/异象/价值/轮动)\n"
        "  • 50+ 技术指标\n"
        "  • 8 个基本面因子\n"
        "  • 风控与组合工具\n"
        "  用法: from t_strategy import SignalEngine"
    )

print("✔ t-strategy 主模块加载完成 — 9策略 · 50+指标 · 因子模型 · 风控组合")
