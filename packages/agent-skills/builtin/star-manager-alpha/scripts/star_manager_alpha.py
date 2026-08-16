#!/usr/bin/env python3
"""优秀基金经理持仓重合超额因子。纯 stdlib。按 panels 自适应 full/proxy。"""
from __future__ import annotations

import argparse
import json
import math
import sys
from collections import defaultdict
from typing import Any

SKILL = "star-manager-alpha"


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


def _f(x: Any) -> float | None:
    try:
        v = float(x)
    except (TypeError, ValueError):
        return None
    return v if math.isfinite(v) else None


def _pick_holdings(panels: dict[str, Any]) -> tuple[list[Any] | None, str | None]:
    for key in ("holdings", "fund_holdings", "manager_returns"):
        v = panels.get(key)
        if isinstance(v, list) and v:
            return v, key
    return None, None


def compute(payload: dict[str, Any]) -> dict[str, Any]:
    params = payload.get("params") if isinstance(payload.get("params"), dict) else {}
    allow_proxy = bool(params.get("allow_proxy") or params.get("allow_degraded"))
    panels = payload.get("panels") if isinstance(payload.get("panels"), dict) else {}
    holdings, hkey = _pick_holdings(panels)
    assumptions: list[str] = [
        "方法溯源：优秀基金经理持仓重合/加权作为选股代理；非荐股。",
    ]
    missing_full = ["panels.holdings|fund_holdings|manager_returns"]

    if holdings is not None and hkey is not None:
        agg: dict[str, float] = defaultdict(float)
        cnt: dict[str, int] = defaultdict(int)
        funds: set[str] = set()
        for row in holdings:
            if not isinstance(row, dict):
                continue
            sym = str(row.get("symbol") or "").strip()
            if not sym:
                continue
            w = _f(row.get("weight")) or 0.0
            ex = _f(row.get("excess_ret")) or _f(row.get("ret")) or _f(row.get("value"))
            score = w * (1.0 + (ex if ex is not None else 0.0))
            if hkey == "manager_returns" and w == 0.0 and ex is not None:
                score = float(ex)
            agg[sym] += score
            cnt[sym] += 1
            fid = str(row.get("fund_id") or row.get("fund") or row.get("manager") or "")
            if fid:
                funds.add(fid)
        if not agg:
            return {
                "ok": False, "skill": SKILL, "signal": [], "series": {}, "metrics": {},
                "assumptions": assumptions,
                "errors": [f"panels.{hkey} 无有效 symbol/weight"],
                "meta": _data_meta("insufficient", [f"panels.{hkey}"], missing_full),
            }
        ranked = sorted(agg.items(), key=lambda kv: (-kv[1], kv[0]))
        signal = [
            {"symbol": s, "value": round(v, 8), "fund_hits": cnt[s], "rank": i + 1}
            for i, (s, v) in enumerate(ranked)
        ]
        assumptions.append(f"聚合 panels.{hkey}（{len(funds) or '未知'} 主体）。")
        return {
            "ok": True, "skill": SKILL, "signal": signal,
            "series": {"holdings_score": signal},
            "metrics": {"symbols": len(signal), "funds": len(funds), "sample_note": "示意截面，非实盘"},
            "assumptions": assumptions, "errors": [],
            "meta": _data_meta("full", [f"panels.{hkey}"], []),
        }

    if not allow_proxy:
        return {
            "ok": False, "skill": SKILL, "signal": [], "series": {}, "metrics": {},
            "assumptions": assumptions,
            "errors": [
                "缺少 panels.holdings / fund_holdings / manager_returns；"
                "请导入完整持仓，或设 params.allow_proxy=true 用日K动量代理"
            ],
            "meta": _data_meta("insufficient", [], missing_full),
        }

    bars = payload.get("bars") if isinstance(payload.get("bars"), list) else []
    by: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for b in bars:
        if not isinstance(b, dict):
            continue
        try:
            c = float(b["close"])
        except (KeyError, TypeError, ValueError):
            continue
        if not math.isfinite(c) or c <= 0:
            continue
        by[str(b.get("symbol") or "")].append({"date": str(b.get("date") or ""), "close": c})
    scores: list[tuple[str, float]] = []
    for sym, rows in by.items():
        if not sym or len(rows) < 5:
            continue
        rows = sorted(rows, key=lambda r: r["date"])
        r = rows[-1]["close"] / rows[0]["close"] - 1.0
        if math.isfinite(r):
            scores.append((sym, r))
    if not scores:
        return {
            "ok": False, "skill": SKILL, "signal": [], "series": {}, "metrics": {},
            "assumptions": assumptions,
            "errors": ["无持仓且无有效 bars，无法计算"],
            "meta": _data_meta("insufficient", [], missing_full + ["bars"]),
        }
    assumptions.append("缺基金持仓：已用窗口动量代理（params.allow_proxy）；请尽快导入完整持仓面板。")
    scores.sort(key=lambda x: (-x[1], x[0]))
    signal = [{"symbol": s, "value": round(v, 8), "rank": i + 1} for i, (s, v) in enumerate(scores)]
    return {
        "ok": True, "skill": SKILL, "signal": signal, "series": {"momentum_proxy": signal},
        "metrics": {"symbols": len(signal), "sample_note": "proxy 动量代理"},
        "assumptions": assumptions, "errors": [],
        "meta": _data_meta("proxy", ["bars.daily"], missing_full),
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
            "metrics": {}, "assumptions": [], "errors": [str(e)],
            "meta": _data_meta("insufficient", [], ["valid_input"]),
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
