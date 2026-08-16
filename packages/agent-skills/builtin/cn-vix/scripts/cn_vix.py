#!/usr/bin/env python3
"""中国版 VIX：有期权/IV 走 full；否则已实现波动 proxy。纯 stdlib。"""
from __future__ import annotations

import argparse
import json
import math
import sys
from typing import Any

SKILL = "cn-vix"


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


def _pick_bars(payload: dict[str, Any]) -> list[dict[str, Any]]:
    bars = payload.get("bars")
    if not isinstance(bars, list):
        return []
    params = payload.get("params") if isinstance(payload.get("params"), dict) else {}
    symbol = params.get("symbol")
    rows = [b for b in bars if isinstance(b, dict)]
    if symbol:
        f = [b for b in rows if str(b.get("symbol", "")) == str(symbol)]
        if f:
            rows = f
    out = []
    for b in rows:
        try:
            c = float(b["close"])
        except (KeyError, TypeError, ValueError):
            continue
        if c <= 0 or not math.isfinite(c):
            continue
        out.append({"date": str(b.get("date") or ""), "symbol": str(b.get("symbol") or ""), "close": c})
    out.sort(key=lambda r: r["date"])
    return out


def _realized_vol_series(close: list[float], window: int) -> list[float | None]:
    rets = []
    for i in range(1, len(close)):
        rets.append(math.log(close[i] / close[i - 1]))
    out: list[float | None] = [None] * len(close)
    for i in range(1, len(close)):
        j = i - 1
        if j + 1 < window:
            continue
        chunk = rets[j + 1 - window : j + 1]
        m = sum(chunk) / window
        var = sum((x - m) ** 2 for x in chunk) / max(window - 1, 1)
        out[i] = math.sqrt(var) * math.sqrt(252.0) * 100.0
    return out


def _pick_option_panel(panels: dict[str, Any]) -> tuple[list[Any] | None, str | None]:
    for key in ("options", "option_chain", "iv"):
        v = panels.get(key)
        if isinstance(v, list) and len(v) >= 3:
            return v, key
    return None, None


