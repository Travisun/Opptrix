"""
Anomaly Strategy — 市场异象 & 事件驱动
========================================
来源: Jegadeesh (短期反转), Sloan (应计异象), 事件驱动研究

核心逻辑:
- 短期反转 (1月跌幅最大 → 反弹)
- 净利润断层 (业绩超预期跳空)
- 股东增减持事件
- 限售解禁风险
- 股权质押风险
- 龙虎榜机构交易
- 高管增持信号
"""
from __future__ import annotations

from typing import Any, Dict, List

from ..base import BaseStrategy, Signal


class AnomalyStrategy(BaseStrategy):
    """市场异象 + 事件驱动 — 利用统计规律和事件"""

    NAME = "anomaly"
    DISPLAY_NAME = "市场异象 + 事件驱动"
    SOURCE = "Jegadeesh + 事件研究"
    WEIGHT = 0.10

    def analyze(self, data: Dict[str, Any]) -> List[Signal]:
        signals = []
        ti = data.get("indicators")
        price = data.get("price")
        chg = data.get("change_pct", 0) or 0

        if ti is None or price is None:
            return signals

        last = ti.iloc[-1] if hasattr(ti, 'iloc') else ti

        # ── 短期反转 (1月跌超15% → 反弹概率) ───────────────
        roc_val = last.get("roc")
        if roc_val is not None and roc_val < -15:
            signals.append(Signal("ShortTerm_Reversal", "BUY", 0.35, self.SOURCE,
                f"20日跌幅{abs(roc_val):.0f}% > 15%, 短期反转概率上升"))

        # ── 超跌反弹 (连续多日下跌) ─────────────────────────
        consecutive_down = 0
        kd = data.get("kline_daily")
        if kd is not None and len(kd) >= 5:
            closes = kd["close"].values.astype(float)
            for i in range(-1, -6, -1):
                if i >= -len(closes) and closes[i] < closes[i - 1]:
                    consecutive_down += 1
                else:
                    break
            if consecutive_down >= 3:
                signals.append(Signal("Consecutive_Down", "BUY", 0.30, self.SOURCE,
                    f"连跌{consecutive_down}日, 超跌反弹预期"))

        # ── 业绩预告 (需要外部数据源配合) ─────────────────
        # 通过 engine 获取
        try:
            from a_stock_layer import AshareEngine
            engine = data.get("_engine")
            if engine:
                pf = engine.perf_forecast(data["code"])
                if pf.success and pf.data:
                    forecast = pf.data[0]
                    ftype = forecast.forecast_type
                    if "预增" in ftype:
                        signals.append(Signal("Perf_Forecast_Pos", "BUY", 0.35, self.SOURCE,
                            f"业绩预增: {ftype}"))
                    elif "预减" in ftype or "首亏" in ftype:
                        signals.append(Signal("Perf_Forecast_Neg", "SELL", 0.50, self.SOURCE,
                            f"业绩预警: {ftype}"))
        except Exception:
            pass

        # ── 限售解禁提醒 ──────────────────────────────────
        try:
            engine = data.get("_engine")
            if engine:
                le = engine.lockup_expiry(data["code"])
                if le.success and le.data:
                    for item in le.data[:3]:
                        signals.append(Signal("Lockup_Expiry", "SELL", 0.40, self.SOURCE,
                            f"限售解禁: {item.date} {item.shares_unlock/1e4:.0f}万股"))
        except Exception:
            pass

        # ── 大宗交易折溢价 ──────────────────────────────
        try:
            engine = data.get("_engine")
            if engine:
                bt = engine.block_trade(data["code"])
                if bt.success and bt.data:
                    for item in bt.data[:3]:
                        if hasattr(item, 'premium_discount') and item.premium_discount is not None:
                            if item.premium_discount > 0:
                                signals.append(Signal("BlockTrade_Premium", "BUY", 0.25, self.SOURCE,
                                    f"大宗溢价{item.premium_discount:.1f}%"))
                            elif item.premium_discount < -5:
                                signals.append(Signal("BlockTrade_Discount", "SELL", 0.30, self.SOURCE,
                                    f"大宗折价{abs(item.premium_discount):.1f}%"))
        except Exception:
            pass

        return signals

print("  ✔ AnomalyStrategy")
