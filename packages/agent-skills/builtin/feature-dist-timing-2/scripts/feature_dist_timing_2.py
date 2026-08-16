#!/usr/bin/env python3
"""特征分布择时系列二：成交量极端→偏空。纯 stdlib。"""
from __future__ import annotations

import argparse
import json
import math
import sys
from collections import defaultdict
from typing import Any

SKILL = "feature-dist-timing-2"

VOL_NAMES = {"volume", "feature_volume", "turnover", "amt", "amount_feat"}


def _percentile(xs: list[float], p: float) -> float:
    if not xs:
        return float("nan")
    ys = sorted(xs)
    k = (len(ys) - 1) * p
    f = math.floor(k)
    c = math.ceil(k)
    if f == c:
        return ys[int(k)]
    return ys[f] * (c - k) + ys[c] * (k - f)


def compute(payload: dict[str, Any]) -> dict[str, Any]:
    params = payload.get("params") if isinstance(payload.get("params"), dict) else {}
    window = int(params.get("window") or 60)
    hi = float(params.get("hi_pct") or 0.9)
    lo = float(params.get("lo_pct") or 0.1)
    symmetrical = bool(params.get("symmetrical"))
    feature = str(params.get("feature") or "")
    panels = payload.get("panels") if isinstance(payload.get("panels"), dict) else {}
    rows = panels.get("features")
    if not isinstance(rows, list) or not rows:
        return {
            "ok": False, "skill": SKILL, "signal": [], "series": {}, "metrics": {},
            "assumptions": [], "errors": ["缺少 panels.features（建议成交量类）"], "meta": {},
        }
    by: dict[str, list[tuple[str, float]]] = defaultdict(list)
    for r in rows:
        if not isinstance(r, dict):
            continue
        name = str(r.get("name") or r.get("feature") or "")
        if feature:
            if name != feature:
                continue
        elif name.lower() not in VOL_NAMES and name not in VOL_NAMES:
            # if no volume-like names at all, still accept if only one feature family
            pass
        try:
            v = float(r["value"])
        except (KeyError, TypeError, ValueError):
            continue
        if not math.isfinite(v):
            continue
        by[name or "volume"].append((str(r.get("date") or ""), v))

    # prefer volume-like
    if not feature:
        vol_keys = [k for k in by if k.lower() in VOL_NAMES or k in VOL_NAMES]
        if vol_keys:
            by = {k: by[k] for k in vol_keys}

    assumptions = [
        "系列二：成交量特征极端高分位→偏空（物极必反）；与系列一通用分位多空不同。",
    ]
    signal: list[dict[str, Any]] = []
    series: dict[str, Any] = {}
    for name, seq in by.items():
        seq = sorted(seq, key=lambda x: x[0])
        out: list[dict[str, Any]] = []
        for i in range(len(seq)):
            if i + 1 < max(10, window // 2):
                continue
            start = max(0, i + 1 - window)
            hist = [seq[j][1] for j in range(start, i)]
            if len(hist) < 5:
                continue
            ph, pl = _percentile(hist, hi), _percentile(hist, lo)
            cur = seq[i][1]
            if cur >= ph:
                state = -1  # 物极必反偏空
            elif symmetrical and cur <= pl:
                state = 1
            else:
                state = 0
            out.append({"date": seq[i][0], "name": name, "value": state, "feature": cur,
                        "hi": round(ph, 8), "lo": round(pl, 8)})
        series[name] = out
        if out:
            signal.append(out[-1])
    if not signal:
        return {
            "ok": False, "skill": SKILL, "signal": [], "series": series, "metrics": {},
            "assumptions": assumptions, "errors": ["成交量特征序列过短或未提供"], "meta": {},
        }
    return {
        "ok": True, "skill": SKILL, "signal": signal, "series": series,
        "metrics": {"window": window, "hi_pct": hi, "symmetrical": symmetrical, "features": len(by)},
        "assumptions": assumptions, "errors": [], "meta": {"degraded": False},
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
