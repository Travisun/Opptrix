#!/usr/bin/env python3
"""基金相对基准超配因子。纯 stdlib。"""
from __future__ import annotations

import argparse
import json
import math
import sys
from collections import defaultdict
from typing import Any

SKILL = "fund-overweight-factor"



def _data_meta(data_mode: str, used: list[str], missing: list[str] | None = None, **extra: Any) -> dict[str, Any]:
    mode = data_mode if data_mode in ("full", "proxy", "insufficient") else "proxy"
    out: dict[str, Any] = {
        "data_mode": mode,
        "degraded": mode == "proxy",
        "used_inputs": list(used),
        "missing_for_full": list(missing or []),
    }
    out.update(extra)
    return out

def _wmap(rows: list[Any], sym_key: str = "symbol") -> dict[str, float]:
    out: dict[str, float] = defaultdict(float)
    for r in rows:
        if not isinstance(r, dict):
            continue
        sym = str(r.get(sym_key) or "").strip()
        if not sym:
            continue
        try:
            w = float(r.get("weight"))
        except (TypeError, ValueError):
            continue
        if math.isfinite(w):
            out[sym] += w
    return dict(out)


def compute(payload: dict[str, Any]) -> dict[str, Any]:
    panels = payload.get("panels") if isinstance(payload.get("panels"), dict) else {}
    fh = panels.get("fund_holdings") or panels.get("holdings")
    bw = panels.get("benchmark_weights") or panels.get("benchmark")
    if not isinstance(fh, list) or not fh:
        return {
            "ok": False, "skill": SKILL, "signal": [], "series": {}, "metrics": {},
            "assumptions": [], "errors": ["缺少 panels.fund_holdings"], "meta": _data_meta("insufficient", [], ["panels.fund_holdings", "panels.benchmark_weights"]),
        }
    if not isinstance(bw, list) or not bw:
        return {
            "ok": False, "skill": SKILL, "signal": [], "series": {}, "metrics": {},
            "assumptions": [], "errors": ["缺少 panels.benchmark_weights"], "meta": _data_meta("insufficient", ["panels.fund_holdings"], ["panels.benchmark_weights"]),
        }
    # average fund weight across funds
    by_fund: dict[str, dict[str, float]] = defaultdict(lambda: defaultdict(float))
    for r in fh:
        if not isinstance(r, dict):
            continue
        fid = str(r.get("fund_id") or r.get("fund") or "F")
        sym = str(r.get("symbol") or "").strip()
        if not sym:
            continue
        try:
            w = float(r.get("weight"))
        except (TypeError, ValueError):
            continue
        if math.isfinite(w):
            by_fund[fid][sym] += w
    if not by_fund:
        return {
            "ok": False, "skill": SKILL, "signal": [], "series": {}, "metrics": {},
            "assumptions": [], "errors": ["fund_holdings 无有效权重"], "meta": _data_meta("insufficient", ["panels.fund_holdings"], ["valid_weights"]),
        }
    avg: dict[str, float] = defaultdict(float)
    for fm in by_fund.values():
        for s, w in fm.items():
            avg[s] += w
    n_f = len(by_fund)
    for s in list(avg.keys()):
        avg[s] /= n_f
    bench = _wmap(bw)
    scores: list[dict[str, Any]] = []
    for sym in set(avg) | set(bench):
        ow = avg.get(sym, 0.0) - bench.get(sym, 0.0)
        scores.append({
            "symbol": sym, "value": round(ow, 8),
            "fund_weight": round(avg.get(sym, 0.0), 8),
            "bench_weight": round(bench.get(sym, 0.0), 8),
        })
    scores.sort(key=lambda x: (-x["value"], x["symbol"]))
    for i, s in enumerate(scores, 1):
        s["rank"] = i
    return {
        "ok": True, "skill": SKILL, "signal": scores, "series": {"overweight": scores},
        "metrics": {"funds": n_f, "symbols": len(scores)},
        "assumptions": ["超配=基金平均权重−基准权重；非增强组合优化。"],
        "errors": [], "meta": _data_meta("full", ["panels.fund_holdings", "panels.benchmark_weights"], []),
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
            "ok": False, "skill": SKILL, "signal": [], "series": {},
            "metrics": {}, "assumptions": [], "errors": [str(e)], "meta": {},
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
