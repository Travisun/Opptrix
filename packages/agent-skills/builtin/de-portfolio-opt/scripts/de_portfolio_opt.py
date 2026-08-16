#!/usr/bin/env python3
"""差分进化（DE）组合优化 纯 stdlib。"""
from __future__ import annotations

import argparse
import json
import math
import sys
from collections import defaultdict
from typing import Any

SKILL = "de-portfolio-opt"

def _mean(xs: list[float]) -> float:
    return sum(xs) / len(xs) if xs else float("nan")


def _std(xs: list[float]) -> float:
    if len(xs) < 2:
        return float("nan")
    m = _mean(xs)
    var = sum((x - m) ** 2 for x in xs) / (len(xs) - 1)
    return math.sqrt(var) if var > 0 else 0.0


def _safe_ret(c0: float, c1: float) -> float | None:
    if c0 <= 0 or c1 <= 0:
        return None
    r = c1 / c0 - 1.0
    return r if math.isfinite(r) else None

def _load_bars(payload: dict[str, Any], need: tuple[str, ...] = ("close",)) -> list[dict[str, Any]]:
    bars = payload.get("bars")
    if not isinstance(bars, list) or not bars:
        raise ValueError("input.bars 须为非空数组")
    out: list[dict[str, Any]] = []
    for b in bars:
        if not isinstance(b, dict):
            continue
        row: dict[str, Any] = {
            "date": str(b.get("date") or ""),
            "symbol": str(b.get("symbol") or ""),
        }
        ok = True
        for k in need:
            try:
                v = float(b[k])
            except (KeyError, TypeError, ValueError):
                ok = False
                break
            if not math.isfinite(v):
                ok = False
                break
            row[k] = v
        if not ok:
            continue
        if "close" in row and row["close"] <= 0:
            continue
        out.append(row)
    if not out:
        raise ValueError("无有效 bars")
    out.sort(key=lambda r: (r["symbol"], r["date"]))
    return out


def _by_symbol(bars: list[dict[str, Any]]) -> dict[str, list[dict[str, Any]]]:
    d: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for b in bars:
        d[b["symbol"]].append(b)
    return d


def _daily_rets(rows: list[dict[str, Any]]) -> tuple[list[str], list[float]]:
    dates: list[str] = []
    rets: list[float] = []
    for i in range(1, len(rows)):
        r = _safe_ret(rows[i - 1]["close"], rows[i]["close"])
        if r is None:
            continue
        dates.append(rows[i]["date"])
        rets.append(r)
    return dates, rets


def _cov(mat: list[list[float]]) -> list[list[float]]:
    n_assets = len(mat)
    n_obs = len(mat[0]) if mat else 0
    means = [_mean(row) for row in mat]
    cov = [[0.0] * n_assets for _ in range(n_assets)]
    if n_obs < 2:
        return cov
    for i in range(n_assets):
        for j in range(i, n_assets):
            s = sum((mat[i][t] - means[i]) * (mat[j][t] - means[j]) for t in range(n_obs)) / (n_obs - 1)
            cov[i][j] = cov[j][i] = s
    return cov


def _port_stats(w: list[float], means: list[float], cov: list[list[float]]) -> tuple[float, float]:
    mu = sum(wi * mi for wi, mi in zip(w, means))
    var = 0.0
    for i in range(len(w)):
        for j in range(len(w)):
            var += w[i] * w[j] * cov[i][j]
    return mu, math.sqrt(max(0.0, var))


def _de_optimize(
    means: list[float],
    cov: list[list[float]],
    max_w: float,
    pop: int,
    gens: int,
    seed: int,
) -> list[float]:
    """Maximize Sharpe (mu/sigma) with long-only sum(w)=1, 0<=w<=max_w. Pure Python DE/rand/1/bin."""
    rng = _RNG(seed)
    n = len(means)
    # init
    population: list[list[float]] = []
    for _ in range(pop):
        raw = [rng.random() for _ in range(n)]
        population.append(_project(raw, max_w))
    F, CR = 0.7, 0.9

    def fitness(w: list[float]) -> float:
        mu, sig = _port_stats(w, means, cov)
        if sig <= 1e-12:
            return -1e9
        return mu / sig

    for _ in range(gens):
        new_pop: list[list[float]] = []
        for i in range(pop):
            idxs = list(range(pop))
            idxs.remove(i)
            a, b, c = (population[j] for j in rng.sample(idxs, 3))
            mutant = [a[k] + F * (b[k] - c[k]) for k in range(n)]
            trial = []
            jrand = rng.randrange(n)
            for k in range(n):
                if rng.random() < CR or k == jrand:
                    trial.append(mutant[k])
                else:
                    trial.append(population[i][k])
            trial = _project(trial, max_w)
            if fitness(trial) >= fitness(population[i]):
                new_pop.append(trial)
            else:
                new_pop.append(population[i])
        population = new_pop
    best = max(population, key=fitness)
    return best


