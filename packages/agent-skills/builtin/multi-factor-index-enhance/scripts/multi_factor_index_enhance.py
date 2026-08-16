#!/usr/bin/env python3
"""多因子指数增强：核心加权规则版（无完整风险模型） 纯 stdlib。"""
from __future__ import annotations

import argparse
import json
import math
import sys
from collections import defaultdict
from typing import Any

SKILL = "multi-factor-index-enhance"


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

def _mean(xs: list[float]) -> float:
    return sum(xs) / len(xs) if xs else float("nan")


def _std(xs: list[float]) -> float:
    if len(xs) < 2:
        return float("nan")
    m = _mean(xs)
    var = sum((x - m) ** 2 for x in xs) / (len(xs) - 1)
    return math.sqrt(var) if var > 0 else 0.0


def _zscore_list(xs: list[float]) -> list[float]:
    m, s = _mean(xs), _std(xs)
    if not math.isfinite(s) or s <= 1e-12:
        return [0.0] * len(xs)
    return [(x - m) / s for x in xs]


def _safe_ret(c0: float, c1: float) -> float | None:
    if c0 <= 0 or c1 <= 0:
        return None
    r = c1 / c0 - 1.0
    return r if math.isfinite(r) else None

def _load_bars(payload: dict[str, Any], need: tuple[str, ...] = ("close",)) -> list[dict[str, Any]]:
    bars = payload.get("bars")
    if not isinstance(bars, list) or not bars:
        raise ValueError("input.bars 须为非空数组")
    out: list[dict[str, Any]] = []
    for b in bars:
        if not isinstance(b, dict):
            continue
        row: dict[str, Any] = {
            "date": str(b.get("date") or ""),
            "symbol": str(b.get("symbol") or ""),
        }
        ok = True
        for k in need:
            try:
                v = float(b[k] if k in b else b.get(k))
            except (KeyError, TypeError, ValueError):
                ok = False
                break
            if not math.isfinite(v):
                ok = False
                break
            row[k] = v
        if not ok:
            continue
        if "close" in row and row["close"] <= 0:
            continue
        out.append(row)
    if not out:
        raise ValueError("无有效 bars")
    out.sort(key=lambda r: (r["symbol"], r["date"]))
    return out


