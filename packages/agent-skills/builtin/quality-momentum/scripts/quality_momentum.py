#!/usr/bin/env python3
"""高质量动量：ret - λ*σ²，可选质量过滤。纯 stdlib。"""
from __future__ import annotations
import argparse, json, math, sys
from collections import defaultdict
from typing import Any, Dict, List, Optional, Sequence

SKILL = "quality-momentum"

def pick_symbol_bars(bars, symbol=None):
    if not bars: return []
    if symbol:
        rows=[b for b in bars if str(b.get("symbol",""))==symbol]
        if rows: return rows
    counts={}
    for b in bars:
        s=str(b.get("symbol",""))
        counts[s]=counts.get(s,0)+1
    top=max(counts, key=counts.get) if counts else ""
    return [b for b in bars if str(b.get("symbol",""))==top] if top else list(bars)

def _mean(xs):
    return sum(xs)/len(xs) if xs else float("nan")

def _std(xs):
    if len(xs)<2: return 0.0
    m=_mean(xs)
    return math.sqrt(sum((x-m)**2 for x in xs)/len(xs))

def group_by_symbol(bars):
    g=defaultdict(list)
    for b in bars:
        g[str(b.get("symbol",""))].append(b)
    for s in g:
        g[s]=sorted(g[s], key=lambda x:str(x.get("date","")))
    return g

def run(payload):
    params=payload.get("params") or {}
    N=int(params.get("N") or params.get("window") or 60)
    lam=float(params.get("lambda") or 3000.0)
    bars=list(payload.get("bars") or [])
    fins={str(r.get("symbol")):r for r in (payload.get("panels") or {}).get("financials") or [] if isinstance(r,dict)}
    g=group_by_symbol(bars)
    assumptions=[f"动量=区间收益 − {lam}×日收益方差（与高质量动量研报同型）",
                 "若 panels.financials 含 roe/负债率等，则做质量过滤"]
    out=[]; skipped_q=0
    for s,rows in g.items():
        if len(rows)<N+1: continue
        window=rows[-(N+1):-1]  # exclude last watch day style
        if len(window)<N: window=rows[-N:]
        closes=[float(b["close"]) for b in window]
        if closes[0]<=0: continue
        ret=closes[-1]/closes[0]-1
        rets=[closes[i]/closes[i-1]-1 for i in range(1,len(closes))]
        risk=_std(rets)
        mom=ret - lam*(risk**2)
        # quality filter
        fin=fins.get(s)
        if fin:
            roe=fin.get("roe"); debt=fin.get("borr2total") or fin.get("debt_to_asset")
            pe=fin.get("pe_ttm") or fin.get("pe")
            ok=True
            if roe is not None and float(roe)<0: ok=False
            if debt is not None and float(debt)>0.7: ok=False
            if pe is not None and float(pe)<0: ok=False
            if not ok:
                skipped_q+=1; continue
        else:
            pass
        out.append({"symbol":s,"value":mom,"raw_ret":ret,"risk":risk,"date":str(rows[-1].get("date",""))})
    if not fins:
        assumptions.append("无财务面板：仅输出风险调整动量，未做质量过滤")
    if not out:
        return {"ok":False,"skill":SKILL,"signal":[],"series":{},"metrics":{},"assumptions":assumptions,"errors":["有效标的不足"],"meta":{}}
    out.sort(key=lambda r:r["value"], reverse=True)
    for i,r in enumerate(out): r["rank"]=i+1
    return {"ok":True,"skill":SKILL,"signal":out,
        "series":{"quality_momentum":[{"symbol":r["symbol"],"value":r["value"]} for r in out]},
        "metrics":{"symbols":len(out),"N":N,"lambda":lam,"quality_filtered":skipped_q,
                   "sample_note":"示意截面，非实盘 IC"},
        "assumptions":assumptions,"errors":[],"meta":{"degraded":not bool(fins)}}

def main(argv=None):
    p = argparse.ArgumentParser(description=SKILL)
    p.add_argument("--input", required=True)
    p.add_argument("--output")
    args = p.parse_args(argv)
    try:
        with open(args.input, "r", encoding="utf-8") as f:
            payload = json.load(f)
        result = run(payload)
        text = json.dumps(result, ensure_ascii=False, indent=2)
        if args.output:
            with open(args.output, "w", encoding="utf-8") as f:
                f.write(text + "\n")
        print(text)
        return 0 if result.get("ok") else 1
    except Exception as exc:
        err = {"ok": False, "skill": SKILL, "signal": [], "series": {}, "metrics": {},
               "assumptions": [], "errors": [str(exc)], "meta": {}}
        print(json.dumps(err, ensure_ascii=False, indent=2))
        print(str(exc), file=sys.stderr)
        return 1

if __name__ == "__main__":
    raise SystemExit(main())
