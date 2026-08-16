#!/usr/bin/env python3
"""点位效率趋势（MACD 上下行）。纯 stdlib。"""
from __future__ import annotations
import argparse, json, math, sys
from collections import defaultdict
from typing import Any, Dict, List, Optional, Sequence

SKILL = "price-efficiency-trend"

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

def ema(xs, n):
    out=[None]*len(xs)
    if n<=0 or not xs: return out
    k=2.0/(n+1); seed_sum=0.0; seed_count=0; prev=None
    for i,v in enumerate(xs):
        if v is None:
            out[i]=None; prev=None; seed_sum=0.0; seed_count=0; continue
        if prev is None:
            seed_sum+=v; seed_count+=1
            if seed_count==n: prev=seed_sum/n; out[i]=prev
            else: out[i]=None
        else:
            prev=k*v+(1-k)*prev; out[i]=prev
    return out

def run(payload):
    params=payload.get("params") or {}
    method=str(params.get("method") or "A").upper()
    rate=float(params.get("rate") or 0.0)
    fast=int(params.get("fast") or 12); slow=int(params.get("slow") or 26); sig=int(params.get("signal") or 9)
    atr_n=int(params.get("atr_n") or 14)
    bars=sorted(pick_symbol_bars(list(payload.get("bars") or []), params.get("symbol")), key=lambda b:str(b.get("date","")))
    need=slow+sig+5
    if len(bars)<need:
        return {"ok":False,"skill":SKILL,"signal":[],"series":{},"metrics":{},"assumptions":[],"errors":[f"bars 不足：建议至少 {need} 根"],"meta":{}}
    dates=[str(b.get("date","")) for b in bars]
    close=[float(b["close"]) for b in bars]
    high=[float(b.get("high") or b["close"]) for b in bars]
    low=[float(b.get("low") or b["close"]) for b in bars]
    sym=str(bars[0].get("symbol",""))
    series_c=list(close)
    ef=ema(series_c,fast); es=ema(series_c,slow)
    dif=[None if a is None or b is None else a-b for a,b in zip(ef,es)]
    dea=ema(dif,sig)
    # ATR simple
    atr=[None]*len(close); trs=[]
    for i in range(len(close)):
        if i==0: trs.append(high[i]-low[i])
        else: trs.append(max(high[i]-low[i], abs(high[i]-close[i-1]), abs(low[i]-close[i-1])))
        if i+1>=atr_n: atr[i]=sum(trs[i+1-atr_n:i+1])/atr_n
    original=[]
    for i in range(len(close)):
        if dif[i] is None or dea[i] is None: original.append(None); continue
        base=dif[i]-dea[i]
        if method=="B" and atr[i] is not None: original.append(base-atr[i]*rate)
        else: original.append(base)
    direction=[0.0 if v is None else (1.0 if v>0 else (-1.0 if v<0 else 0.0)) for v in original]
    rel=[None]*len(close); seg=0
    for i in range(1,len(direction)+1):
        if i==len(direction) or direction[i]!=direction[seg]:
            chunk=close[seg:i]
            if chunk and direction[seg]!=0:
                lo,hi=min(chunk),max(chunk); span=hi-lo if hi!=lo else 1e-12
                for j in range(seg,i):
                    rel[j]=(close[j]-lo)/span if direction[seg]>0 else (hi-close[j])/span
            seg=i
    assumptions=[f"method={method}：A=DIF-DEA；B=DIF-DEA-ATR*rate；C 降级为 A",
                 "signal 为上下行方向（±1），非买卖指令"]
    return {"ok":True,"skill":SKILL,
        "signal":[{"date":d,"symbol":sym,"value":v} for d,v in zip(dates,direction)],
        "series":{"dif":[{"date":d,"value":v} for d,v in zip(dates,dif) if v is not None],
                  "dea":[{"date":d,"value":v} for d,v in zip(dates,dea) if v is not None],
                  "original":[{"date":d,"value":v} for d,v in zip(dates,original) if v is not None],
                  "relative_price":[{"date":d,"value":v} for d,v in zip(dates,rel) if v is not None]},
        "metrics":{"bars":len(bars),"symbol":sym,"method":method,"last_dir":direction[-1] if direction else 0.0,
                   "up_days":sum(1 for v in direction if v>0),"down_days":sum(1 for v in direction if v<0),
                   "sample_note":"示意样本统计，非实盘胜率"},
        "assumptions":assumptions,"errors":[],"meta":{"degraded":method=="C"}}

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
