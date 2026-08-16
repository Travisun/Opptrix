#!/usr/bin/env python3
"""申万罗伯·瑞克超额现金流选股规则。纯 stdlib。"""
from __future__ import annotations
import argparse, json, math, sys
from collections import defaultdict
from typing import Any, Dict, List, Optional, Sequence

SKILL = "sw-excess-cashflow-screen"

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
    fins=list((payload.get("panels") or {}).get("financials") or [])
    bars=list(payload.get("bars") or [])
    # latest close by symbol
    last_close={}
    for b in sorted(bars, key=lambda x:str(x.get("date",""))):
        last_close[str(b.get("symbol",""))]=float(b["close"])
    assumptions=["规则近似申万大师系列十三：PB、股息、PE、借款/总资产、价格/FCFF",
                 "财务字段由 Agent 写入 panels.financials；脚本不联网"]
    if not fins:
        return {"ok":False,"skill":SKILL,"signal":[],"series":{},"metrics":{},"assumptions":assumptions,
                "errors":["缺少 panels.financials"],"meta":{}}
    # enrich c_fcff = close/fcff
    rows=[]
    for r in fins:
        if not isinstance(r,dict): continue
        s=str(r.get("symbol",""))
        pb=r.get("pb"); pe=r.get("pe_ttm", r.get("pe")); dv=r.get("dv_ttm", r.get("dividend_yield"))
        borr=r.get("borr2total")
        if borr is None and r.get("total_assets"):
            lt=float(r.get("lt_borr") or 0); st=float(r.get("st_borr") or 0)
            ta=float(r["total_assets"])
            borr=(lt+st)/ta if ta else None
        fcff=r.get("fcff") or r.get("free_cash_flow")
        close=r.get("close") or last_close.get(s)
        c_fcff=None
        if close is not None and fcff not in (None,0):
            c_fcff=float(close)/float(fcff)
        rows.append({"symbol":s,"pb":pb,"pe_ttm":pe,"dv_ttm":dv,"borr2total":borr,"c_fcff":c_fcff,
                     "fcff":fcff,"close":close})
    # market means among available
    dvs=[float(r["dv_ttm"]) for r in rows if r["dv_ttm"] is not None]
    pes=[float(r["pe_ttm"]) for r in rows if r["pe_ttm"] is not None]
    cfs=[float(r["c_fcff"]) for r in rows if r["c_fcff"] is not None]
    mean_dv=_mean(dvs) if dvs else None
    mean_pe=_mean(pes) if pes else None
    mean_cf=_mean(cfs)*0.8 if cfs else None
    if mean_dv is None:
        assumptions.append("缺股息字段：跳过股息条件")
    if mean_cf is None:
        assumptions.append("缺 FCFF/close：跳过价格现金流条件")
    passed=[]; failed=[]
    for r in rows:
        reasons=[]
        ok=True
        if r["pb"] is None or float(r["pb"])>=3: ok=False; reasons.append("pb")
        if mean_dv is not None:
            if r["dv_ttm"] is None or float(r["dv_ttm"])<=mean_dv: ok=False; reasons.append("dv_ttm")
        if mean_pe is not None:
            if r["pe_ttm"] is None or float(r["pe_ttm"])>=mean_pe: ok=False; reasons.append("pe_ttm")
        if r["borr2total"] is None or float(r["borr2total"])>=0.33: ok=False; reasons.append("borr2total")
        if mean_cf is not None:
            if r["c_fcff"] is None or float(r["c_fcff"])>=mean_cf: ok=False; reasons.append("c_fcff")
        item={**r,"pass":ok,"fail_reasons":reasons,"value":1.0 if ok else 0.0}
        (passed if ok else failed).append(item)
    signal=[{"symbol":r["symbol"],"value":1.0,"pb":r["pb"],"pe_ttm":r["pe_ttm"],"dv_ttm":r["dv_ttm"],
             "borr2total":r["borr2total"],"c_fcff":r["c_fcff"]} for r in passed]
    return {"ok":True,"skill":SKILL,"signal":signal,
        "series":{"screened":signal,"rejected":[{"symbol":r["symbol"],"reasons":r["fail_reasons"]} for r in failed]},
        "metrics":{"candidates":len(rows),"passed":len(passed),"rejected":len(failed),
                   "thresholds":{"pb_lt":3,"dv_gt_mean":mean_dv,"pe_lt_mean":mean_pe,"borr2total_lt":0.33,"c_fcff_lt":mean_cf},
                   "sample_note":"规则筛选示意，非投资建议"},
        "assumptions":assumptions,"errors":[],"meta":{"degraded":mean_dv is None or mean_cf is None}}

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
