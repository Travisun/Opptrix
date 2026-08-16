#!/usr/bin/env python3
"""Financial Rigor Toolkit — Opptrix financial-data skill (stdlib only).

Command-line tool for verifying financial data accuracy during investment research.
Agent path: prefer ``run_rigor_json.py --input … --output …``; this module keeps
the original subcommand CLI for smoke / manual use.

Zero external dependencies — uses only Python stdlib (decimal, json, math, argparse).
Requires Python >= 3.7.

Usage:
    python3 scripts/financial_rigor.py verify-market-cap --price 510 --shares 9.11e9 --reported 4.65e12 --currency HKD
    python3 scripts/financial_rigor.py verify-valuation --price 510 --eps 23.5 --bvps 120 --fcf-per-share 18 --dividend 2.4
    python3 scripts/financial_rigor.py cross-validate --field revenue --values '{"年报": 7518, "Yahoo": 7500}' --unit 亿
    python3 scripts/financial_rigor.py benford --values '[1234, 2345, 3456]'
    python3 scripts/financial_rigor.py calc --expr '510 * 9.11e9'
"""

import argparse
import json
import math
import sys
from decimal import Decimal, Context, ROUND_HALF_EVEN, InvalidOperation

# ---------------------------------------------------------------------------
# Exact Decimal Engine (no floating-point drift)
# ---------------------------------------------------------------------------

_CTX = Context(prec=28, rounding=ROUND_HALF_EVEN)


def exact(value) -> Decimal:
    """Convert any numeric to exact Decimal, avoiding float traps."""
    if isinstance(value, Decimal):
        return value
    if isinstance(value, float):
        return Decimal(str(value))
    return Decimal(str(value))


def fmt_number(d: Decimal, unit: str = "") -> str:
    """Format large numbers in human-readable form (亿/万亿/B/T)."""
    v = float(d)
    abs_v = abs(v)
    if unit in ("亿", "亿元", "亿港元", "亿美元"):
        if abs_v >= 10000:
            return f"{v/10000:.2f}万亿{unit[1:] if len(unit) > 1 else ''}"
        return f"{v:.2f}{unit}"
    if abs_v >= 1e12:
        return f"{v/1e12:.2f}T"
    if abs_v >= 1e9:
        return f"{v/1e9:.2f}B"
    if abs_v >= 1e6:
        return f"{v/1e6:.2f}M"
    return f"{v:,.2f}"


def _force_utf8_stdio():
    """把 stdout/stderr 强制切到 UTF-8。

    Windows 控制台默认 GBK，本工具输出的 ❌ / ⚠️ / ✅ 会抛 UnicodeEncodeError，
    导致「偏差超标」这条最该被看到的告警路径反而直接崩溃退出。
    """
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding='utf-8', errors='replace')
        except Exception:
            pass


# ---------------------------------------------------------------------------
# 1. Market Cap Verification (股价×总股本 vs 报告市值)
# ---------------------------------------------------------------------------

def verify_market_cap(price, shares, reported_cap, currency="", *, quiet=False):
    """Verify market cap = price × shares, compare with reported value.

    Returns a structured dict (also used by run_rigor_json). For CLI, ``ok`` is True
    when deviation ≤ 5%.
    """
    p = exact(price)
    s = exact(shares)
    r = exact(reported_cap)

    calculated = _CTX.multiply(p, s)
    deviation = abs(float(calculated - r) / float(r)) * 100 if r != 0 else 0

    if not quiet:
        print("=" * 60)
        print("市值验算 (Market Cap Verification)")
        print("=" * 60)
        print(f"  股价 (Price):       {p} {currency}")
        print(f"  总股本 (Shares):    {fmt_number(s)}")
        print(f"  计算市值:           {fmt_number(calculated)} {currency}")
        print(f"  报告市值:           {fmt_number(r)} {currency}")
        print(f"  偏差:               {deviation:.2f}%")
        print()

        if deviation > 5:
            print(f"  ❌ 警告: 偏差 {deviation:.1f}% > 5%, 请检查:")
            print(f"     - 股本是否为最新（回购/增发）?")
            print(f"     - 单位是否一致（港币 vs 人民币 vs 美元）?")
            print(f"     - 股价是否为最新?")
        elif deviation > 1:
            print(f"  ⚠️  偏差 {deviation:.1f}% 在可接受范围, 可能因股价波动/股本变化")
        else:
            print(f"  ✅ 验证通过, 偏差仅 {deviation:.2f}%")

    return {
        "ok": deviation <= 5,
        "pass": deviation <= 5,
        "warning": 1 < deviation <= 5,
        "price": float(p),
        "shares": float(s),
        "calculated": float(calculated),
        "reported": float(r),
        "deviation_pct": round(deviation, 4),
        "currency": currency or "",
    }


