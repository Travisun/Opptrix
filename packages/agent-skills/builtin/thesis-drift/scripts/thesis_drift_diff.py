#!/usr/bin/env python3
"""thesis-drift: compare two structured thesis snapshots (stdlib only, no network)."""
from __future__ import annotations

import argparse
import json
import sys
from decimal import Decimal, InvalidOperation
from typing import Any

SKILL = "thesis-drift"
DIMS = ("valuation", "assumptions", "redlines", "management", "moat")
STATUS_RANK = {"ok": 0, "weakening": 1, "impaired": 2, "broken": 3}
ACTION_RANK = {
    "buy": 0,
    "hold": 1,
    "watch": 2,
    "reduce": 3,
    "exit": 4,
    "unknown": 5,
}


def _dec(v: Any) -> Decimal | None:
    if v is None or v == "":
        return None
    try:
        return Decimal(str(v))
    except (InvalidOperation, ValueError):
        return None


def _data_meta(mode: str, used: list[str], missing: list[str] | None = None) -> dict[str, Any]:
    m = mode if mode in ("full", "proxy", "insufficient") else "proxy"
    return {
        "data_mode": m,
        "degraded": m == "proxy",
        "used_inputs": list(used),
        "missing_for_full": list(missing or []),
    }


def _norm_status(s: Any) -> str:
    t = str(s or "ok").strip().lower()
    aliases = {
        "成立": "ok",
        "ok": "ok",
        "green": "ok",
        "weakening": "weakening",
        "边际弱化": "weakening",
        "impaired": "impaired",
        "受损": "impaired",
        "broken": "broken",
        "破裂": "broken",
    }
    return aliases.get(t, t if t in STATUS_RANK else "ok")


def _assumption_score(items: list[Any]) -> tuple[int, int, int, int]:
    ok = weak = imp = brk = 0
    for it in items:
        if not isinstance(it, dict):
            continue
        st = _norm_status(it.get("status"))
        if st == "broken":
            brk += 1
        elif st == "impaired":
            imp += 1
        elif st == "weakening":
            weak += 1
        else:
            ok += 1
    return ok, weak, imp, brk


def _dir_from_scores(old_bad: int, new_bad: int) -> str:
    if new_bad < old_bad:
        return "Improved"
    if new_bad > old_bad:
        return "Weakened"
    return "Unchanged"


def _cmp_valuation(old_v: dict[str, Any], new_v: dict[str, Any]) -> dict[str, Any]:
    old_mos = _dec(old_v.get("margin_of_safety"))
    new_mos = _dec(new_v.get("margin_of_safety"))
    evidence: list[str] = []
    direction = "Unchanged"
    conf = "low"
    if old_mos is not None and new_mos is not None:
        conf = "high"
        diff = new_mos - old_mos
        evidence.append(f"margin_of_safety: {old_mos} → {new_mos} (Δ {diff})")
        if diff > Decimal("0.02"):
            direction = "Improved"
        elif diff < Decimal("-0.02"):
            direction = "Weakened"
        else:
            direction = "Unchanged"
    else:
        old_pe = _dec(old_v.get("pe"))
        new_pe = _dec(new_v.get("pe"))
        if old_pe is not None and new_pe is not None and old_pe > 0:
            conf = "medium"
            # Lower PE alone is valuation change — label Unchanged on business quality;
            # only mark Weakened if PE spike > 25% without mos.
            pct = (new_pe - old_pe) / old_pe
            evidence.append(f"pe: {old_pe} → {new_pe} (Δ {pct:.2%})")
            if pct > Decimal("0.25"):
                direction = "Weakened"
                evidence.append("PE 显著抬升且无安全边际字段：估值锚点弱化（价格/倍数变化，非自动等于基本面变差）")
            elif pct < Decimal("-0.25"):
                direction = "Improved"
                evidence.append("PE 显著回落：估值锚点改善（仍须人工区分基本面）")
        else:
            evidence.append("估值字段不足，无法判定")
            direction = "Unchanged"
            conf = "low"
    return {
        "dimension": "valuation",
        "direction": direction,
        "old": old_v,
        "new": new_v,
        "evidence": evidence if direction != "Unchanged" else [],
        "confidence": conf,
    }


def _cmp_assumptions(old_a: list[Any], new_a: list[Any]) -> dict[str, Any]:
    o_ok, o_w, o_i, o_b = _assumption_score(old_a if isinstance(old_a, list) else [])
    n_ok, n_w, n_i, n_b = _assumption_score(new_a if isinstance(new_a, list) else [])
    old_bad = o_w + 2 * o_i + 3 * o_b
    new_bad = n_w + 2 * n_i + 3 * n_b
    direction = _dir_from_scores(old_bad, new_bad)
    evidence: list[str] = []
    if direction != "Unchanged":
        evidence.append(
            f"假设计数 old ok/weak/impaired/broken={o_ok}/{o_w}/{o_i}/{o_b} "
            f"→ new={n_ok}/{n_w}/{n_i}/{n_b}"
        )
    return {
        "dimension": "assumptions",
        "direction": direction,
        "old_counts": {"ok": o_ok, "weakening": o_w, "impaired": o_i, "broken": o_b},
        "new_counts": {"ok": n_ok, "weakening": n_w, "impaired": n_i, "broken": n_b},
        "evidence": evidence,
        "confidence": "high" if (old_a or new_a) else "low",
    }


