#!/usr/bin/env python3
"""投资者情绪指数择时（广度/换手代理合成）。纯 stdlib。"""
from __future__ import annotations
import argparse, json, math, sys
from collections import defaultdict
from typing import Any, Dict, List, Optional, Sequence

SKILL = "investor-sentiment-timing"

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

def zscore_series(xs, win):
    out=[None]*len(xs)
    for i in range(win-1,len(xs)):
        chunk=xs[i+1-win:i+1]; m=_mean(chunk); s=_std(chunk)
        out[i]=0.0 if s==0 else (xs[i]-m)/s
    return out

def run(payload):
    params=payload.get("params") or {}
    win=int(params.get("window") or 60)
    bars=list(payload.get("bars") or [])
    panels=payload.get("panels") or {}
    by_date=defaultdict(list)
    for b in bars: by_date[str(b.get("date",""))].append(b)
    dates=sorted(by_date.keys())
    assumptions=[]
    # breadth: advance ratio
    adv=[]; turn=[]; lim=[]
    for i,d in enumerate(dates):
        rows=by_date[d]
        if i==0:
            adv.append(0.5); turn.append(_mean([float(b.get("turnover") or b.get("volume") or 0) for b in rows])); lim.append(0.0); continue
        prev={str(b.get("symbol")):float(b["close"]) for b in by_date[dates[i-1]]}
        ups=0; n=0
        for b in rows:
            s=str(b.get("symbol")); c=float(b["close"])
            if s in prev and prev[s]>0:
                n+=1
                if c>prev[s]: ups+=1
        adv.append(ups/n if n else 0.5)
        turn.append(_mean([float(b.get("turnover") or b.get("volume") or 0) for b in rows]))
        # limit-up proxy if panel provided
        lim.append(0.0)
    if panels.get("sentiment"):
        # optional: {date, advance_ratio, turnover, limit_up_ratio}
        by_p={str(r.get("date")):r for r in panels["sentiment"] if isinstance(r,dict)}
        for i,d in enumerate(dates):
            if d in by_p:
                r=by_p[d]
                if r.get("advance_ratio") is not None: adv[i]=float(r["advance_ratio"])
                if r.get("turnover") is not None: turn[i]=float(r["turnover"])
                if r.get("limit_up_ratio") is not None: lim[i]=float(r["limit_up_ratio"])
        assumptions.append("使用 panels.sentiment 覆盖部分代理字段")
    else:
        assumptions.append("情绪代理：多标的涨跌家数比 + 换手；无涨跌停字段则该项为 0")
    if len(dates)<win+5:
        return {"ok":False,"skill":SKILL,"signal":[],"series":{},"metrics":{},"assumptions":assumptions,"errors":[f"日期不足：需≥{win+5}"],"meta":{}}
    za=zscore_series(adv,win); zt=zscore_series(turn,win); zl=zscore_series(lim,win) if any(lim) else [0.0]*len(dates)
    sent=[]; signal_vals=[]
    for i in range(len(dates)):
        parts=[x for x in (za[i], zt[i], zl[i] if zl[i] is not None else 0.0) if x is not None]
        if len(parts)<2:
            sent.append(None); signal_vals.append(0.0); continue
        s=_mean(parts); sent.append(s)
        signal_vals.append(1.0 if s>0.5 else (-1.0 if s<-0.5 else 0.0))
    assumptions.append("等权合成标准化情绪代理；阈值 ±0.5 为规则状态")
    return {"ok":True,"skill":SKILL,
        "signal":[{"date":d,"value":v} for d,v in zip(dates,signal_vals)],
        "series":{"sentiment":[{"date":d,"value":v} for d,v in zip(dates,sent) if v is not None],
                  "advance_ratio":[{"date":d,"value":v} for d,v in zip(dates,adv)],
                  "turnover":[{"date":d,"value":v} for d,v in zip(dates,turn)]},
        "metrics":{"dates":len(dates),"window":win,
                   "last_sentiment":next((v for v in reversed(sent) if v is not None),None),
                   "last_signal":signal_vals[-1] if signal_vals else 0.0,
                   "sample_note":"示意样本统计，非实盘胜率"},
        "assumptions":assumptions,"errors":[],"meta":{"degraded":not bool(panels.get("sentiment"))}}

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
