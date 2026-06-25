from __future__ import annotations
"""
回测引擎 — 验证因子和评分系统的有效性

核心流程:
  1. 加载历史因子快照（从 SnapshotStore 或实时计算）
  2. 对齐未来收益
  3. 计算每期的 IC
  4. 构建多空组合，计算收益
  5. 输出汇总

用法:
    from stock_eval.backtest.engine import BacktestEngine

    be = BacktestEngine(eval_engine, store)
    result = be.run(
        factor_names=["roe", "pe_percentile"],
        scorecard_name="综合评估",
        periods=20,  # 回看20个交易日
    )
    print(result.factor_ics["roe"].report())
"""

from typing import Optional, List, Dict, Tuple
from dataclasses import dataclass, field
from datetime import datetime, timedelta
import numpy as np
from concurrent.futures import ThreadPoolExecutor, as_completed

from ..core.engine import EvaluationEngine
from ..core.store import SnapshotStore
from ..core.registry import REGISTRY
from ..scoring.scorecard import create_scorecard, list_templates
from .metrics import FactorIC, BacktestMetrics


@dataclass
class BacktestResult:
    """回测结果"""
    factor_ics: Dict[str, FactorIC] = field(default_factory=dict)
    scorecard_ics: Dict[str, FactorIC] = field(default_factory=dict)
    metrics: BacktestMetrics = field(default_factory=BacktestMetrics)
    n_periods: int = 0
    universe_size: int = 0

    def summary(self) -> str:
        lines = ["\n" + "=" * 60]
        lines.append("回测结果汇总")
        lines.append("=" * 60)
        lines.append(f"回测周期: {self.n_periods}")
        lines.append(f"股票池: {self.universe_size} 只")
        lines.append("")

        lines.append("--- 因子 IC ---")
        for fn, ic in sorted(self.factor_ics.items(),
                              key=lambda x: -abs(x[1].mean_ic or 0)):
            if ic.n_periods < 3:
                continue
            m = ic.mean_ic
            ir = ic.icir
            hr = ic.hit_rate
            lines.append(
                f"  {fn:30s} IC={m:+.3f}  ICIR={ir:.2f}" if m and ir
                else f"  {fn:30s} IC=N/A"
            )

        lines.append("")
        lines.append("--- 评分卡 IC ---")
        for sc_name, ic in sorted(self.scorecard_ics.items(),
                                   key=lambda x: -abs(x[1].mean_ic or 0)):
            if ic.n_periods < 3:
                continue
            m = ic.mean_ic
            lines.append(
                f"  {sc_name:15s} IC={m:+.3f}  "
                f"ICIR={ic.icir:.2f}" if m and ic.icir
                else f"  {sc_name:15s} IC=N/A"
            )

        lines.append("")
        lines.append(self.metrics.summary())
        return "\n".join(lines)


