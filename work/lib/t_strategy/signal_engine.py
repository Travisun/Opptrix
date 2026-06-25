"""
Signal Engine — 多策略信号融合引擎
====================================
融合 9 个策略、5 大来源的信号，加权投票产生最终决策。
"""
from __future__ import annotations

import logging
from typing import Any, Dict, List, Optional, Tuple

import pandas as pd

from a_stock_layer import AshareEngine

from .base import AnalysisResult, BaseStrategy, Signal
from .data import gather_all, clear_cache
from .strategies import STRATEGY_REGISTRY, list_strategies

logger = logging.getLogger("t_strategy.engine")


class SignalEngine:
    """信号融合引擎 — 运行所有策略并融合信号。"""

    # 策略分类和权重
    CATEGORY_WEIGHTS = {
        "GS_Trend": 0.25,
        "JP_Reversion": 0.25,
        "MS_Momentum": 0.20,
        "MS_Volume": 0.15,
        "Market_Context": 0.15,
    }

    def __init__(self, engine: AshareEngine):
        self.engine = engine
        # 实例化所有策略
        self.strategies = {
            name: cls()
            for name, cls in STRATEGY_REGISTRY.items()
        }

    def analyze(self, code: str,
                strategies: Optional[List[str]] = None,
                return_full: bool = False) -> AnalysisResult:
        """对单只股票运行全策略分析。

        Args:
            code: 股票代码
            strategies: 要运行的策略列表，None 为全部
            return_full: 是否返回完整数据结构

        Returns:
            AnalysisResult
        """
        # 1. 采集全量数据
        data = gather_all(self.engine, code)
        data["_engine"] = self.engine

        result = AnalysisResult(code=code)
        if data.get("price") is None:
            result.reasons = ["数据采集失败"]
            return result

        result.price = data.get("price", 0)

        # 2. 运行各策略
        all_signals: List[Signal] = []
        strategy_results = {}

        to_run = strategies if strategies else list(self.strategies.keys())

        for name in to_run:
            strategy = self.strategies.get(name)
            if strategy is None:
                continue
            try:
                sigs = strategy.analyze(data)
                all_signals.extend(sigs)
                strategy_results[name] = {
                    "signals": sigs,
                    "count": len(sigs),
                }
            except Exception as e:
                logger.warning("策略 %s 异常: %s", name, e)
                strategy_results[name] = {"error": str(e)}

        # 3. 信号融合
        score, verdict, reasons, confidence = self._fuse(all_signals, data)

        result.signals = all_signals
        result.score = score
        result.verdict = verdict
        result.confidence = confidence
        result.reasons = reasons

        if return_full:
            result.details = {
                "data": {k: v for k, v in data.items()
                         if not k.startswith("_") and not isinstance(v, pd.DataFrame)},
                "strategy_results": strategy_results,
                "strategy_count": len(self.strategies),
                "signal_count": len(all_signals),
            }

        return result

    # ── 信号融合 ──────────────────────────────────────────────────────

    def _fuse(self, signals: List[Signal], data: dict) -> Tuple[float, str, List[str], float]:
        """融合所有信号。

        规则:
        - BUY  信号贡献 +strength × weight
        - SELL 信号贡献 -strength × weight
        - HOLD 信号贡献 0
        - 市场背景作为调节因子
        """
        cat_map = {
            # Trend
            "Trend_Buy": "GS_Trend", "Trend_Sell": "GS_Trend",
            # Mean Reversion
            "Bollinger_Oversold": "JP_Reversion", "Bollinger_Overbought": "JP_Reversion",
            "RSI_TopDiv": "JP_Reversion", "RSI_BottomDiv": "JP_Reversion",
            "Boll_B_Below": "JP_Reversion", "Boll_B_Above": "JP_Reversion",
            "Williams_Sold": "JP_Reversion", "Williams_Bought": "JP_Reversion",
            "CCI_Sold": "JP_Reversion", "CCI_Bought": "JP_Reversion",
            # Momentum
            "MACD_GoldenCross": "MS_Momentum", "MACD_DeathCross": "MS_Momentum",
            "MACD_Bullish": "MS_Momentum", "MACD_Bearish": "MS_Momentum",
            "MACD_Hist_Expand": "MS_Momentum", "MACD_Hist_Shrink": "MS_Momentum",
            "KDJ_Oversold": "MS_Momentum", "KDJ_Overbought": "MS_Momentum",
            "KDJ_CrossUp": "MS_Momentum", "KDJ_CrossDown": "MS_Momentum",
            "ADX_Strong_Up": "MS_Momentum", "ADX_Strong_Down": "MS_Momentum",
            "TRIX_CrossUp": "MS_Momentum",
            "MoneyFlow_In": "MS_Momentum", "MoneyFlow_Out": "MS_Momentum",
            # Volume
            "Vol_Breakout": "MS_Volume", "Vol_Dump": "MS_Volume",
            "Vol_Buildup": "MS_Volume", "Vol_ThinDown": "MS_Volume",
            "Vol_ThinUp": "MS_Volume", "Vol_MA_Bullish": "MS_Volume",
            "OBV_Bullish": "MS_Volume", "OBV_Divergence": "MS_Volume",
            "Force_Up": "MS_Volume", "Force_Down": "MS_Volume",
            "High_Turnover_Risk": "MS_Volume",
            # Market Context
            "Sector_Money_In": "Market_Context", "Sector_Money_Out": "Market_Context",
            "Sector_Neutral_Up": "Market_Context", "Sector_Neutral_Down": "Market_Context",
            "Market_Hot": "Market_Context", "Market_Cold": "Market_Context",
            "Market_Panic": "Market_Context",
            # Other (使用最低权重)
            "Extreme_Fear": "Market_Context",
            "Extreme_Greed": "Market_Context",
            "Panic_Sell": "Market_Context",
            "FOMO_Climax": "Market_Context",
        }

        score = 0.0
        reasons = []
        n_buy = n_sell = 0

        for s in signals:
            if s.direction not in ("BUY", "SELL"):
                continue
            cat = cat_map.get(s.name, "Market_Context")
            w = self.CATEGORY_WEIGHTS.get(cat, 0.05)
            if s.direction == "BUY":
                score += s.strength * w
                n_buy += 1
            else:
                score -= s.strength * w
                n_sell += 1
            if s.reason:
                reasons.append(s.reason)

        max_w = sum(self.CATEGORY_WEIGHTS.values())
        norm = (score / max_w * 100) if max_w > 0 else 0.0

        # 市场背景调节
        smf = data.get("sector_money_flow")
        mb = data.get("market_breadth")
        ctx_boost = 0.0
        if smf:
            mp = smf.get("main_net_pct", 0) or 0
            ctx_boost += max(-1, min(1, mp / 15))
        if mb:
            ap = mb.get("advance_pct", 50) or 50
            ctx_boost += max(-1, min(1, (ap - 50) / 25))
        ctx_boost = ctx_boost / 2  # -1~1
        norm += ctx_boost * 15
        norm = max(-100.0, min(100.0, norm))

        # 置信度
        n_sig = n_buy + n_sell
        conf = min(1.0, (n_sig / 5) * 0.65) if n_sig > 0 else 0.0

        # 数据不足降置信度
        ti = data.get("indicators")
        if ti is None or (hasattr(ti, '__len__') and len(ti) < 30):
            conf *= 0.5

        if norm >= 18 and conf >= 0.15:
            verdict = "BUY"
        elif norm <= -18 and conf >= 0.15:
            verdict = "SELL"
        else:
            verdict = "HOLD"

        # 去重 reasons
        seen = set()
        unique_reasons = []
        for r in reasons:
            if r not in seen:
                seen.add(r)
                unique_reasons.append(r)

        return round(norm, 1), verdict, unique_reasons, round(conf, 2)

    def list_available_strategies(self) -> List[dict]:
        """列出引擎中可用的所有策略。"""
        return list_strategies()


