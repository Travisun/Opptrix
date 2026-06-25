"""
Reports — T 策略分析报告生成
=================================
"""
from __future__ import annotations

from typing import Dict, Any, Optional

from a_stock_layer import AshareEngine

from ..signal_engine import SignalEngine
from ..strategies import list_strategies


def generate(code: str, engine: AshareEngine, verbose: bool = True) -> str:
    """生成一份完整的 T 策略分析报告。"""
    se = SignalEngine(engine)
    r = se.analyze(code, return_full=True)
    name = r.code
    try:
        rt = engine.realtime(code)
        if rt.success and rt.data:
            name = rt.data[0].name
    except Exception:
        pass

    lines = [
        "=" * 58,
        f"  {name} ({code}) — T 策略全分析报告",
        f"  当前价: {r.price}  |  综合评分: {r.score:.0f}/100",
        f"  决策: {r.verdict}  |  置信度: {r.confidence:.0%}",
        "=" * 58,
    ]

    # 策略一览
    strat_info = list_strategies()
    lines.append(f"\n📋 已加载 {len(strat_info)} 个策略:")
    for s in strat_info:
        lines.append(f"  • {s['desc']}")

    # 信号详情
    lines.append(f"\n📡 检测到 {len(r.signals)} 个信号:")
    dir_map = {"BUY": "▲ BUY", "SELL": "▼ SELL", "HOLD": "◆ HOLD"}
    for s in r.signals:
        d = dir_map.get(s.direction, s.direction)
        lines.append(f"  [{d:8s}] [{s.source:22s}] {s.reason}")

    # 技术位
    try:
        from ..data import fetch_kline
        from ..indicators import compute_all, bollinger, ma
        kd = fetch_kline(engine, code, "daily", 60)
        if kd is not None and len(kd) >= 20:
            ti = compute_all(kd)
            last = ti.iloc[-1]
            lines.append(f"\n📊 关键技术位:")
            for col, label in [("ma5","MA5"),("ma10","MA10"),("ma20","MA20"),
                               ("ma60","MA60"),("boll_up","Boll上轨"),
                               ("boll_mid","Boll中轨"),("boll_low","Boll下轨")]:
                v = last.get(col)
                if v is not None and not (isinstance(v, float) and np.isnan(v)):
                    lines.append(f"  {label:>8s}: {v:>8.1f}")
            # 30日高低
            lines.append(f"  {'30日高':>8s}: {kd['high'].tail(30).max():>8.1f}")
            lines.append(f"  {'30日低':>8s}: {kd['low'].tail(30).min():>8.1f}")
    except Exception:
        pass

    # 操作建议
    if r.verdict != "HOLD":
        action = "加仓 T 买入" if r.verdict == "BUY" else "减仓 T 卖出"
        lines.append(f"\n💡 操作建议: {action}")
        try:
            kd = fetch_kline(engine, code, "daily", 60)
            if kd is not None:
                ti = compute_all(kd)
                last = ti.iloc[-1]
                bl = last.get("boll_low")
                bm = last.get("boll_mid")
                bu = last.get("boll_up")
                ma20 = last.get("ma20")
                if r.verdict == "BUY" and bl is not None and bm is not None:
                    lines.append(f"    买入区间: {bl:.1f} ~ {bm:.1f}")
                if r.verdict == "SELL" and bm is not None and bu is not None:
                    lines.append(f"    卖出区间: {bm:.1f} ~ {bu:.1f}")
        except Exception:
            pass
    else:
        lines.append(f"\n💡 操作建议: 持有观望，等待明确信号")

    return "\n".join(lines)


def strategy_summary() -> str:
    """列出所有可用策略的摘要。"""
    lines = ["可用的 T 策略:"]
    for s in list_strategies():
        lines.append(f"  • {s['name']:20s} — {s['desc']}")
    return "\n".join(lines)


print("  ✔ reports")