class _RNG:
    def __init__(self, seed: int) -> None:
        self.s = seed & 0xFFFFFFFF

    def random(self) -> float:
        # LCG
        self.s = (1664525 * self.s + 1013904223) & 0xFFFFFFFF
        return self.s / 0x100000000

    def randrange(self, n: int) -> int:
        return int(self.random() * n) % n

    def sample(self, xs: list[int], k: int) -> list[int]:
        pool = list(xs)
        out = []
        for _ in range(k):
            i = self.randrange(len(pool))
            out.append(pool.pop(i))
        return out


def _project(raw: list[float], max_w: float) -> list[float]:
    # clip negative, normalize, then cap-and-renorm loop
    xs = [max(0.0, float(x)) for x in raw]
    if sum(xs) <= 0:
        xs = [1.0] * len(xs)
    for _ in range(20):
        s = sum(xs)
        xs = [x / s for x in xs]
        over = False
        for i, x in enumerate(xs):
            if x > max_w:
                xs[i] = max_w
                over = True
        if not over:
            break
        # redistribute residual to under-cap
        rem = 1.0 - sum(xs)
        free = [i for i, x in enumerate(xs) if x < max_w - 1e-12]
        if not free or rem <= 0:
            break
        add = rem / len(free)
        for i in free:
            xs[i] += add
    s = sum(xs)
    return [x / s for x in xs] if s > 0 else [1.0 / len(xs)] * len(xs)


def compute(payload: dict[str, Any]) -> dict[str, Any]:
    params = payload.get("params") if isinstance(payload.get("params"), dict) else {}
    window = int(params.get("window") or 60)
    max_w = float(params.get("max_weight") or 0.3)
    pop = int(params.get("popsize") or 20)
    gens = int(params.get("generations") or 40)
    seed = int(params.get("seed") or 42)
    bars = _load_bars(payload, ("close",))
    by = _by_symbol(bars)
    series: dict[str, list[float]] = {}
    asof = ""
    for sym, rows in by.items():
        dates, rets = _daily_rets(rows)
        if len(rets) < window:
            continue
        series[sym] = rets[-window:]
        asof = dates[-1] if dates else asof
    syms = sorted(series.keys())
    if len(syms) < 2:
        raise ValueError("有效标的不足")
    mat = [series[s] for s in syms]
    means = [_mean(r) for r in mat]
    cov = _cov(mat)
    w = _de_optimize(means, cov, max_w=max_w, pop=pop, gens=gens, seed=seed)
    mu, sig = _port_stats(w, means, cov)
    sharpe = (mu / sig) if sig > 1e-12 else 0.0
    signal = []
    for i, (s, wi) in enumerate(sorted(zip(syms, w), key=lambda x: -x[1]), start=1):
        signal.append({"symbol": s, "date": asof, "value": round(wi, 8), "weight": round(wi, 8), "rank": i})
    return {
        "ok": True,
        "skill": SKILL,
        "signal": signal,
        "series": {"weights": signal},
        "metrics": {
            "window": window,
            "expected_return": round(mu, 8),
            "volatility": round(sig, 8),
            "sharpe_sample": round(sharpe, 6),
            "max_weight": max_w,
            "generations": gens,
            "sample_note": "样本内夏普示意，非实盘",
        },
        "assumptions": [
            "差分进化（DE/rand/1/bin）长仅组合最大化样本夏普；纯 Python。",
            "无交易成本/换手约束；易混 lean-mean-variance 但不合并。",
        ],
        "errors": [],
        "meta": {"degraded": False},
    }

def main() -> int:
    ap = argparse.ArgumentParser(description=SKILL)
    ap.add_argument("--input", required=True)
    ap.add_argument("--output")
    args = ap.parse_args()
    try:
        with open(args.input, encoding="utf-8") as f:
            payload = json.load(f)
        if not isinstance(payload, dict):
            raise ValueError("input 须为 JSON 对象")
        result = compute(payload)
    except Exception as e:
        result = {
            "ok": False,
            "skill": SKILL,
            "signal": [],
            "series": {},
            "metrics": {},
            "assumptions": [],
            "errors": [str(e)],
            "meta": {},
        }
        print(json.dumps(result, ensure_ascii=False), file=sys.stderr)
        if args.output:
            with open(args.output, "w", encoding="utf-8") as f:
                json.dump(result, f, ensure_ascii=False, indent=2)
                f.write("\n")
        return 1
    text = json.dumps(result, ensure_ascii=False, indent=2)
    if args.output:
        with open(args.output, "w", encoding="utf-8") as f:
            f.write(text)
            f.write("\n")
    print(text)
    return 0 if result.get("ok") else 1


if __name__ == "__main__":
    raise SystemExit(main())