def _iv_to_cvix(rows: list[Any]) -> float | None:
    """Aggregate implied vol rows into a VIX-like level (percent)."""
    ivs: list[float] = []
    for r in rows:
        if not isinstance(r, dict):
            continue
        for k in ("iv", "implied_vol", "value", "cvix", "vix"):
            if k not in r:
                continue
            try:
                v = float(r[k])
            except (TypeError, ValueError):
                continue
            if not math.isfinite(v) or v <= 0:
                continue
            # normalize: if <= 3 treat as decimal vol
            ivs.append(v * 100.0 if v <= 3.0 else v)
            break
    if len(ivs) < 3:
        return None
    ivs.sort()
    mid = ivs[len(ivs) // 2]
    return mid


def compute(payload: dict[str, Any]) -> dict[str, Any]:
    params = payload.get("params") if isinstance(payload.get("params"), dict) else {}
    window = int(params.get("window") or 20)
    panels = payload.get("panels") if isinstance(payload.get("panels"), dict) else {}
    opt_rows, opt_key = _pick_option_panel(panels)
    missing_full = ["panels.options|option_chain|iv"]

    # Prefer full path from option/IV panel
    if opt_rows is not None and opt_key is not None:
        # Build date-aligned series if rows have dates; else single-level expand via bars dates
        by_date: dict[str, list[Any]] = {}
        for r in opt_rows:
            if not isinstance(r, dict):
                continue
            d = str(r.get("date") or r.get("asof") or "")
            by_date.setdefault(d or "_", []).append(r)

        bars = _pick_bars(payload)
        dates = [b["date"] for b in bars] if bars else sorted(d for d in by_date if d != "_")
        sym = bars[0]["symbol"] if bars else "CVIX"
        cvix: list[float | None] = []
        use_dates: list[str] = []
        if len(by_date) >= 2 and any(d != "_" for d in by_date):
            for d in sorted(d for d in by_date if d and d != "_"):
                lvl = _iv_to_cvix(by_date[d])
                if lvl is None:
                    continue
                use_dates.append(d)
                cvix.append(lvl)
        else:
            lvl = _iv_to_cvix(opt_rows)
            if lvl is None:
                return {
                    "ok": False, "skill": SKILL, "signal": [], "series": {}, "metrics": {},
                    "assumptions": [],
                    "errors": [f"panels.{opt_key} 缺少可用 iv/implied_vol 字段"],
                    "meta": _data_meta("insufficient", [f"panels.{opt_key}"], missing_full),
                }
            if not dates:
                dates = ["asof"]
            use_dates = dates
            cvix = [lvl] * len(dates)

        # z-score signal on IV series
        zwin = int(params.get("z_window") or 60)
        signal = []
        zseries = []
        for i, v in enumerate(cvix):
            if v is None:
                continue
            start = max(0, i - zwin + 1)
            chunk = [x for x in cvix[start : i + 1] if x is not None]
            if len(chunk) < max(3, min(5, zwin // 4)):
                # still emit level with neutral signal when series short
                signal.append({"date": use_dates[i], "symbol": sym, "value": 0.0, "cvix": round(v, 4)})
                continue
            m = sum(chunk) / len(chunk)
            sd = math.sqrt(sum((x - m) ** 2 for x in chunk) / max(len(chunk) - 1, 1))
            z = 0.0 if sd <= 0 else (v - m) / sd
            val = -1.0 if z >= 1.0 else (1.0 if z <= -1.0 else 0.0)
            signal.append({"date": use_dates[i], "symbol": sym, "value": val, "cvix": round(v, 4)})
            zseries.append({"date": use_dates[i], "value": round(z, 6)})
        last_cvix = next((v for v in reversed(cvix) if v is not None), None)
        return {
            "ok": True,
            "skill": SKILL,
            "signal": signal,
            "series": {
                "cvix": [{"date": use_dates[i], "value": round(v, 6)} for i, v in enumerate(cvix) if v is not None],
                "cvix_z": zseries,
            },
            "metrics": {
                "bars": len(use_dates),
                "symbol": sym,
                "window": window,
                "last_cvix": None if last_cvix is None else round(last_cvix, 4),
                "last_signal": signal[-1]["value"] if signal else None,
                "options_rows": len(opt_rows),
                "option_panel": opt_key,
            },
            "assumptions": [
                f"使用 panels.{opt_key} 的隐含波动合成 CVIX 水平（中位数聚合）。",
                "信号：CVIX z≥1 → -1；z≤-1 → +1；否则 0。非交易指令。",
            ],
            "errors": [],
            "meta": _data_meta("full", [f"panels.{opt_key}"] + (["bars.daily"] if bars else []), []),
        }

    # Proxy: realized vol
    bars = _pick_bars(payload)
    if len(bars) < window + 2:
        return {
            "ok": False,
            "skill": SKILL,
            "signal": [],
            "series": {},
            "metrics": {},
            "assumptions": [],
            "errors": [
                f"缺少 panels.options/option_chain/iv，且有效日 K 不足（需 >= {window + 2}）"
            ],
            "meta": _data_meta("insufficient", [], missing_full + ["bars.daily"]),
        }

    dates = [b["date"] for b in bars]
    close = [b["close"] for b in bars]
    sym = bars[0]["symbol"]
    assumptions = ["无期权链：用滚动已实现波动年化×100 作为中国版 VIX 代理。"]
    cvix = _realized_vol_series(close, window)
    finite = [v for v in cvix if v is not None]
    if len(finite) < 5:
        return {
            "ok": False,
            "skill": SKILL,
            "signal": [],
            "series": {},
            "metrics": {},
            "assumptions": assumptions,
            "errors": ["已实现波动序列有效点不足"],
            "meta": _data_meta("insufficient", ["bars.daily"], missing_full),
        }

    zwin = int(params.get("z_window") or 60)
    signal = []
    zseries = []
    for i, v in enumerate(cvix):
        if v is None:
            continue
        start = max(0, i - zwin + 1)
        chunk = [x for x in cvix[start : i + 1] if x is not None]
        if len(chunk) < max(5, zwin // 4):
            continue
        m = sum(chunk) / len(chunk)
        sd = math.sqrt(sum((x - m) ** 2 for x in chunk) / max(len(chunk) - 1, 1))
        z = 0.0 if sd <= 0 else (v - m) / sd
        val = -1.0 if z >= 1.0 else (1.0 if z <= -1.0 else 0.0)
        signal.append({"date": dates[i], "symbol": sym, "value": val, "cvix": round(v, 4)})
        zseries.append({"date": dates[i], "value": round(z, 6)})

    assumptions.append("信号：CVIX 代理 z≥1 → -1；z≤-1 → +1；否则 0。非交易指令。")
    assumptions.append("仅标准库；禁止把代理指数等同交易所官方 iVIX。")
    last_cvix = next((v for v in reversed(cvix) if v is not None), None)
    return {
        "ok": True,
        "skill": SKILL,
        "signal": signal,
        "series": {
            "cvix": [{"date": dates[i], "value": round(v, 6)} for i, v in enumerate(cvix) if v is not None],
            "cvix_z": zseries,
        },
        "metrics": {
            "bars": len(bars),
            "symbol": sym,
            "window": window,
            "last_cvix": None if last_cvix is None else round(last_cvix, 4),
            "last_signal": signal[-1]["value"] if signal else None,
            "options_rows": 0,
        },
        "assumptions": assumptions,
        "errors": [],
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
            "ok": False,
            "skill": SKILL,
            "signal": [],
            "series": {},
            "metrics": {},
            "assumptions": [],
            "errors": [str(e)],
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
