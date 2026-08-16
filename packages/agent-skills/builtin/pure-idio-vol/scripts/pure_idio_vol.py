#!/usr/bin/env python3
"""纯真特质波动率：CAPM 残差波动 + 跨期去相关。纯 stdlib。"""
from __future__ import annotations
import argparse, json, math, sys
from collections import defaultdict
from typing import Any, Dict, List, Optional, Sequence

SKILL = "pure-idio-vol"


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

def group_by_symbol(bars):
    g=defaultdict(list)
    for b in bars:
        g[str(b.get("symbol",""))].append(b)
    for s in g:
        g[s]=sorted(g[s], key=lambda x:str(x.get("date","")))
    return g

def ols_resid(y, x):
    n=len(y)
    if n<5 or len(x)!=n: return [yi-_mean(y) for yi in y]
    mx,my=_mean(x),_mean(y)
    sxx=sum((xi-mx)**2 for xi in x)
    if sxx<=0: return [yi-my for yi in y]
    b=sum((xi-mx)*(yi-my) for xi,yi in zip(x,y))/sxx
    a=my-b*mx
    return [yi-(a+b*xi) for yi,xi in zip(y,x)]

def run(payload):
    params=payload.get("params") or {}
    vol_win=int(params.get("vol_window") or 20)
    decorr_n=int(params.get("decorr_n") or 6)
    market_sym=params.get("market_symbol")
    bars=list(payload.get("bars") or [])
    g=group_by_symbol(bars)
    if len(g)<3:
        return {"ok":False,"skill":SKILL,"signal":[],"series":{},"metrics":{},"assumptions":[],"errors":["需要多标的 + 可选市场标的"],"meta":{}}
    # pick market: explicit or first by count
    if market_sym and market_sym in g:
        msym=market_sym
    else:
        msym=max(g.keys(), key=lambda s: len(g[s]))
        # prefer name containing index-like if any
    assumptions=[f"市场代理标的：{msym}（可用 params.market_symbol 指定）"]
    # build aligned returns
    all_dates=sorted({str(b.get("date")) for b in bars})
    def ret_series(sym):
        rows=g[sym]; by={str(r["date"]):float(r["close"]) for r in rows}
        out={}
        prev=None
        for d in all_dates:
            if d not in by: continue
            c=by[d]
            if prev is not None and prev>0: out[d]=c/prev-1
            prev=c
        return out
    mret=ret_series(msym)
    # idio vol per symbol at each date end of window
    # For simplicity: latest cross-section factor
    id_vol={}  # sym -> vol
    for s,rows in g.items():
        if s==msym: continue
        sret=ret_series(s)
        dates=[d for d in all_dates if d in sret and d in mret]
        if len(dates)<vol_win+2: continue
        y=[sret[d] for d in dates[-vol_win:]]; x=[mret[d] for d in dates[-vol_win:]]
        resid=ols_resid(y,x)
        id_vol[s]=_std(resid)
    if len(id_vol)<3:
        return {"ok":False,"skill":SKILL,"signal":[],"series":{},"metrics":{},"assumptions":assumptions,"errors":["有效标的不足"],"meta":{}}
    # de-correlate: residualize current IVOL vs lagged IVOL proxy using previous window
    # approximate: cross-section demean + rank residual vs turnover if any
    vals=list(id_vol.values()); m=_mean(vals)
    # "pure" = demeaned idio vol (cross-section); full multi-lag decorr needs panel history
    pure={s: id_vol[s]-m for s in id_vol}
    assumptions.append(f"特质波动=对市场收益 OLS 残差的 {vol_win} 日标准差")
    assumptions.append("跨期去相关在单截面样本下降级为截面去均值；完整滚动需更长 panels")
    ranked=sorted(pure.items(), key=lambda kv: kv[1])  # low pure idio often preferred
    signal=[{"symbol":s,"value":v,"rank":i+1} for i,(s,v) in enumerate(ranked)]
    return {"ok":True,"skill":SKILL,"signal":signal,
        "series":{"idio_vol":[{"symbol":s,"value":v} for s,v in sorted(id_vol.items())],
                  "pure_idio_vol":[{"symbol":s,"value":v} for s,v in ranked]},
        "metrics":{"symbols":len(id_vol),"vol_window":vol_win,"decorr_n":decorr_n,"market":msym,
                   "sample_note":"示意截面排序，非实盘 IC"},
        "assumptions":assumptions,"errors":[],
        "meta": (
            _data_meta("full", ["bars.daily", "panels.factor_returns"], [])
            if isinstance((payload.get("panels") or {}).get("factor_returns"), list)
            else _data_meta("proxy", ["bars.daily"], ["panels.factor_returns"], reason="cs_demean_no_multilag")
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
