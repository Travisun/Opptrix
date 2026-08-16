#!/usr/bin/env python3
"""Buffett-style 6-gate checklist scorer. Stdlib + Decimal. No network.

Input::
  {
    "instruments": [{
      "symbol": "...",
      "gates": {
        "circle": 1-5,
        "business": 1-5,
        "moat": 1-5,
        "management": 1-5,
        "margin_of_safety": 1-5,
        "discipline": 1-5
      },
      "vetoes": ["cannot_explain_earn", ...],
      "mirror_ok": true/false,
      "info_grade": "A"|"B"|"C"
    }]
  }
"""
from __future__ import annotations

import argparse
import json
import sys
from typing import Any

SKILL = "investment-checklist"

GATE_KEYS = (
    "circle",
    "business",
    "moat",
    "management",
    "margin_of_safety",
    "discipline",
)

VETO_CODES = {
    "cannot_explain_earn",
    "fcf_negative_3y",
    "integrity_stain",
    "moat_eroding",
    "greater_fool",
    "cannot_bear_zero",
    "fomo_or_crowd",
    "cannot_write_200",
}


def _meta(mode: str, used: list[str], missing: list[str] | None = None) -> dict[str, Any]:
    m = mode if mode in ("full", "proxy", "insufficient") else "proxy"
    return {
        "data_mode": m,
        "degraded": m == "proxy",
        "used_inputs": used,
        "missing_for_full": list(missing or []),
    }


def _clamp_stars(v: Any) -> int | None:
    try:
        n = int(v)
    except (TypeError, ValueError):
        return None
    if n < 1 or n > 5:
        return None
    return n


def score_one(row: dict[str, Any]) -> dict[str, Any]:
    gates_in = row.get("gates") if isinstance(row.get("gates"), dict) else {}
    stars: dict[str, int | None] = {}
    missing: list[str] = []
    for k in GATE_KEYS:
        s = _clamp_stars(gates_in.get(k))
        stars[k] = s
        if s is None:
            missing.append(f"gates.{k}")

    vetoes_raw = row.get("vetoes") or []
    vetoes = [str(v) for v in vetoes_raw if str(v) in VETO_CODES or str(v)]
    hard_veto = [v for v in vetoes if v in VETO_CODES]
    # integrity / cannot explain always hard
    if stars.get("circle") == 1:
        hard_veto.append("circle_star_1")
    if stars.get("management") == 1:
        hard_veto.append("management_integrity")

    mirror_ok = bool(row.get("mirror_ok"))
    if row.get("mirror_ok") is None:
        missing.append("mirror_ok")

    info = str(row.get("info_grade") or row.get("abc") or "B").upper()
    if info not in ("A", "B", "C"):
        info = "B"

    filled = sum(1 for v in stars.values() if v is not None)
    avg = None
    if filled:
        avg = round(sum(v for v in stars.values() if v is not None) / filled, 2)

    if hard_veto:
        verdict = "reject"
    elif info == "C" and filled < 4:
        verdict = "grey"  # 数据不足 ≠ 否决
    elif not mirror_ok and row.get("mirror_ok") is not None:
        verdict = "reject"
    elif filled == 6 and all((stars[k] or 0) >= 3 for k in GATE_KEYS) and mirror_ok:
        verdict = "pass"
    elif filled >= 4 and avg is not None and avg >= 3.0 and not hard_veto:
        verdict = "conditional_pass"
    elif filled < 3:
        verdict = "grey"
    else:
        verdict = "reject"

    return {
        "symbol": str(row.get("symbol") or ""),
        "name": str(row.get("name") or ""),
        "info_grade": info,
        "stars": stars,
        "avg_stars": avg,
        "gates_filled": filled,
        "mirror_ok": mirror_ok if row.get("mirror_ok") is not None else None,
        "vetoes": list(dict.fromkeys(hard_veto)),
        "verdict": verdict,
        "missing": missing,
    }


def run(payload: dict[str, Any]) -> dict[str, Any]:
    rows = payload.get("instruments") or payload.get("companies") or []
    if isinstance(payload.get("panels"), dict) and isinstance(payload["panels"].get("checklist"), list):
        rows = list(rows) + payload["panels"]["checklist"]
    rows = [r for r in rows if isinstance(r, dict)]
    used = []
    if payload.get("instruments") or payload.get("companies"):
        used.append("instruments")
    if not rows:
        return {
            "ok": False,
            "skill": SKILL,
            "meta": _meta("insufficient", used, ["instruments"]),
            "metrics": {},
            "results": [],
            "assumptions": [],
            "errors": ["empty_instruments"],
        }

    results = [score_one(r) for r in rows]
    full = all(r["gates_filled"] == 6 and r["mirror_ok"] is not None for r in results)
    mode = "full" if full else ("proxy" if results else "insufficient")
    return {
        "ok": True,
        "skill": SKILL,
        "meta": _meta(mode, used or ["instruments"], [] if full else ["gates.*|mirror_ok"]),
        "metrics": {
            "n": len(results),
            "pass": sum(1 for r in results if r["verdict"] == "pass"),
            "conditional_pass": sum(1 for r in results if r["verdict"] == "conditional_pass"),
            "reject": sum(1 for r in results if r["verdict"] == "reject"),
            "grey": sum(1 for r in results if r["verdict"] == "grey"),
        },
        "results": results,
        "assumptions": [
            "Checklist 目标是排除坏选择，不是找最好",
            "C 级信息不足 → grey，不等于否决或通过",
            "镜子测试未通过或硬否决触发 → reject",
        ],
        "errors": [],
    }


def main(argv: list[str] | None = None) -> int:
    ap = argparse.ArgumentParser(description=SKILL)
    ap.add_argument("--input", required=True)
    ap.add_argument("--output")
    args = ap.parse_args(argv)
    try:
        with open(args.input, encoding="utf-8") as f:
            payload = json.load(f)
        result = run(payload if isinstance(payload, dict) else {})
    except Exception as exc:  # noqa: BLE001
        result = {
            "ok": False,
            "skill": SKILL,
            "meta": {},
            "metrics": {},
            "results": [],
            "assumptions": [],
            "errors": [str(exc)],
        }
        print(str(exc), file=sys.stderr)
        text = json.dumps(result, ensure_ascii=False, indent=2)
        if args.output:
            with open(args.output, "w", encoding="utf-8") as f:
                f.write(text + "\n")
        print(text)
        return 1
    text = json.dumps(result, ensure_ascii=False, indent=2)
    if args.output:
        with open(args.output, "w", encoding="utf-8") as f:
            f.write(text + "\n")
    print(text)
    return 0 if result.get("ok") else 1


if __name__ == "__main__":
    raise SystemExit(main())
