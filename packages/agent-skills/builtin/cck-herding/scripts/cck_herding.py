#!/usr/bin/env python3
"""CCK 羊群效应：CSAD 与 Rm^2 回归 gamma。纯 stdlib。"""
from __future__ import annotations
import argparse, json, math, sys
from collections import defaultdict
from typing import Any, Dict, List, Optional, Sequence

SKILL = "cck-herding"

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

def ols_gamma2(csad, abs_rm, rm2):
    # CSAD = a*|Rm| + b*Rm^2 + e  (no intercept for parity with notebook lstsq on two cols)
    # return b
    n=len(csad)
    if n<5: return None
    # solve [abs_rm, rm2] @ [a,b] = csad via normal equations
    s11=sum(x*x for x in abs_rm); s12=sum(x*y for x,y in zip(abs_rm,rm2)); s22=sum(y*y for y in rm2)
    t1=sum(x*z for x,z in zip(abs_rm,csad)); t2=sum(y*z for y,z in zip(rm2,csad))
    det=s11*s22-s12*s12
    if abs(det)<1e-18: return None
    b=(s11*t2-s12*t1)/det
    return b

def run(payload):
    params=payload.get("params") or {}
    win=int(params.get("window") or 21)
    bars=list(payload.get("bars") or [])
    if len(bars)<win*3:
        return {"ok":False,"skill":SKILL,"signal":[],"series":{},"metrics":{},"assumptions":[],"errors":["多标的 bars 不足"],"meta":{}}
    # group by date
    by_date=defaultdict(list)
    for b in bars:
        by_date[str(b.get("date",""))].append(b)
    dates=sorted(by_date.keys())
    # returns per symbol
    by_sym=defaultdict(list)
    for b in sorted(bars, key=lambda x:(str(x.get("symbol","")),str(x.get("date","")))):
        by_sym[str(b.get("symbol",""))].append(b)
    # market = equal-weight cross-section mean return each day
    rets_by_date={}
    for i,d in enumerate(dates):
        if i==0: continue
        rs=[]
        prev={str(b.get("symbol")):float(b["close"]) for b in by_date[dates[i-1]]}
        for b in by_date[d]:
            s=str(b.get("symbol")); c=float(b["close"])
            if s in prev and prev[s]>0: rs.append(c/prev[s]-1)
        if rs: rets_by_date[d]=rs
    use_dates=sorted(rets_by_date.keys())
    csad=[]; rm=[]; for_dates=[]
    for d in use_dates:
        rs=rets_by_date[d]; m=_mean(rs)
        csad.append(_mean([abs(r-m) for r in rs])); rm.append(m); for_dates.append(d)
    gamma=[None]*len(for_dates); signal_vals=[0.0]*len(for_dates)
    for i in range(win-1, len(for_dates)):
        c=csad[i+1-win:i+1]; r=rm[i+1-win:i+1]
        abs_r=[abs(x) for x in r]; r2=[x*x for x in r]
        g=ols_gamma2(c, abs_r, r2)
        gamma[i]=g
        roll_m=_mean(r)
        # herding when gamma2<0 and market up
        signal_vals[i]=1.0 if (g is not None and g<0 and roll_m>0) else 0.0
    assumptions=["CSAD=截面 |ri−Rm| 均值；滚动回归 CSAD~|Rm|+Rm² 取 Rm² 系数",
                 "羊群信号：gamma2<0 且窗口均收益>0（规则状态，非买卖指令）",
                 "宇宙需多标的日 K；样本过窄时统计不稳定"]
    return {"ok":True,"skill":SKILL,
        "signal":[{"date":d,"value":v} for d,v in zip(for_dates,signal_vals)],
        "series":{"csad":[{"date":d,"value":v} for d,v in zip(for_dates,csad)],
                  "gamma2":[{"date":d,"value":v} for d,v in zip(for_dates,gamma) if v is not None],
                  "rm":[{"date":d,"value":v} for d,v in zip(for_dates,rm)]},
        "metrics":{"dates":len(for_dates),"symbols":len(by_sym),"window":win,
                   "last_gamma2":next((v for v in reversed(gamma) if v is not None),None),
                   "herd_days":sum(1 for v in signal_vals if v>0),
                   "sample_note":"示意样本统计，非实盘胜率"},
        "assumptions":assumptions,"errors":[],"meta":{"degraded":len(by_sym)<5}}

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
