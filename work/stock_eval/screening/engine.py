from __future__ import annotations
"""
筛选引擎 — 全市场多条件选股

工作流程:
  1. 获取股票池（全部A股 / 指定板块 / 指数成分）
  2. 批量计算因子
  3. 应用筛选条件
  4. 可选: 执行评分排名
  5. 返回结果

用法:
    screener = Screener(eval_engine)

    # 全市场筛选: ROE > 15% 且 负债率 < 50%
    result = screener.run(
        conditions=[Condition("roe", ">", 15),
                    Condition("debt_ratio", "<", 50)],
        scorecard_name="综合评估",
        top_n=30,
    )
"""

from dataclasses import dataclass, field
from typing import Optional
import pandas as pd

from ..core.engine import EvaluationEngine
from ..core.models import StockSnapshot
from ..core.registry import REGISTRY
from ..scoring.scorecard import Scorecard, create_scorecard, list_templates
from .conditions import Condition, ConditionGroup


@dataclass
class ScreeningResult:
    """筛选结果"""
    conditions: list[dict]             # 使用的条件
    scorecard_name: Optional[str]      # 使用的评分卡
    total_stocks_scanned: int         # 扫描了多少只
    passed_count: int                  # 通过数量
    top_n: Optional[int]              # 限制数量
    snapshots: list[StockSnapshot]    # 结果详情
    df: Optional[pd.DataFrame] = None # DataFrame 格式

    def head(self, n: int = 10) -> pd.DataFrame:
        """查看前 N 条结果"""
        if self.df is not None:
            return self.df.head(n)
        records = [s.to_dict() for s in self.snapshots[:n]]
        return pd.DataFrame(records)

    def summary(self) -> str:
        """文本摘要"""
        lines = [
            f"筛选结果 | 扫描 {self.total_stocks_scanned} 只，"
            f"通过 {self.passed_count} 只",
            f"条件: {self.conditions}",
        ]
        if self.scorecard_name:
            lines.append(f"评分卡: {self.scorecard_name}")
        if self.snapshots:
            lines.append("")
            lines.append(f"{'排名':<6}{'代码':<8}{'名称':<12}{'总分':<8}"
                         f"{'关键条件':<20}")
            lines.append("-" * 60)
            for i, s in enumerate(self.snapshots[:20], 1):
                cond_hits = self._format_cond_hits(s)
                score = s.total_score or 0
                lines.append(
                    f"{i:<6}{s.code:<8}{s.name:<12}{score:<8}{cond_hits:<20}")
        return "\n".join(lines)

    @staticmethod
    def _format_cond_hits(s: StockSnapshot) -> str:
        hits = []
        for fname, fr in s.factors.items():
            if fr is not None and fr.value is not None:
                hits.append(f"{fname}={fr.value}")
        return ", ".join(hits[:3])


class Screener:
    """
    多条件选股筛选器

    参数:
      eval_engine: EvaluationEngine 实例
    """

    def __init__(self, eval_engine: EvaluationEngine):
        self._ee = eval_engine

    def run(self,
            conditions: Optional[list[Condition]] = None,
            condition_group: Optional[ConditionGroup] = None,
            universe: Optional[list[str]] = None,
            scorecard_name: Optional[str] = None,
            scorecard: Optional[Scorecard] = None,
            top_n: Optional[int] = None,
            factor_names: Optional[list[str]] = None,
            progress_callback=None,
            ) -> ScreeningResult:
        """
        执行筛选

        参数:
          conditions: AND 关系条件列表
          condition_group: 复杂条件组（与 conditions 互斥）
          universe: 股票池，None=全市场
          scorecard_name: 预置评分卡名称
          scorecard: 自定义评分卡（与 scorecard_name 互斥）
          top_n: 返回前 N 名
          factor_names: 需要计算的因子列表，None=全部
          progress_callback: (i, total, code) -> None

        返回: ScreeningResult
        """
        # 1. 确定条件
        conds = conditions or []
        cgroup = condition_group

        # 2. 确定股票池
        codes = universe
        if codes is None:
            codes = self._fetch_all_codes()

        scanned = len(codes)

        # 3. 确定因子清单
        #    从条件和评分卡中推断需要哪些因子
        needed = set(factor_names or [])
        for c in conds:
            needed.add(c.factor)
        if cgroup:
            for c in cgroup.conditions:
                needed.add(c.factor)
        if scorecard_name:
            tmpl = create_scorecard(scorecard_name).template
            needed.update(tmpl.factor_names)
        if scorecard:
            needed.update(scorecard.template.factor_names)

        # 4. 批量计算因子
        snapshots_dict = self._ee.analyze_batch(
            codes, factor_names=list(needed) if needed else None,
            progress_callback=progress_callback,
        )
        snapshots = list(snapshots_dict.values())

        # 5. 应用筛选条件
        passed = []
        for s in snapshots:
            if cgroup:
                vals = {fn: s.get(fn) for fn in needed}
                if cgroup.evaluate(vals):
                    passed.append(s)
            elif conds:
                vals = {fn: s.get(fn) for fn in needed}
                if all(c.evaluate(vals.get(c.factor)) for c in conds):
                    passed.append(s)
            else:
                # 无条件，全部通过
                passed.append(s)

        # 6. 执行评分排名
        final_card = None
        if scorecard:
            final_card = scorecard
        elif scorecard_name:
            final_card = create_scorecard(scorecard_name)

        if final_card and passed:
            final_card.score(passed)
            # 按总分排序
            passed.sort(key=lambda s: s.total_score or 0, reverse=True)

        # 7. 限制数量
        if top_n and len(passed) > top_n:
            passed = passed[:top_n]

        # 8. 构建结果
        df = None
        try:
            records = [s.to_dict() for s in passed]
            df = pd.DataFrame(records)
        except Exception:
            pass

        return ScreeningResult(
            conditions=[c.to_dict() for c in conds],
            scorecard_name=scorecard_name or (
                scorecard.name if scorecard else None),
            total_stocks_scanned=scanned,
            passed_count=len(passed),
            top_n=top_n,
            snapshots=passed,
            df=df,
        )

    def _fetch_all_codes(self) -> list[str]:
        """获取全市场A股代码列表"""
        try:
            r = self._de.stock_list()
            if r.success and r.data:
                # 过滤掉退市/ST（可配置）
                codes = [s.code for s in r.data
                         if not s.code.startswith("9")]
                return codes[:5000]  # 安全上限
            # fallback: 常用的宽基
            return [
                "600519", "000858", "000333", "600036",
                "601318", "600276", "300750", "000651",
                "002415", "601166",
            ]
        except Exception:
            return []

    @property
    def _de(self):
        return self._ee.data_engine
