#!/usr/bin/env python3
"""CSVC 牛熊指标 kernel=vol/turnover。纯 stdlib。"""
from __future__ import annotations
import argparse, json, math, sys
from collections import defaultdict
from typing import Any, Dict, List, Optional, Sequence

SKILL = "csvc-bull-bear"

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

def run(payload):
    params=payload.get("params") or {}
    period=int(params.get("period") or 60)
    ma_win=int(params.get("ma_window") or 20)
    method=str(params.get("method") or "MA").upper()
    assumptions=[]
    bars=sorted(pick_symbol_bars(list(payload.get("bars") or []), params.get("symbol")), key=lambda b:str(b.get("date","")))
    need=period+ma_win+2
    if len(bars)<need:
        return {"ok":False,"skill":SKILL,"signal":[],"series":{},"metrics":{},"assumptions":[],"errors":[f"bars 不足：建议至少 {need} 根"],"meta":{}}
    dates=[str(b.get("date","")) for b in bars]
    close=[float(b["close"]) for b in bars]
    sym=str(bars[0].get("symbol",""))
    pct=[0.0]+[close[i]/close[i-1]-1.0 if close[i-1] else 0.0 for i in range(1,len(close))]
    turnover=[]
    for b in bars:
        if b.get("turnover") is not None: turnover.append(float(b["turnover"]))
        elif b.get("turnover_rate") is not None: turnover.append(float(b["turnover_rate"]))
        else:
            turnover.append(float(b.get("volume") or 0.0))
    if all(b.get("turnover") is None and b.get("turnover_rate") is None for b in bars):
        assumptions.append("无 turnover：用 volume 代理并归一化")
        m=_mean([t for t in turnover if t>0]) or 1.0
        turnover=[t/m for t in turnover]
    kernel=[None]*len(bars)
    for i in range(period-1,len(bars)):
        vol=_std(pct[i+1-period:i+1]); to=_mean(turnover[i+1-period:i+1])
        kernel[i]= (vol/to) if to and to>0 else None
    signal_vals=[]; kernel_ma=[None]*len(bars)
    for i in range(len(bars)):
        if i+1 < period+ma_win or kernel[i] is None:
            signal_vals.append(0.0); continue
        chunk=[k for k in kernel[i+1-ma_win:i+1] if k is not None]
        if len(chunk)<max(2,ma_win//2):
            signal_vals.append(0.0); continue
        ma=_mean(chunk); kernel_ma[i]=ma; k=kernel[i]
        if method=="BBANDS":
            sd=_std(chunk); up=ma+2*sd; lo=ma-2*sd
            signal_vals.append(1.0 if k<=lo else (-1.0 if k>=up else 0.0))
        else:
            signal_vals.append(1.0 if k<ma else (-1.0 if k>ma else 0.0))
    assumptions.append(f"kernel=std(pct,{period})/mean(turnover,{period})；{method}：kernel 低于均线/下轨偏牛")
    assumptions.append("CSCV 过拟合框架未纳入本脚本")
    return {"ok":True,"skill":SKILL,
        "signal":[{"date":d,"symbol":sym,"value":v} for d,v in zip(dates,signal_vals)],
        "series":{"kernel":[{"date":d,"value":v} for d,v in zip(dates,kernel) if v is not None],
                  "kernel_ma":[{"date":d,"value":v} for d,v in zip(dates,kernel_ma) if v is not None]},
        "metrics":{"bars":len(bars),"symbol":sym,"period":period,"method":method,
                   "last_kernel":next((v for v in reversed(kernel) if v is not None),None),
                   "last_signal":signal_vals[-1] if signal_vals else 0.0,
                   "bull_days":sum(1 for v in signal_vals if v>0),"bear_days":sum(1 for v in signal_vals if v<0),
                   "sample_note":"示意样本统计，非实盘胜率"},
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
