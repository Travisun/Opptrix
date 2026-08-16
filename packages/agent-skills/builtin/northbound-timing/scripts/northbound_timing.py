#!/usr/bin/env python3
"""北向资金择时：依赖 panels.northbound 纯 stdlib。"""
from __future__ import annotations

import argparse
import json
import math
import sys
from collections import defaultdict
from typing import Any

SKILL = "northbound-timing"



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

def _sma(xs: list[float], n: int) -> list[float | None]:
    out: list[float | None] = [None] * len(xs)
    s = 0.0
    for i, v in enumerate(xs):
        s += v
        if i >= n:
            s -= xs[i - n]
        if i >= n - 1:
            out[i] = s / n
    return out


def _money_flow_rows(panels: dict[str, Any]) -> tuple[list[Any] | None, str | None]:
    for key in ("northbound", "market_money_flow"):
        v = panels.get(key)
        if isinstance(v, list) and v:
            return v, key
    return None, None


def compute(payload: dict[str, Any]) -> dict[str, Any]:
    panels = payload.get("panels") if isinstance(payload.get("panels"), dict) else {}
    nb, nb_key = _money_flow_rows(panels)
    missing = ["panels.northbound", "panels.market_money_flow"]
    if nb is None or nb_key is None:
        return {
            "ok": False,
            "skill": SKILL,
            "signal": [],
            "series": {},
            "metrics": {},
            "assumptions": [],
            "errors": ["缺少 panels.northbound 或 panels.market_money_flow；请由 Agent 写入后再运行，禁止编造"],
            "meta": _data_meta("insufficient", [], missing),
        }
    params = payload.get("params") if isinstance(payload.get("params"), dict) else {}
    ma_n = int(params.get("ma") or 5)
    rows = []
    for r in nb:
        if not isinstance(r, dict):
            continue
        try:
            # net in 亿元 or raw
            v = r.get("net")
            if v is None:
                v = r.get("northbound_net")
            if v is None:
                v = r.get("value")
            net = float(v)
        except (TypeError, ValueError):
            continue
        if not math.isfinite(net):
            continue
        rows.append({"date": str(r.get("date") or ""), "net": net})
    rows.sort(key=lambda x: x["date"])
    if len(rows) < ma_n + 2:
        return {
            "ok": False,
            "skill": SKILL,
            "signal": [],
            "series": {},
            "metrics": {},
            "assumptions": [],
            "errors": [f"panels.{nb_key} 有效点不足（需 >= {ma_n + 2}）"],
            "meta": _data_meta("insufficient", [f"panels.{nb_key}"], missing),
        }
    nets = [r["net"] for r in rows]
    dates = [r["date"] for r in rows]
    ma = _sma(nets, ma_n)
    # Optional index bars for confirmation
    bars = payload.get("bars") if isinstance(payload.get("bars"), list) else []
    close_by_date: dict[str, float] = {}
    for b in bars:
        if isinstance(b, dict) and "close" in b:
            try:
                close_by_date[str(b.get("date", ""))] = float(b["close"])
            except (TypeError, ValueError):
                pass
    signal = []
    last = 0.0
    for i, (d, net, m) in enumerate(zip(dates, nets, ma)):
        if m is None:
            signal.append({"date": d, "value": last, "net": net})
            continue
        # 净流入均线上方且当日净流入>0 → 1；下方且<0 → -1
        if net > 0 and net >= m:
            last = 1.0
        elif net < 0 and net <= m:
            last = -1.0
        else:
            last = 0.0
        row = {"date": d, "value": last, "net": net, "net_ma": m}
        if d in close_by_date:
            row["close"] = close_by_date[d]
        signal.append(row)
    return {
        "ok": True,
        "skill": SKILL,
        "signal": signal,
        "series": {
            "net": [{"date": d, "value": v} for d, v in zip(dates, nets)],
            "net_ma": [{"date": d, "value": v} for d, v in zip(dates, ma) if v is not None],
        },
        "metrics": {
            "points": len(rows),
            "ma": ma_n,
            "last_signal": signal[-1]["value"] if signal else 0.0,
            "last_net": nets[-1],
            "sample_note": "择时状态示意，非实盘胜率",
        },
        "assumptions": [
            f"依赖 Agent 写入的 panels.{nb_key}；脚本不联网、不编造资金流数据。",
            "信号为净流入相对短均线的规则状态。",
        ],
        "errors": [],
        "meta": _data_meta("full", [f"panels.{nb_key}"] + (["bars.daily"] if close_by_date else []), []),
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
