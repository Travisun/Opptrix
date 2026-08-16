#!/usr/bin/env python3
"""Industry funnel quality gate: 5 hard metrics → keep/drop. Stdlib + Decimal."""
from __future__ import annotations

import argparse
import json
import sys
from decimal import Decimal, InvalidOperation
from typing import Any

SKILL = "industry-funnel"


def D(v: Any) -> Decimal | None:
    if v is None or v == "":
        return None
    try:
        return Decimal(str(v))
    except (InvalidOperation, ValueError, TypeError):
        return None


def _meta(mode: str, used: list[str], missing: list[str] | None = None) -> dict[str, Any]:
    m = mode if mode in ("full", "proxy", "insufficient") else "proxy"
    return {
        "data_mode": m,
        "degraded": m == "proxy",
        "used_inputs": used,
        "missing_for_full": list(missing or []),
    }


def score_one(row: dict[str, Any]) -> dict[str, Any]:
    pe = D(row.get("pe"))
    roe = D(row.get("roe"))
    ocf_ni = D(row.get("ocf_ni") or row.get("ocf_to_ni"))
    debt = D(row.get("debt_ratio") or row.get("leverage"))
    moat = int(row.get("moat_stars") or row.get("moat") or 0)
    peg = D(row.get("peg"))
    growth = bool(row.get("high_growth"))
    heavy = bool(row.get("heavy_asset") or row.get("utility"))

    checks: list[dict[str, Any]] = []
    # 1 PE reasonable OR PEG < 1.5 if high growth
    pe_ok = False
    if pe is not None and Decimal("0") < pe < Decimal("40"):
        pe_ok = True
    if growth and peg is not None and peg < Decimal("1.5"):
        pe_ok = True
    if row.get("pe_reasonable") is True:
        pe_ok = True
    if pe is None and row.get("pe_reasonable") is None and peg is None:
        checks.append({"id": 1, "name": "pe", "status": "insufficient"})
    else:
        checks.append({"id": 1, "name": "pe", "status": "pass" if pe_ok else "fail", "value": str(pe) if pe is not None else None})

    # 2 ROE > 15% or improving
    roe_ok = (roe is not None and roe > Decimal("0.15")) or bool(row.get("roe_improving"))
    if heavy and roe is not None and roe > Decimal("0.10"):
        roe_ok = True
    if roe is None and not row.get("roe_improving"):
        checks.append({"id": 2, "name": "roe", "status": "insufficient"})
    else:
        checks.append({"id": 2, "name": "roe", "status": "pass" if roe_ok else "fail", "value": str(roe) if roe else None})

    # 3 OCF/NI > 0.7
    if ocf_ni is None:
        checks.append({"id": 3, "name": "ocf_ni", "status": "insufficient"})
    else:
        checks.append(
            {
                "id": 3,
                "name": "ocf_ni",
                "status": "pass" if ocf_ni > Decimal("0.7") else "fail",
                "value": str(ocf_ni),
            }
        )

    # 4 debt < 60% (utility 70%)
    lim = Decimal("0.70") if heavy else Decimal("0.60")
    if debt is None:
        checks.append({"id": 4, "name": "debt_ratio", "status": "insufficient"})
    else:
        checks.append(
            {
                "id": 4,
                "name": "debt_ratio",
                "status": "pass" if debt < lim else "fail",
                "value": str(debt),
            }
        )

    # 5 moat >= 3
    checks.append(
        {
            "id": 5,
            "name": "moat",
            "status": "pass" if moat >= 3 else "fail",
            "value": moat,
        }
    )

    passes = sum(1 for c in checks if c["status"] == "pass")
    fails = sum(1 for c in checks if c["status"] == "fail")
    insuff = sum(1 for c in checks if c["status"] == "insufficient")
    near = passes >= 4 and fails <= 1
    keep = passes >= 5 or near
    if insuff >= 3:
        decision = "insufficient"
    elif keep:
        decision = "keep_watch" if near and fails else "keep"
    else:
        decision = "drop"

    return {
        "symbol": str(row.get("symbol") or ""),
        "name": str(row.get("name") or ""),
        "decision": decision,
        "passes": passes,
        "checks": checks,
        "drop_reason": None
        if keep
        else "; ".join(f"{c['name']}={c.get('status')}" for c in checks if c["status"] == "fail"),
    }


def run(payload: dict[str, Any]) -> dict[str, Any]:
    rows = payload.get("instruments") or payload.get("candidates") or []
    if isinstance(payload.get("panels"), dict) and isinstance(payload["panels"].get("candidates"), list):
        rows = list(rows) + payload["panels"]["candidates"]
    rows = [r for r in rows if isinstance(r, dict)]
    used = ["instruments"] if payload.get("instruments") else []
    if payload.get("candidates"):
        used.append("candidates")
    if not rows:
        return {
            "ok": False,
            "skill": SKILL,
            "meta": _meta("insufficient", used, ["instruments|candidates"]),
            "metrics": {},
            "results": [],
            "assumptions": [],
            "errors": ["empty_candidates"],
        }

    results = [score_one(r) for r in rows]
    full = all(
        all(c["status"] != "insufficient" for c in r["checks"]) for r in results
    )
    mode = "full" if full else "proxy"
    kept = [r for r in results if r["decision"] in ("keep", "keep_watch")]
    return {
        "ok": True,
        "skill": SKILL,
        "meta": _meta(mode, used or ["instruments"], [] if full else ["partial_fields"]),
        "metrics": {
            "n": len(results),
            "keep": sum(1 for r in results if r["decision"] == "keep"),
            "keep_watch": sum(1 for r in results if r["decision"] == "keep_watch"),
            "drop": sum(1 for r in results if r["decision"] == "drop"),
            "insufficient": sum(1 for r in results if r["decision"] == "insufficient"),
            "kept_symbols": [r["symbol"] for r in kept],
        },
        "results": results,
        "assumptions": [
            "5 条硬指标粗筛；4 及格+1 接近可标黄保留",
            "淘汰须写 drop_reason，禁止黑箱",
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
