#!/usr/bin/env python3
"""行业指数顶底：NH-NL 净新高占比。纯 stdlib。"""
from __future__ import annotations
import argparse, json, math, sys
from collections import defaultdict
from typing import Any, Dict, List, Optional, Sequence

SKILL = "industry-top-bottom"

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
    window=int(params.get("window") or 60)
    offset=int(params.get("offset") or 5)
    bars=list(payload.get("bars") or [])
    g=group_by_symbol(bars)
    if len(g)<2:
        return {"ok":False,"skill":SKILL,"signal":[],"series":{},"metrics":{},"assumptions":[],"errors":["需要多标的（行业成分或行业指数集合）"],"meta":{}}
    # align dates
    all_dates=sorted({str(b.get("date")) for b in bars})
    # close matrix
    closes={s:[None]*len(all_dates) for s in g}
    di={d:i for i,d in enumerate(all_dates)}
    for s,rows in g.items():
        for b in rows:
            closes[s][di[str(b.get("date"))]]=float(b["close"])
    nhnl=[]; signal_vals=[]; use_dates=[]
    thr_g=0.3; thr_o=0.2; thr_p=-0.2; thr_f=-0.3
    if len(g)<=40:
        thr_g,thr_o,thr_p,thr_f=0.4,0.3,-0.3,-0.4
    for i in range(window+offset, len(all_dates)):
        d=all_dates[i]
        highs=0; lows=0; n=0
        for s,series in closes.items():
            # need window of valid
            hist=series[i-window-offset:i-offset]
            cur=series[i]
            if cur is None or any(x is None for x in hist): continue
            n+=1
            if cur>=max(hist): highs+=1
            if cur<=min(hist): lows+=1
        if n==0: continue
        val=(highs-lows)/n
        nhnl.append(val); use_dates.append(d)
        if val>=thr_g: signal_vals.append(2.0)
        elif val>=thr_o: signal_vals.append(1.0)
        elif val<=thr_f: signal_vals.append(-2.0)
        elif val<=thr_p: signal_vals.append(-1.0)
        else: signal_vals.append(0.0)
    assumptions=["NHNL=(创新高数−创新低数)/样本数；创新高/低相对 window 且 offset 滞后天",
                 "阈值：贪婪/乐观/悲观/恐惧（成分少时用更宽阈值）",
                 "signal 为情绪档位示意，非买卖指令"]
    return {"ok":True,"skill":SKILL,
        "signal":[{"date":d,"value":v} for d,v in zip(use_dates,signal_vals)],
        "series":{"nhnl":[{"date":d,"value":v} for d,v in zip(use_dates,nhnl)]},
        "metrics":{"symbols":len(g),"window":window,"offset":offset,
                   "last_nhnl":nhnl[-1] if nhnl else None,"last_signal":signal_vals[-1] if signal_vals else 0.0,
                   "thresholds":{"greed":thr_g,"optimism":thr_o,"pessimism":thr_p,"fear":thr_f},
                   "sample_note":"示意样本统计，非实盘胜率"},
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