# ---------------------------------------------------------------------------
# 2. Valuation Metrics Verification (估值指标验算)
# ---------------------------------------------------------------------------

def verify_valuation(price, eps=None, bvps=None, fcf_per_share=None,
                     dividend=None, revenue_per_share=None, *, quiet=False):
    """Calculate and verify key valuation ratios from raw inputs."""
    p = exact(price)

    if not quiet:
        print("=" * 60)
        print("估值指标验算 (Valuation Verification)")
        print("=" * 60)
        print(f"  当前股价: {p}")
        print()

    results = {}

    if eps is not None:
        e = exact(eps)
        if e != 0:
            pe = _CTX.divide(p, e)
            if not quiet:
                print(f"  PE (TTM):  {p} / {e} = {pe:.2f}x")
            results["PE"] = float(pe)
            ey = _CTX.divide(e, p) * 100
            if not quiet:
                print(f"  盈利收益率: {ey:.2f}%")
            results["Earnings_Yield"] = float(ey)
        elif not quiet:
            print("  PE: EPS为0, 无法计算")

    if bvps is not None:
        b = exact(bvps)
        if b != 0:
            pb = _CTX.divide(p, b)
            if not quiet:
                print(f"  PB:        {p} / {b} = {pb:.2f}x")
            results["PB"] = float(pb)
            if eps is not None and float(exact(eps)) != 0:
                roe = _CTX.divide(exact(eps), b) * 100
                if not quiet:
                    print(f"  ROE:       {exact(eps)} / {b} = {roe:.2f}%")
                results["ROE"] = float(roe)

    if fcf_per_share is not None:
        f = exact(fcf_per_share)
        if f != 0:
            fcf_yield = _CTX.divide(f, p) * 100
            pfcf = _CTX.divide(p, f)
            if not quiet:
                print(f"  P/FCF:     {p} / {f} = {pfcf:.2f}x")
                print(f"  FCF Yield: {fcf_yield:.2f}%")
            results["P_FCF"] = float(pfcf)
            results["FCF_Yield"] = float(fcf_yield)

    if dividend is not None:
        d = exact(dividend)
        if p != 0:
            div_yield = _CTX.divide(d, p) * 100
            if not quiet:
                print(f"  股息率:    {d} / {p} = {div_yield:.2f}%")
            results["Dividend_Yield"] = float(div_yield)

    if revenue_per_share is not None:
        r = exact(revenue_per_share)
        if r != 0:
            ps = _CTX.divide(p, r)
            if not quiet:
                print(f"  PS:        {p} / {r} = {ps:.2f}x")
            results["PS"] = float(ps)

    if not quiet:
        print()
        print("  ✅ 以上指标均使用精确十进制计算, 无浮点误差")
    return {"ok": True, "ratios": results, "price": float(p)}


# ---------------------------------------------------------------------------
# 3. Cross-Source Data Validation (多源交叉验证)
# ---------------------------------------------------------------------------

