#!/usr/bin/env python3
"""振幅因子隐藏结构：高低价位分段振幅。纯 stdlib。"""
from __future__ import annotations
import argparse, json, math, sys
from collections import defaultdict
from typing import Any, Dict, List, Optional, Sequence

SKILL = "amplitude-hidden-structure"

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
    N=int(params.get("N") or params.get("window") or 20)
    lamb=float(params.get("lamb") or 0.5)
    group=str(params.get("group") or "low")  # high|low — 研报：低价区振幅更有效
    bars=list(payload.get("bars") or [])
    g=group_by_symbol(bars)
    assumptions=[f"振幅 AF=high/low−1；在窗口内按收盘截面分位 lamb={lamb} 切分高低价区",
                 f"取 group={group} 区域振幅均值作为因子（研报关注低价区结构）"]
    out=[]
    for s,rows in g.items():
        if len(rows)<N+2: continue
        window=rows[-(N+2):]
        # exclude limit-down one-word day effect lightly
        afs=[]; mask=[]
        for i in range(1,len(window)):
            h=float(window[i].get("high") or window[i]["close"])
            l=float(window[i].get("low") or window[i]["close"])
            c=float(window[i]["close"]); pc=float(window[i-1]["close"])
            af=h/l-1 if l>0 else 0.0
            limit_like=(c/pc-1 < -0.09) and (abs(h-l)<1e-12)
            afs.append(af); mask.append(not limit_like)
        # last N
        afs=afs[-N:]; mask=mask[-N:]
        closes=[float(b["close"]) for b in window[-N:]]
        # percentile split within window time-series rank
        ranked=sorted(range(N), key=lambda i:closes[i])
        thr_idx=int(lamb*(N-1))
        thr_price=closes[ranked[thr_idx]]
        vals=[]
        for i in range(N):
            in_high=closes[i]>=thr_price
            use=(in_high if group=="high" else (not in_high)) and mask[i]
            if use: vals.append(afs[i])
        if not vals: continue
        out.append({"symbol":s,"value":_mean(vals),"date":str(rows[-1].get("date",""))})
    if not out:
        return {"ok":False,"skill":SKILL,"signal":[],"series":{},"metrics":{},"assumptions":assumptions,"errors":["有效标的不足"],"meta":{}}
    out.sort(key=lambda r:r["value"])
    for i,r in enumerate(out): r["rank"]=i+1
    return {"ok":True,"skill":SKILL,"signal":out,
        "series":{"af_group":[{"symbol":r["symbol"],"value":r["value"]} for r in out]},
        "metrics":{"symbols":len(out),"N":N,"lamb":lamb,"group":group,"sample_note":"示意截面，非实盘 IC"},
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
