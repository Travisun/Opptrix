#!/usr/bin/env python3
"""高频价量 CPV：Corr(ret, dlogvol)。分钟→full，日频→proxy。"""
from __future__ import annotations

import argparse
import json
import math
import sys
from collections import defaultdict
from typing import Any

SKILL = "hf-cpv-factor"



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

def _corr(xs: list[float], ys: list[float]) -> float | None:
    n = len(xs)
    if n < 5 or len(ys) != n:
        return None
    mx, my = sum(xs) / n, sum(ys) / n
    num = sum((x - mx) * (y - my) for x, y in zip(xs, ys))
    dx = math.sqrt(sum((x - mx) ** 2 for x in xs))
    dy = math.sqrt(sum((y - my) ** 2 for y in ys))
    if dx <= 1e-12 or dy <= 1e-12:
        return None
    return num / (dx * dy)


def _series_cpv(rows: list[dict[str, Any]], price_key: str = "close") -> float | None:
    rows = sorted(rows, key=lambda r: r.get("datetime") or r.get("date") or "")
    rets: list[float] = []
    dvols: list[float] = []
    for i in range(1, len(rows)):
        try:
            c0 = float(rows[i - 1][price_key])
            c1 = float(rows[i][price_key])
            v0 = float(rows[i - 1].get("volume") or 0)
            v1 = float(rows[i].get("volume") or 0)
        except (KeyError, TypeError, ValueError):
            continue
        if c0 <= 0 or c1 <= 0:
            continue
        rets.append(math.log(c1 / c0))
        dvols.append(math.log1p(v1) - math.log1p(v0))
    return _corr(rets, dvols)


def _looks_minute(rows: list[dict[str, Any]]) -> bool:
    n = 0
    for r in rows[:50]:
        dt = str(r.get("datetime") or r.get("date") or "")
        if (" " in dt) or ("T" in dt) or (":" in dt):
            n += 1
    return n >= max(3, len(rows[:50]) // 2)


def compute(payload: dict[str, Any]) -> dict[str, Any]:
    panels = payload.get("panels") if isinstance(payload.get("panels"), dict) else {}
    minute = panels.get("minute_bars") or panels.get("bars_1m")
    assumptions = ["CPV = Corr(log收益, Δlog成交量)；截面按相关降序。"]
    by: dict[str, list[dict[str, Any]]] = defaultdict(list)
    used: list[str] = []
    missing = ["panels.minute_bars", "bars.minute"]
    data_mode = "proxy"

    if isinstance(minute, list) and minute:
        for b in minute:
            if isinstance(b, dict) and b.get("symbol"):
                by[str(b["symbol"])].append(b)
        used = ["panels.minute_bars"]
        data_mode = "full"
        missing = []
        assumptions.append("使用 panels.minute_bars。")
    else:
        bars = payload.get("bars") if isinstance(payload.get("bars"), list) else []
        for b in bars:
            if isinstance(b, dict) and b.get("symbol"):
                by[str(b["symbol"])].append(b)
        flat = [b for rows in by.values() for b in rows]
        if flat and _looks_minute(flat):
            used = ["bars.minute"]
            data_mode = "full"
            missing = ["panels.minute_bars"]
            assumptions.append("bars 判定为分钟频，走完整 CPV。")
        else:
            used = ["bars.daily"]
            data_mode = "proxy"
            assumptions.append("无分钟线：日频价量相关代理。")

    scores: list[dict[str, Any]] = []
    for sym, rows in by.items():
        v = _series_cpv(rows)
        if v is None:
            continue
        scores.append({"symbol": sym, "value": round(v, 8)})
    if not scores:
        return {
            "ok": False, "skill": SKILL, "signal": [], "series": {}, "metrics": {},
            "assumptions": assumptions,
            "errors": ["无法计算 CPV：样本过短或无有效价量"],
            "meta": _data_meta("insufficient", used, missing),
        }
    scores.sort(key=lambda x: (-x["value"], x["symbol"]))
    for i, s in enumerate(scores, 1):
        s["rank"] = i
    return {
        "ok": True, "skill": SKILL, "signal": scores, "series": {"cpv": scores},
        "metrics": {"symbols": len(scores), "sample_note": "示意相关"},
        "assumptions": assumptions, "errors": [],
        "meta": _data_meta(data_mode, used, missing),
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
