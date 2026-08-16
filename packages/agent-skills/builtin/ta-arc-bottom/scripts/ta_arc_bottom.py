#!/usr/bin/env python3
"""圆弧底形态识别（规则版，无 scipy/talib）。纯 stdlib。"""
from __future__ import annotations
import argparse, json, math, sys
from collections import defaultdict
from typing import Any, Dict, List, Optional, Sequence

SKILL = "ta-arc-bottom"


def _data_meta(data_mode: str, used: list[str], missing: list[str] | None = None, **extra: Any) -> dict[str, Any]:
    mode = data_mode if data_mode in ("full", "proxy", "insufficient") else "proxy"
    out: dict[str, Any] = {
        "data_mode": mode,
        "degraded": mode == "proxy",
        "used_inputs": list(used),
        "missing_for_full": list(missing or []),
    }
    out.update(extra)
    return out

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

def local_extrema(xs, order=5):
    mins=[]; maxs=[]
    for i in range(order, len(xs)-order):
        w=xs[i-order:i+order+1]
        if xs[i]==min(w): mins.append(i)
        if xs[i]==max(w): maxs.append(i)
    return mins, maxs

def smooth(xs, bw=3):
    # simple moving average as smooth proxy
    out=[]; w=max(1,int(bw))
    for i in range(len(xs)):
        a=max(0,i-w); b=i+w+1
        out.append(_mean(xs[a:b]))
    return out

def run(payload):
    params=payload.get("params") or {}
    order=int(params.get("order") or 5)
    thr_d=int(params.get("threshold_d") or 10)
    thr_s=float(params.get("threshold_s") or 0.4)
    thr_r=float(params.get("threshold_r") or 0.03)
    ma_n=int(params.get("ma") or 60)
    bars=sorted(pick_symbol_bars(list(payload.get("bars") or []), params.get("symbol")), key=lambda b:str(b.get("date","")))
    if len(bars)<max(80, ma_n+20):
        return {"ok":False,"skill":SKILL,"signal":[],"series":{},"metrics":{},"assumptions":[],"errors":["bars 不足：建议≥80"],"meta":{}}
    dates=[str(b.get("date","")) for b in bars]
    close=[float(b["close"]) for b in bars]
    sym=str(bars[0].get("symbol",""))
    sm=smooth(close, 3)
    mins,maxs=local_extrema(sm, order)
    assumptions=["局部极值用滑动窗口代替 scipy.argrelmin/max","均线用简单均线代替 EMA200（样本短时用 params.ma）"]
    pattern=False; buy=False; feat={}
    if mins and maxs:
        local_min=mins[-1]
        prev_maxs=[m for m in maxs if m<local_min]
        if prev_maxs:
            prev_max=prev_maxs[-1]
            # price-based local max between prev_max and local_min
            seg=close[prev_max:local_min+1]
            local_max=prev_max+seg.index(max(seg))
            p_min=close[local_min]; p_max=max(close[prev_max:local_min+1]); p_cur=close[-1]
            p_right_max=max(close[local_min:]) if local_min<len(close) else p_cur
            d_left=local_min-local_max; d_right=len(close)-local_min
            pct=[0.0]+[close[i]/close[i-1]-1 for i in range(1,len(close))]
            s_left=pct[local_max:local_min]; s_right=pct[local_min:]
            s_left_r=(sum(1 for x in s_left if x<0)/len(s_left)) if s_left else 0
            s_right_r=(sum(1 for x in s_right if x>0)/len(s_right)) if s_right else 0
            r_left=abs(_mean(s_left)) if s_left else 0; r_right=abs(_mean(s_right)) if s_right else 0
            p_left=(p_max/p_min-1)/d_left if d_left else 999
            p_right=(p_cur/p_min-1)/d_right if d_right else 999
            cond_x1=(p_cur>=p_right_max) and (p_cur<=p_max)
            cond_a=(d_left>thr_d) and (d_right>thr_d)
            cond_b=(s_left_r>thr_s) and (s_right_r>thr_s)
            cond_c=(r_left<thr_r) and (r_right<thr_r)
            cond_d=(p_left<thr_r) and (p_right<thr_r)
            pattern=bool(cond_x1 and cond_a and cond_b and cond_c and cond_d)
            ma=_mean(close[-ma_n:]) if len(close)>=ma_n else _mean(close)
            thr_p=0.3
            cond_e=p_cur>=ma
            cond_f=((1-thr_p)*(p_max-p_min) < (p_cur-p_min) < (1+thr_p)*(p_max-p_min))
            buy=bool(pattern and cond_e and cond_f)
            feat={"local_min_idx":local_min,"local_max_idx":local_max,"p_min":p_min,"p_max":p_max,
                  "d_left":d_left,"d_right":d_right,"s_left_ratio":s_left_r,"s_right_ratio":s_right_r}
    # rolling scan last point signal only for latest; also mark history lightly
    signal_vals=[0.0]*len(close)
    signal_vals[-1]=1.0 if buy else (0.5 if pattern else 0.0)
    return {"ok":True,"skill":SKILL,
        "signal":[{"date":dates[-1],"symbol":sym,"value":signal_vals[-1],"pattern":pattern,"buy_zone":buy}],
        "series":{"close":[{"date":d,"value":v} for d,v in zip(dates,close)],
                  "smooth":[{"date":d,"value":v} for d,v in zip(dates,sm)]},
        "metrics":{"bars":len(bars),"symbol":sym,"pattern":pattern,"buy_zone":buy,"features":feat,
                   "sample_note":"形态规则示意，非实盘信号胜率"},
        "assumptions":assumptions,"errors":[],
        "meta": (
            _data_meta("full", ["panels.arc_features"], [])
            if isinstance((payload.get("panels") or {}).get("arc_features"), list)
            else _data_meta("full", ["bars.ohlcv"], [])
        )}

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
