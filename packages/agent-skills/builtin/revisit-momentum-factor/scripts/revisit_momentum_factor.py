#!/usr/bin/env python3
"""再论动量：多窗口收益−λσ² 与可选跳过近月。纯 stdlib。"""
from __future__ import annotations
import argparse, json, math, sys
from collections import defaultdict
from typing import Any, Dict, List, Optional, Sequence

SKILL = "revisit-momentum-factor"

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

def mom_at(closes, N, skip=0, lam=3000.0):
    # use closes[:-skip] if skip else closes; need N points
    end=len(closes)-skip if skip else len(closes)
    start=end-N
    if start<0 or end<=start+1: return None
    window=closes[start:end]
    ret=window[-1]/window[0]-1 if window[0]>0 else None
    if ret is None: return None
    rets=[window[i]/window[i-1]-1 for i in range(1,len(window))]
    risk=_std(rets)
    return ret - lam*(risk**2)

def run(payload):
    params=payload.get("params") or {}
    windows=params.get("windows") or [20,60,120]
    if isinstance(windows,str): windows=[int(x) for x in windows.split(",")]
    windows=[int(w) for w in windows]
    skip=int(params.get("skip") or 0)
    lam=float(params.get("lambda") or 3000.0)
    bars=list(payload.get("bars") or [])
    g=group_by_symbol(bars)
    assumptions=[f"多窗口动量：{windows}；skip={skip} 日（经典 12-1 可设 window=240,skip=20）",
                 f"momentum=R−{lam}·σ²"]
    # composite: average of available windows
    out=[]
    for s,rows in g.items():
        closes=[float(b["close"]) for b in rows]
        vals=[]
        detail={}
        for w in windows:
            v=mom_at(closes,w,skip=skip,lam=lam)
            detail[f"mom_{w}"]=v
            if v is not None: vals.append(v)
        if not vals: continue
        out.append({"symbol":s,"value":_mean(vals),"detail":detail,"date":str(rows[-1].get("date",""))})
    if not out:
        return {"ok":False,"skill":SKILL,"signal":[],"series":{},"metrics":{},"assumptions":assumptions,"errors":["有效标的不足"],"meta":{}}
    out.sort(key=lambda r:r["value"], reverse=True)
    for i,r in enumerate(out): r["rank"]=i+1
    return {"ok":True,"skill":SKILL,"signal":out,
        "series":{"momentum":[{"symbol":r["symbol"],"value":r["value"]} for r in out]},
        "metrics":{"symbols":len(out),"windows":windows,"skip":skip,"lambda":lam,"sample_note":"示意截面，非实盘 IC"},
        "assumptions":assumptions,"errors":[],"meta":{"degraded":False}}

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