def _by_symbol(bars: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    d: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for b in bars:
        d[b["symbol"]].append(b)
    return d


def _mom_vol_factors(rows: list[dict[str, Any]], mom_w: int, vol_w: int) -> dict[str, float] | None:
    if len(rows) < max(mom_w, vol_w) + 1:
        return None
    closes = [r["close"] for r in rows]
    rets: list[float] = []
    for i in range(1, len(closes)):
        rr = _safe_ret(closes[i - 1], closes[i])
        if rr is not None:
            rets.append(rr)
    if len(rets) < max(mom_w, vol_w):
        return None
    mom = sum(rets[-mom_w:])
    vol = _std(rets[-vol_w:])
    if not math.isfinite(vol) or vol <= 0:
        return None
    return {"mom": mom, "inv_vol": 1.0 / vol, "vol": vol}


def compute(payload: dict[str, Any]) -> dict[str, Any]:
    params = payload.get("params") if isinstance(payload.get("params"), dict) else {}
    mom_w = int(params.get("mom_window") or 20)
    vol_w = int(params.get("vol_window") or 20)
    top_n = int(params.get("top_n") or 10)
    max_w = float(params.get("max_weight") or 0.15)
    panels = payload.get("panels") if isinstance(payload.get("panels"), dict) else {}
    assumptions = [
        "核心加权规则版：动量 + 逆波动合成；有 panels.risk_model/cov 时 full，否则 proxy。",
        "权重：截面 zscore 合成后截断归一；非实盘组合指令。",
    ]
    missing_rm = ["panels.risk_model", "panels.cov"]
    has_risk = isinstance(panels.get("risk_model"), (dict, list)) or isinstance(panels.get("cov"), (dict, list))
    # meta finalized after factor source known
    meta: dict[str, Any] = {}

    # Optional external factors: panels.factors = [{symbol, factors:{name:val}}]
    ext = panels.get("factors")
    per_sym: dict[str, dict[str, float]] = {}
    asof = ""
    if isinstance(ext, list) and ext:
        for row in ext:
            if not isinstance(row, dict):
                continue
            sym = str(row.get("symbol") or "")
            fac = row.get("factors") if isinstance(row.get("factors"), dict) else {}
            if not sym or not fac:
                continue
            per_sym[sym] = {str(k): float(v) for k, v in fac.items() if isinstance(v, (int, float)) and math.isfinite(float(v))}
            asof = str(row.get("date") or asof)
        assumptions.append("使用 panels.factors 外部因子面板。")
        meta = _data_meta("full", ["panels.factors"] + (["panels.risk_model|cov"] if has_risk else []), [] if has_risk else missing_rm, reason=None if has_risk else "no_full_risk_model")
        if not has_risk:
            meta = _data_meta("proxy", ["panels.factors"], missing_rm, reason="no_full_risk_model")
    else:
        bars = _load_bars(payload, ("close",))
        by = _by_symbol(bars)
        for sym, rows in by.items():
            f = _mom_vol_factors(rows, mom_w, vol_w)
            if f:
                per_sym[sym] = {"mom": f["mom"], "inv_vol": f["inv_vol"]}
                asof = rows[-1]["date"]
        assumptions.append(f"由日 K 构造 mom({mom_w}) 与 inv_vol({vol_w})。")
        meta = (
            _data_meta("full", ["bars.daily", "panels.risk_model|cov"], [])
            if has_risk else
            _data_meta("proxy", ["bars.daily"], missing_rm, reason="no_full_risk_model")
        )

    if len(per_sym) < 2:
        raise ValueError("有效标的不足（需 >=2）")

    # Equal-weight zscore across available factor names
    names: set[str] = set()
    for f in per_sym.values():
        names |= set(f.keys())
    names_l = sorted(names)
    scores: dict[str, float] = {s: 0.0 for s in per_sym}
    for name in names_l:
        vals = [per_sym[s].get(name) for s in per_sym]
        present = [(s, v) for s, v in zip(per_sym.keys(), vals) if v is not None]
        if len(present) < 2:
            continue
        zs = _zscore_list([v for _, v in present])
        for (s, _), z in zip(present, zs):
            scores[s] += z
    # Rank and allocate
    ranked = sorted(scores.items(), key=lambda x: -x[1])
    pick = ranked[: max(1, min(top_n, len(ranked)))]
    # Softmax-like positive scores → weights with cap
    raw = [max(0.0, sc) for _, sc in pick]
    if sum(raw) <= 0:
        raw = [1.0] * len(pick)
    ssum = sum(raw)
    weights = [min(max_w, r / ssum) for r in raw]
    wsum = sum(weights)
    weights = [w / wsum for w in weights] if wsum > 0 else [1.0 / len(pick)] * len(pick)

    signal = []
    for i, ((sym, sc), w) in enumerate(zip(pick, weights), start=1):
        signal.append({
            "symbol": sym,
            "date": asof,
            "value": round(sc, 8),
            "weight": round(w, 8),
            "rank": i,
            "factors": {k: round(v, 8) for k, v in per_sym[sym].items()},
        })
    # Benchmark equal weight note
    eq = 1.0 / len(signal) if signal else 0.0
    metrics = {
        "universe": len(per_sym),
        "selected": len(signal),
        "top_n": top_n,
        "max_weight": max_w,
        "equal_weight_ref": round(eq, 8),
        "factor_names": names_l,
        "sample_note": "示意加权，非完整指数增强回测",
    }
    return {
        "ok": True,
        "skill": SKILL,
        "signal": signal,
        "series": {"weights": signal},
        "metrics": metrics,
        "assumptions": assumptions,
        "errors": [],
        "meta": meta,
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