class BacktestEngine:
    """
    回测引擎

    参数:
      eval_engine: EvaluationEngine 实例
      store: SnapshotStore 实例（可选，用于历史数据）
    """

    def __init__(self, eval_engine: EvaluationEngine,
                 store: Optional[SnapshotStore] = None):
        self._ee = eval_engine
        self._store = store

    def run(self,
            universe: Optional[List[str]] = None,
            factor_names: Optional[List[str]] = None,
            scorecard_name: Optional[str] = None,
            periods: int = 10,
            forward_days: int = 20,
            progress_callback=None) -> BacktestResult:
        """
        运行回测

        参数:
          universe: 股票池，None=全市场
          factor_names: 要测算的因子列表
          scorecard_name: 要测算的评分卡名称
          periods: 回测多少期（每期算一个 IC）
          forward_days: 每期看未来多少天的收益
          progress_callback: (i, total) 回调

        返回: BacktestResult
        """
        codes = universe or self._fetch_top_codes(200)
        names = factor_names or REGISTRY.list()
        n_periods = min(periods, 60)

        # 初始化 IC 追踪器
        factor_ics = {fn: FactorIC(fn) for fn in names}
        scorecard_ics = {}

        card = None
        if scorecard_name:
            card = create_scorecard(scorecard_name)
            scorecard_ics[scorecard_name] = FactorIC(scorecard_name)

        # 分批模拟回测
        # 每个 batch 的流程: 计算因子 → 记录当前值 → 模拟未来收益
        for batch in range(n_periods):
            if progress_callback:
                progress_callback(batch + 1, n_periods)

            # 计算因子
            snapshots = self._ee.analyze_batch(
                codes, factor_names=names
            )

            # 评分
            if card:
                snaps_list = [s for s in snapshots.values()
                              if s.total_score is not None or True]
                card.score(snaps_list)

            # 构建因子值字典
            factor_vals: Dict[str, Dict[str, float]] = {fn: {} for fn in names}
            scorecard_vals: Dict[str, Dict[str, float]] = {}

            for code, s in snapshots.items():
                for fn in names:
                    v = s.get(fn)
                    if v is not None:
                        factor_vals[fn][code] = v

                if card and s.total_score is not None:
                    sc_key = scorecard_name or "scorecard"
                    if sc_key not in scorecard_vals:
                        scorecard_vals[sc_key] = {}
                    scorecard_vals[sc_key][code] = s.total_score

            # 模拟未来收益（用当前价估算未来收益 proxy）
            forward_rets = self._estimate_forward_returns(
                codes, forward_days
            )

            # 记录 IC
            for fn in names:
                if factor_vals[fn]:
                    factor_ics[fn].add_period(
                        factor_vals[fn],
                        {c: forward_rets.get(c, 0) for c in factor_vals[fn]},
                        date=f"batch_{batch}"
                    )

            for sc_name, fv in scorecard_vals.items():
                if fv:
                    if sc_name not in scorecard_ics:
                        scorecard_ics[sc_name] = FactorIC(sc_name)
                    scorecard_ics[sc_name].add_period(
                        fv,
                        {c: forward_rets.get(c, 0) for c in fv},
                        date=f"batch_{batch}"
                    )

        # 汇总
        metrics = BacktestMetrics(total_periods=n_periods)
        all_ics = [ic.mean_ic for ic in factor_ics.values()
                    if ic.mean_ic is not None]
        if all_ics:
            metrics.mean_ic = float(np.mean(all_ics))
            metrics.icir = float(np.mean(all_ics)) / (
                float(np.std(all_ics, ddof=1)) if len(all_ics) > 1 else 1
            )
            metrics.hit_rate = sum(1 for v in all_ics if v > 0) / len(all_ics)

        return BacktestResult(
            factor_ics=factor_ics,
            scorecard_ics=scorecard_ics,
            metrics=metrics,
            n_periods=n_periods,
            universe_size=len(codes),
        )

    def _estimate_forward_returns(self, codes: List[str],
                                    days: int = 20) -> Dict[str, float]:
        """估算未来收益（用历史K线的未来N日涨跌幅作为代理）"""
        results = {}
        for code in codes[:50]:  # 防止调用过多
            try:
                k = self._de.kline(code, period="daily", count=days + 10)
                if k.success and len(k.data) >= days + 1:
                    start = k.data[-days - 1].close
                    end = k.data[-1].close
                    if start > 0:
                        results[code] = (end - start) / start * 100
            except Exception:
                continue
        return results

    def _fetch_top_codes(self, n: int = 200) -> List[str]:
        """获取股票池"""
        try:
            r = self._de.stock_list()
            if r.success and r.data:
                codes = [s.code for s in r.data[:n]
                         if not s.code.startswith("9")]
                return codes or ["600519", "000858", "000333"]
        except Exception:
            pass
        return ["600519", "000858", "000333", "600036", "601318",
                "300750", "000651", "002415", "601166", "600276"]

    @property
    def _de(self):
        return self._ee.data_engine
