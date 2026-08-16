#!/usr/bin/env python3
"""企业生命周期分类 + 简单因子 纯 stdlib。"""
from __future__ import annotations

import argparse
import json
import math
import sys
from collections import defaultdict
from typing import Any

SKILL = "firm-life-cycle"

def _mean(xs: list[float]) -> float:
    return sum(xs) / len(xs) if xs else float("nan")


def _std(xs: list[float]) -> float:
    if len(xs) < 2:
        return float("nan")
    m = _mean(xs)
    var = sum((x - m) ** 2 for x in xs) / (len(xs) - 1)
    return math.sqrt(var) if var > 0 else 0.0


def _safe_ret(c0: float, c1: float) -> float | None:
    if c0 <= 0 or c1 <= 0:
        return None
    r = c1 / c0 - 1.0
    return r if math.isfinite(r) else None


def _classify(row: dict[str, Any]) -> str:
    """Dickinson 风格现金流符号分类（简化）。"""
    ocf = row.get("ocf")
    icf = row.get("icf")
    fcf = row.get("fcf")
    # Also accept Chinese-ish aliases from panels
    if ocf is None:
        ocf = row.get("net_operate_cash_flow")
    if icf is None:
        icf = row.get("net_invest_cash_flow")
    if fcf is None:
        fcf = row.get("net_finance_cash_flow")
    try:
        o = float(ocf) if ocf is not None else None
        i = float(icf) if icf is not None else None
        f = float(fcf) if fcf is not None else None
    except (TypeError, ValueError):
        return "unknown"
    if o is None or i is None or f is None:
        # Fallback: growth vs mature by revenue growth + roe
        g = row.get("revenue_growth")
        roe = row.get("roe")
        try:
            gg = float(g) if g is not None else None
            rr = float(roe) if roe is not None else None
        except (TypeError, ValueError):
            return "unknown"
        if gg is not None and rr is not None:
            if gg > 0.2 and rr < 0.12:
                return "introduction"
            if gg > 0.1:
                return "growth"
            if gg > -0.05 and rr >= 0.08:
                return "mature"
            if gg <= -0.05:
                return "decline"
            return "shakeout"
        return "unknown"
    # Dickinson 风格符号组合（折叠为 5 类）
    so, si, sf = o > 0, i > 0, f > 0
    if (not so) and (not si) and sf:
        return "introduction"
    if (not so) and si:
        return "introduction"
    if so and (not si) and sf:
        return "growth"
    if so and (not si) and (not sf):
        return "mature"
    if so and si:
        return "shakeout"
    if (not so) and (not si) and (not sf):
        return "decline"
    return "shakeout"


def _simple_factor(row: dict[str, Any], stage: str) -> float:
    """Stage-conditioned simple score from available fundamentals."""
    score = 0.0
    n = 0
    for k, w in (("roe", 1.0), ("roa", 0.8), ("revenue_growth", 0.6), ("gross_margin", 0.5)):
        v = row.get(k)
        if isinstance(v, (int, float)) and math.isfinite(float(v)):
            score += w * float(v)
            n += 1
    if n == 0:
        return 0.0
    base = score / n
    # Prefer growth names in growth stage etc. (schematic tilt)
    tilt = {
        "introduction": 0.05,
        "growth": 0.1,
        "mature": 0.0,
        "shakeout": -0.05,
        "decline": -0.1,
        "unknown": 0.0,
    }.get(stage, 0.0)
    return base + tilt


def compute(payload: dict[str, Any]) -> dict[str, Any]:
    panels = payload.get("panels") if isinstance(payload.get("panels"), dict) else {}
    fins = panels.get("financials") or panels.get("life_cycle") or []
    if not isinstance(fins, list) or not fins:
        raise ValueError("需要 panels.financials（含现金流或成长/ROE 字段）")
    ranking = []
    stage_counts: dict[str, int] = defaultdict(int)
    for row in fins:
        if not isinstance(row, dict):
            continue
        sym = str(row.get("symbol") or "")
        if not sym:
            continue
        stage = _classify(row)
        stage_counts[stage] += 1
        val = _simple_factor(row, stage)
        ranking.append({
            "symbol": sym,
            "date": str(row.get("report_date") or row.get("date") or ""),
            "value": round(val, 8),
            "life_cycle": stage,
        })
    if not ranking:
        raise ValueError("无有效财务行")
    ranking.sort(key=lambda x: -x["value"])
    for i, r in enumerate(ranking, start=1):
        r["rank"] = i
    return {
        "ok": True,
        "skill": SKILL,
        "signal": ranking,
        "series": {"by_stage": dict(stage_counts)},
        "metrics": {"universe": len(ranking), "stages": dict(stage_counts)},
        "assumptions": [
            "Dickinson 现金流符号生命周期分类简化；缺现金流时用收入增速+ROE 代理。",
            "因子为阶段倾斜的基本面示意分，非完整研报复现。",
        ],
        "errors": [],
        "meta": {"degraded": False},
    }

def main() -> int:
    ap = argparse.ArgumentParser(description=SKILL)
    ap.add_argument("--input", required=True)
    ap.add_argument("--output")
    args = ap.parse_args()
    try:
        with open(args.input, encoding="utf-8") as f:
            payload = json.load(f)
        if not isinstance(payload, dict):
            raise ValueError("input 须为 JSON 对象")
        result = compute(payload)
    except Exception as e:
        result = {
            "ok": False,
            "skill": SKILL,
            "signal": [],
            "series": {},
            "metrics": {},
            "assumptions": [],
            "errors": [str(e)],
            "meta": {},
        }
        print(json.dumps(result, ensure_ascii=False), file=sys.stderr)
        if args.output:
            with open(args.output, "w", encoding="utf-8") as f:
                json.dump(result, f, ensure_ascii=False, indent=2)
                f.write("\n")
        return 1
    text = json.dumps(result, ensure_ascii=False, indent=2)
    if args.output:
        with open(args.output, "w", encoding="utf-8") as f:
            f.write(text)
            f.write("\n")
    print(text)
    return 0 if result.get("ok") else 1


if __name__ == "__main__":
    raise SystemExit(main())
