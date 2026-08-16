#!/usr/bin/env python3
"""处置效应 CGO：换手衰减加权参考价。纯 stdlib。"""
from __future__ import annotations
import argparse, json, math, sys
from collections import defaultdict
from typing import Any, Dict, List, Optional, Sequence

SKILL = "disposition-cgo"

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

def turnover_weights(turnovers):
    # turnover decay weights
    arr=list(turnovers)
    if not arr: return []
    arr=arr[:]
    # arr_[0]=0 then roll logic
    a=arr[:]
    a[0]=0.0
    # np.multiply(cumprod(1-roll(arr_,-1))[::-1][::-1], arr)
    # roll(arr_,-1): shift left by 1, last gets first
    rolled=a[1:]+[a[0]]
    # cumprod(1-rolled)[::-1][::-1] == cumprod(1-rolled) — notebook does double reverse of cumprod
    one_minus=[1.0-x for x in rolled]
    # cumprod from left
    cp=[]; acc=1.0
    for x in one_minus:
        acc*=x; cp.append(acc)
    # [::-1] then [::-1] cancels — but intent is reverse cumprod of future survival
    # Actual formula used in Factor: cumprod((1-roll)[::-1])[::-1]
    rev=list(reversed(one_minus)); acc=1.0; cp_rev=[]
    for x in rev:
        acc*=x; cp_rev.append(acc)
    survival=list(reversed(cp_rev))
    return [survival[i]*arr[i] for i in range(len(arr))]

def calc_cgo_for_symbol(rows, N):
    if len(rows)<N: return None, None
    window=rows[-N:]
    closes=[float(b["close"]) for b in window]
    # avg price
    avgs=[]
    turns=[]
    for b in window:
        if b.get("amount") and b.get("volume") and float(b["volume"])>0:
            avgs.append(float(b["amount"])/float(b["volume"]))
        else:
            avgs.append((float(b.get("open") or b["close"])+float(b["close"]))/2)
        t=b.get("turnover")
        if t is None: t=b.get("turnover_ratio")
        if t is None:
            # proxy: volume relative
            turns.append(0.02)
        else:
            turns.append(float(t)/100.0 if float(t)>1 else float(t))
    w=turnover_weights(turns)
    s=sum(w)
    if s<=0: return None, None
    scale=[x/s for x in w]
    rp=sum(scale[i]*avgs[i] for i in range(N))
    if rp<=0: return None, None
    cgo=closes[-1]/rp - 1.0
    return cgo, rp

def run(payload):
    params=payload.get("params") or {}
    N=int(params.get("N") or params.get("window") or 60)
    bars=list(payload.get("bars") or [])
    g=group_by_symbol(bars)
    assumptions=["CGO=close/RP−1；RP 为换手衰减加权均价（参考价）",
                 "无 turnover 时用常数换手代理并声明"]
    if any(b.get("turnover") is None and b.get("turnover_ratio") is None for b in bars):
        assumptions.append("部分/全部样本缺换手：使用 0.02 代理权重")
    rows_out=[]
    for s,rows in g.items():
        cgo,rp=calc_cgo_for_symbol(rows,N)
        if cgo is None: continue
        rows_out.append({"symbol":s,"value":cgo,"rp":rp,"date":str(rows[-1].get("date",""))})
    if not rows_out:
        return {"ok":False,"skill":SKILL,"signal":[],"series":{},"metrics":{},"assumptions":assumptions,"errors":[f"有效标的不足（需≥{N} 根/标的）"],"meta":{}}
    rows_out.sort(key=lambda r:r["value"])
    for i,r in enumerate(rows_out): r["rank"]=i+1
    return {"ok":True,"skill":SKILL,"signal":rows_out,
        "series":{"cgo":[{"symbol":r["symbol"],"value":r["value"]} for r in rows_out]},
        "metrics":{"symbols":len(rows_out),"N":N,"median_cgo":sorted(r["value"] for r in rows_out)[len(rows_out)//2],
                   "pct_positive":sum(1 for r in rows_out if r["value"]>0)/len(rows_out),
                   "sample_note":"示意截面，非实盘 IC"},
        "assumptions":assumptions,"errors":[],"meta":{"degraded":any("代理" in a for a in assumptions)}}

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