def _cmp_redlines(old_r: list[Any], new_r: list[Any]) -> dict[str, Any]:
    def triggered(xs: list[Any]) -> int:
        n = 0
        for it in xs if isinstance(xs, list) else []:
            if isinstance(it, dict) and bool(it.get("triggered")):
                n += 1
        return n

    ot, nt = triggered(old_r), triggered(new_r)
    if nt < ot:
        direction = "Improved"
    elif nt > ot:
        direction = "Weakened"
    else:
        direction = "Unchanged"
    evidence = []
    if direction != "Unchanged":
        evidence.append(f"红线触发数: {ot} → {nt}")
    return {
        "dimension": "redlines",
        "direction": direction,
        "old_triggered": ot,
        "new_triggered": nt,
        "evidence": evidence,
        "confidence": "high",
    }


def _cmp_label(dim: str, old_s: Any, new_s: Any, better: set[str], worse: set[str]) -> dict[str, Any]:
    o = str(old_s or "").strip().lower()
    n = str(new_s or "").strip().lower()
    if not o or not n:
        return {
            "dimension": dim,
            "direction": "Unchanged",
            "evidence": [],
            "confidence": "low",
            "note": "标签缺失，无法判断",
        }
    if o == n:
        direction = "Unchanged"
        evidence: list[str] = []
    elif n in better or (o in worse and n not in worse):
        direction = "Improved"
        evidence = [f"{dim}: {o} → {n}"]
    elif n in worse or (o in better and n not in better):
        direction = "Weakened"
        evidence = [f"{dim}: {o} → {n}"]
    else:
        # wording-only / unknown labels → Unchanged (do not invent drift)
        direction = "Unchanged"
        evidence = []
    return {
        "dimension": dim,
        "direction": direction,
        "old": o,
        "new": n,
        "evidence": evidence,
        "confidence": "medium" if evidence else "low",
    }


def _overall(dims: list[dict[str, Any]]) -> dict[str, Any]:
    improved = sum(1 for d in dims if d.get("direction") == "Improved")
    weakened = sum(1 for d in dims if d.get("direction") == "Weakened")
    if weakened == 0 and improved == 0:
        verdict = "未漂移"
        drift = "none"
    elif weakened == 0 and improved > 0:
        verdict = "正向漂移"
        drift = "positive"
    elif improved == 0 and weakened > 0:
        verdict = "负向漂移"
        drift = "negative"
    else:
        verdict = "混合漂移"
        drift = "mixed"
    return {"verdict": verdict, "drift": drift, "improved": improved, "weakened": weakened}


def _action_migration(old_a: Any, new_a: Any) -> dict[str, Any]:
    o = str(old_a or "unknown").lower()
    n = str(new_a or "unknown").lower()
    return {
        "from": o,
        "to": n,
        "changed": o != n,
        "rank_delta": ACTION_RANK.get(n, 5) - ACTION_RANK.get(o, 5),
    }


def compute(payload: dict[str, Any]) -> dict[str, Any]:
    old = payload.get("old")
    new = payload.get("new")
    used: list[str] = []
    missing: list[str] = []
    if not isinstance(old, dict) or not isinstance(new, dict):
        return {
            "ok": False,
            "skill": SKILL,
            "meta": _data_meta("insufficient", [], ["old", "new"]),
            "checks": [],
            "metrics": {},
            "dimensions": [],
            "overall": {"verdict": "证据不足无法判断", "drift": "insufficient"},
            "assumptions": [],
            "errors": ["input.old 与 input.new 须为对象"],
        }

    used.extend(["old", "new"])
    for key in ("assumptions", "redlines", "valuation"):
        if key not in old or key not in new:
            missing.append(f"*.{key}")

    dims = [
        _cmp_valuation(
            old.get("valuation") if isinstance(old.get("valuation"), dict) else {},
            new.get("valuation") if isinstance(new.get("valuation"), dict) else {},
        ),
        _cmp_assumptions(
            old.get("assumptions") if isinstance(old.get("assumptions"), list) else [],
            new.get("assumptions") if isinstance(new.get("assumptions"), list) else [],
        ),
        _cmp_redlines(
            old.get("redlines") if isinstance(old.get("redlines"), list) else [],
            new.get("redlines") if isinstance(new.get("redlines"), list) else [],
        ),
        _cmp_label(
            "management",
            old.get("management"),
            new.get("management"),
            better={"trustworthy", "improved", "strong", "优秀", "可信"},
            worse={"concern", "weak", "untrustworthy", "受损", "担忧"},
        ),
        _cmp_label(
            "moat",
            old.get("moat"),
            new.get("moat"),
            better={"widening", "strong", "wide", "变宽", "强化"},
            worse={"narrowing", "weak", "eroded", "变窄", "削弱"},
        ),
    ]

    # Drop unknown dims safety — keep only fixed five
    dims = [d for d in dims if d.get("dimension") in DIMS]
    overall = _overall(dims)
    mode = "full" if not missing else "proxy"
    if missing and len(missing) >= 3:
        mode = "proxy"

    return {
        "ok": True,
        "skill": SKILL,
        "meta": _data_meta(mode, used, missing),
        "symbol": payload.get("symbol"),
        "company": payload.get("company"),
        "old_date": old.get("date"),
        "new_date": new.get("date"),
        "dimensions": dims,
        "overall": overall,
        "action_migration": _action_migration(old.get("action"), new.get("action")),
        "metrics": {
            "dimension_count": len(dims),
            "improved": overall["improved"],
            "weakened": overall["weakened"],
        },
        "assumptions": [
            "只比较结构化证据字段；同义改写不产生漂移。",
            "估值倍数变化默认视为估值锚点维度，不自动改写护城河/管理层。",
        ],
        "errors": [],
        "checks": [{"name": d["dimension"], "direction": d["direction"]} for d in dims],
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
            "meta": {},
            "dimensions": [],
            "overall": {"verdict": "证据不足无法判断", "drift": "error"},
            "metrics": {},
            "assumptions": [],
            "errors": [str(e)],
            "checks": [],
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