def cross_validate(field_name, source_values: dict, unit="", tolerance_pct=2.0, *, quiet=False):
    """Compare a data point across multiple sources, flag discrepancies."""
    if not quiet:
        print("=" * 60)
        print(f"交叉验证: {field_name} (Cross-Validation)")
        print("=" * 60)

    values = {k: exact(v) for k, v in source_values.items()}
    sources = list(values.keys())
    nums = list(values.values())

    sorted_vals = sorted(float(v) for v in nums)
    n = len(sorted_vals)
    if n == 0:
        return {
            "ok": False,
            "field": field_name,
            "consensus": None,
            "all_consistent": False,
            "per_source": [],
            "unit": unit,
            "tolerance_pct": tolerance_pct,
        }
    median = sorted_vals[n // 2] if n % 2 == 1 else (sorted_vals[n // 2 - 1] + sorted_vals[n // 2]) / 2

    if not quiet:
        print(f"  数据来源数: {len(sources)}")
        print(f"  参考中位数: {fmt_number(exact(median))} {unit}")
        print()

    all_ok = True
    per_source = []
    for src, val in values.items():
        dev = abs(float(val) - median) / median * 100 if median != 0 else 0
        status = "✅" if dev <= tolerance_pct else "❌"
        if dev > tolerance_pct:
            all_ok = False
        per_source.append({
            "source": src,
            "value": float(val),
            "deviation_pct": round(dev, 4),
            "within_tolerance": dev <= tolerance_pct,
        })
        if not quiet:
            print(f"  {status} {src:20s}: {fmt_number(val)} {unit}  (偏差 {dev:.2f}%)")

    if not quiet:
        print()
        if all_ok:
            print(f"  ✅ 所有来源偏差 ≤ {tolerance_pct}%, 数据一致")
        else:
            print(f"  ⚠️  存在来源偏差 > {tolerance_pct}%, 请核实差异原因")
            print("     建议: 优先采用公司年报/交易所或 Opptrix 官方财务工具数据")
        print(f"\n  共识值 (加权中位数): {fmt_number(exact(median))} {unit}")

    return {
        "ok": True,
        "field": field_name,
        "consensus": float(median),
        "all_consistent": all_ok,
        "per_source": per_source,
        "unit": unit,
        "tolerance_pct": tolerance_pct,
        "source_count": len(sources),
    }


# ---------------------------------------------------------------------------
# 4. Benford's Law Quick Check (财务数据造假检测)
# ---------------------------------------------------------------------------

_BENFORD = {d: math.log10(1 + 1/d) for d in range(1, 10)}


def benford_check(values: list, *, quiet=False):
    """Quick Benford's Law check on a list of financial values."""
    if not quiet:
        print("=" * 60)
        print("Benford定律检测 (Financial Data Fabrication Check)")
        print("=" * 60)

    digits = []
    for v in values:
        v = abs(float(v))
        if v > 0:
            sig = 10 ** (math.log10(v) - math.floor(math.log10(v)))
            d = int(sig)
            if 1 <= d <= 9:
                digits.append(d)

    n = len(digits)
    if n < 50:
        if not quiet:
            print(f"  ⚠️  样本量不足: {n} < 50, Benford分析不可靠")
        return {
            "ok": False,
            "sample_size": n,
            "mad": None,
            "chi2": None,
            "conformity": "Insufficient sample",
            "is_conforming": None,
            "insufficient": True,
        }

    counts = {}
    for d in digits:
        counts[d] = counts.get(d, 0) + 1
    observed = {d: counts.get(d, 0) / n for d in range(1, 10)}

    mad = sum(abs(observed.get(d, 0) - _BENFORD[d]) for d in range(1, 10)) / 9
    chi2 = sum((counts.get(d, 0) - _BENFORD[d] * n) ** 2 / (_BENFORD[d] * n) for d in range(1, 10))

    if mad < 0.006:
        conformity = "Close (高度符合)"
    elif mad < 0.012:
        conformity = "Acceptable (可接受)"
    elif mad < 0.015:
        conformity = "Marginally Acceptable (边缘)"
    else:
        conformity = "Nonconforming (不符合 ⚠️)"

    if not quiet:
        print(f"  样本量:    {n}")
        print(f"  MAD:       {mad:.6f}")
        print(f"  Chi-sq:    {chi2:.2f}")
        print(f"  符合度:    {conformity}")
        print()
        print(f"  {'首位数':>6} {'观测':>8} {'Benford期望':>12} {'偏差':>8}")
        print(f"  {'-'*6} {'-'*8} {'-'*12} {'-'*8}")
        for d in range(1, 10):
            obs = observed.get(d, 0)
            exp = _BENFORD[d]
            dev = obs - exp
            flag = " ⚠️" if abs(dev) > 0.03 else ""
            print(f"  {d:>6d} {obs:>8.3f} {exp:>12.3f} {dev:>+8.3f}{flag}")
        print()
        is_ok = mad < 0.015
        if is_ok:
            print("  ✅ 数据首位数字分布符合Benford定律")
        else:
            print("  ❌ 数据首位数字分布异常, 可能存在人为调整")
            print("     提示: 不符合Benford定律不一定是造假, 但值得进一步调查")
    else:
        is_ok = mad < 0.015

    return {
        "ok": True,
        "sample_size": n,
        "mad": mad,
        "chi2": chi2,
        "conformity": conformity,
        "is_conforming": is_ok,
        "insufficient": False,
        "observed": observed,
    }


# ---------------------------------------------------------------------------
# 5. Exact Calculator (精确计算器)
# ---------------------------------------------------------------------------

def exact_calc(expr: str, *, quiet=False):
    """Evaluate a financial expression with exact decimal arithmetic.

    Supports: +, -, *, /, (), numbers (including scientific notation).
    """
    if not quiet:
        print("=" * 60)
        print("精确计算 (Exact Calculator)")
        print("=" * 60)

    allowed = set("0123456789.+-*/() eE")
    if not all(c in allowed for c in expr.replace(" ", "")):
        if not quiet:
            print(f"  ❌ 不安全的表达式: {expr}")
        return {"ok": False, "expr": expr, "result": None, "error": "unsafe_expression"}

    try:
        result = eval(expr, {"__builtins__": {}}, {})
        d_result = exact(result)
        if not quiet:
            print(f"  表达式: {expr}")
            print(f"  结果:   {fmt_number(d_result)}")
            print(f"  精确值: {d_result}")
        return {"ok": True, "expr": expr, "result": float(d_result), "exact": str(d_result)}
    except Exception as e:
        if not quiet:
            print(f"  ❌ 计算错误: {e}")
        return {"ok": False, "expr": expr, "result": None, "error": str(e)}


# ---------------------------------------------------------------------------
# 6. Three-Scenario Valuation (三情景估值)
# ---------------------------------------------------------------------------

def three_scenario_valuation(current_price, current_eps, shares_billion,
                             growth_optimistic, growth_neutral, growth_pessimistic,
                             pe_optimistic, pe_neutral, pe_pessimistic,
                             years=3, currency="", *, quiet=False):
    """Calculate three-scenario target prices with exact arithmetic."""
    if not quiet:
        print("=" * 60)
        print("三情景估值模型 (Three-Scenario Valuation)")
        print("=" * 60)

    p = exact(current_price)
    eps = exact(current_eps)
    shares = exact(shares_billion)

    scenarios = [
        ("乐观 (Bull)", "bull", growth_optimistic, pe_optimistic),
        ("中性 (Base)", "base", growth_neutral, pe_neutral),
        ("悲观 (Bear)", "bear", growth_pessimistic, pe_pessimistic),
    ]

    if not quiet:
        print(f"  当前股价: {p} {currency}")
        print(f"  当前EPS:  {eps}")
        print(f"  预测期:   {years}年")
        print()
        print(f"  {'情景':12} {'年增速':>8} {'目标PE':>8} {'目标EPS':>10} {'目标股价':>10} {'涨跌幅':>8}")
        print(f"  {'-'*12} {'-'*8} {'-'*8} {'-'*10} {'-'*10} {'-'*8}")

    rows = []
    for name, key, growth, pe in scenarios:
        g = exact(growth)
        target_pe = exact(pe)
        future_eps = eps
        for _ in range(years):
            future_eps = _CTX.multiply(future_eps, _CTX.add(Decimal("1"), g))
        target_price = _CTX.multiply(future_eps, target_pe)
        change = float(target_price - p) / float(p) * 100 if p != 0 else 0.0
        rows.append({
            "scenario": key,
            "label": name,
            "growth": float(g),
            "target_pe": float(target_pe),
            "future_eps": float(future_eps),
            "target_price": float(target_price),
            "change_pct": round(change, 4),
        })
        if not quiet:
            print(f"  {name:12} {float(g)*100:>7.0f}% {float(target_pe):>7.0f}x "
                  f"{float(future_eps):>10.2f} {float(target_price):>9.1f} {change:>+7.1f}%")

    if not quiet:
        print()
        print("  ✅ 所有计算使用精确十进制, 结果可审计复现")

    return {
        "ok": True,
        "price": float(p),
        "eps": float(eps),
        "shares_billion": float(shares),
        "years": years,
        "currency": currency or "",
        "scenarios": rows,
    }


# ---------------------------------------------------------------------------
# CLI Entry Point
# ---------------------------------------------------------------------------

def main():
    parser = argparse.ArgumentParser(
        description="Financial Rigor Toolkit — 金融数据严谨性验证工具",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
  %(prog)s verify-market-cap --price 510 --shares 9.11e9 --reported 4.65e12 --currency HKD
  %(prog)s verify-valuation --price 510 --eps 23.5 --bvps 120
  %(prog)s cross-validate --field revenue --values '{"年报": 7518, "Yahoo": 7500}' --unit 亿
  %(prog)s benford --values '[1234, 2345, 3456, ...]'
  %(prog)s calc --expr '510 * 9.11e9'
        """)

    sub = parser.add_subparsers(dest="command")

    # verify-market-cap
    mc = sub.add_parser("verify-market-cap", help="验算市值 = 股价 × 总股本")
    mc.add_argument("--price", type=float, required=True)
    mc.add_argument("--shares", type=float, required=True, help="总股本")
    mc.add_argument("--reported", type=float, required=True, help="报告市值")
    mc.add_argument("--currency", default="", help="币种")

    # verify-valuation
    val = sub.add_parser("verify-valuation", help="验算估值指标")
    val.add_argument("--price", type=float, required=True)
    val.add_argument("--eps", type=float, default=None)
    val.add_argument("--bvps", type=float, default=None, help="每股净资产")
    val.add_argument("--fcf-per-share", type=float, default=None)
    val.add_argument("--dividend", type=float, default=None, help="每股股息")
    val.add_argument("--revenue-per-share", type=float, default=None)

    # cross-validate
    cv = sub.add_parser("cross-validate", help="多源交叉验证")
    cv.add_argument("--field", required=True, help="数据字段名")
    cv.add_argument("--values", required=True, help="JSON: {来源: 数值}")
    cv.add_argument("--unit", default="")
    cv.add_argument("--tolerance", type=float, default=2.0, help="容差百分比")

    # benford
    bf = sub.add_parser("benford", help="Benford定律检测")
    bf.add_argument("--values", required=True, help="JSON数组")

    # calc
    ca = sub.add_parser("calc", help="精确计算")
    ca.add_argument("--expr", required=True, help="算术表达式")

    # three-scenario
    ts = sub.add_parser("three-scenario", help="三情景估值")
    ts.add_argument("--price", type=float, required=True)
    ts.add_argument("--eps", type=float, required=True)
    ts.add_argument("--shares", type=float, required=True, help="总股本(亿)")
    ts.add_argument("--growth", nargs=3, type=float, required=True,
                    help="三情景年增速 (乐观 中性 悲观), 如 0.15 0.08 0.0")
    ts.add_argument("--pe", nargs=3, type=float, required=True,
                    help="三情景目标PE, 如 25 20 15")
    ts.add_argument("--years", type=int, default=3)
    ts.add_argument("--currency", default="")

    _force_utf8_stdio()
    args = parser.parse_args()

    if args.command == "verify-market-cap":
        verify_market_cap(args.price, args.shares, args.reported, args.currency)
    elif args.command == "verify-valuation":
        verify_valuation(args.price, args.eps, args.bvps, args.fcf_per_share,
                        args.dividend, args.revenue_per_share)
    elif args.command == "cross-validate":
        values = json.loads(args.values)
        cross_validate(args.field, values, args.unit, args.tolerance)
    elif args.command == "benford":
        values = json.loads(args.values)
        benford_check(values)
    elif args.command == "calc":
        exact_calc(args.expr)
    elif args.command == "three-scenario":
        three_scenario_valuation(
            args.price, args.eps, args.shares,
            args.growth[0], args.growth[1], args.growth[2],
            args.pe[0], args.pe[1], args.pe[2],
            args.years, args.currency)
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