# ── 快捷入口 ──────────────────────────────────────────────────────────

def quick_assess(engine: AshareEngine, code: str) -> str:
    """一句话评估。"""
    r = SignalEngine(engine).analyze(code)
    name = r.code
    try:
        rt = engine.realtime(code)
        if rt.success and rt.data:
            name = rt.data[0].name
    except Exception:
        pass
    if r.verdict == "BUY":
        return f"{name}({code}): ▲ T买入信号 (评分{r.score:.0f}, 置信{r.confidence:.0%})"
    elif r.verdict == "SELL":
        return f"{name}({code}): ▼ T卖出信号 (评分{r.score:.0f}, 置信{r.confidence:.0%})"
    return f"{name}({code}): ◆ 持有观望 (评分{r.score:.0f})"


def scan_portfolio(engine: AshareEngine) -> pd.DataFrame:
    """扫描持仓组合。"""
    se = SignalEngine(engine)
    try:
        holdings = engine.portfolio.holdings(refresh_prices=True)
    except Exception:
        return pd.DataFrame()

    rows = []
    for h in holdings:
        try:
            r = se.analyze(h.code)
            rows.append({
                "code": h.code, "name": h.name or h.code,
                "cost": h.cost_basis, "price": r.price,
                "pnl_pct": (r.price / h.cost_basis - 1) * 100 if h.cost_basis else 0,
                "verdict": r.verdict, "score": r.score,
                "confidence": r.confidence, "signals": len(r.signals),
                "reasons": "; ".join(r.reasons[:3]),
            })
        except Exception as e:
            logger.warning("扫描 %s 失败: %s", h.code, e)

    if not rows:
        return pd.DataFrame()
    df = pd.DataFrame(rows)
    return df.sort_values("score", key=lambda x: abs(x), ascending=False)


print("✔ signal_engine.py 加载 — 9 策略融合引擎")
