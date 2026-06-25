"""
ResearchHub — 统一技能调用入口

将 a_stock_layer / stock_eval / t-strategy 三个技能封装成
一组原子操作，供 Agent 和 CLI 调用。

每个方法返回 ResearchResult(status, data, message)
"""

from __future__ import annotations
from dataclasses import dataclass, field
from .schemas import (
    StockDiagnosisData, ScorecardDimension, FactorItem,
    InstitutionRatingData, InstitutionRatingItem, RatingDimension, GroupStatItem,
    ScreeningData, ScreenedItem,
    StrategySignalData, SingleStrategySignal,
    StrategyVerifyData, StrategyPerformanceItem,
    PortfolioAnalysisData, PortfolioHoldingItem, FactorExposureItem,
    IndustryMiningData,
    MarketReportData,
    SearchStocksData, StockSearchItem,
    BacktestResultData, FactorICItem,
    LatestEvalData,
    ReportTextData,
    FactorICItem,
)
from typing import Optional, List, Dict, Any
from datetime import datetime


@dataclass
class ResearchResult:
    """统一返回格式"""
    success: bool = True
    data: Any = None
    message: str = ""
    elapsed: float = 0.0


class ResearchHub:
    """
    研究中枢

    用法:
        hub = ResearchHub()
        result = hub.evaluate_stock("600519")
        result = hub.screen_stocks(conditions=[...])
    """

    def __init__(self, data_engine=None, eval_engine=None,
                 strategy_engine=None):
        self._de = data_engine
        self._ee = eval_engine
        self._se = strategy_engine

        # 延迟导入
        self._stock_eval = None
        self._screener = None
        self._store = None
        self._neutralizer = None

    # ── 属性 ────────────────────────────────────────

    @property
    def de(self):
        """a_stock_layer AshareEngine"""
        if self._de is None:
            from a_stock_layer import AshareEngine
            self._de = AshareEngine()
        return self._de

    @property
    def ee(self):
        """stock_eval EvaluationEngine"""
        if self._ee is None:
            import sys, os
            sys.path.insert(0, os.path.join(
                os.path.dirname(__file__), "..", "..", ".."
            ))
            from stock_eval import EvaluationEngine
            self._ee = EvaluationEngine(self.de)
        return self._ee

    @property
    def screener(self):
        if self._screener is None:
            from stock_eval.screening import Screener
            self._screener = Screener(self.ee)
        return self._screener

    @property
    def store(self):
        if self._store is None:
            from stock_eval import SnapshotStore
            self._store = SnapshotStore()
        return self._store

    @property
    def neutralizer(self):
        if self._neutralizer is None:
            from stock_eval import IndustryNeutralizer
            self._neutralizer = IndustryNeutralizer(self.de)
        return self._neutralizer

    # ── 核心操作 ────────────────────────────────────

    def evaluate_stock(self, code: str,
                       scorecard: str = "综合评估",
                       factor_names: Optional[List[str]] = None
                       ) -> ResearchResult:
        """全因子评估 + 评分"""
        import time
        t0 = time.time()
        try:
            snap = self.ee.analyze(code, factor_names=factor_names)

            # 评分
            from stock_eval.scoring.scorecard import create_scorecard
            card = create_scorecard(scorecard)
            card.score([snap])

            # 持久化
            self.store.save(snap, scorecard)

            elapsed = time.time() - t0
            valid = sum(1 for fr in snap.factors.values()
                        if fr is not None and fr.value is not None)
            from stock_eval.core.registry import REGISTRY
            categories = {}
            for cat in ["valuation", "growth", "quality", "momentum", "technical", "risk", "cashflow", "composite"]:
                names = REGISTRY.list(cat)
                if names:
                    categories[cat] = names

            dims = []
            if snap.scores:
                for sname, sval in sorted(snap.scores.items(), key=lambda x: -x[1])[:10]:
                    dims.append(ScorecardDimension(name=sname, score=float(sval), weight=1.0))

            factors_list = []
            for fname, fmeta in REGISTRY._metas.items():
                fr = snap.factors.get(fname)
                factors_list.append(FactorItem(
                    name=fname, value=float(fr.value) if fr and fr.value is not None else None,
                    category=fmeta.category.value,
                ))
            factors_list.sort(key=lambda x: -(x.value or 0))

            return ResearchResult(
                success=True,
                data=StockDiagnosisData(
                    code=snap.code, name=snap.name,
                    total_score=snap.total_score,
                    scorecard_name=scorecard,
                    scorecard_dimensions=dims,
                    factors=factors_list,
                    valid_factor_count=valid,
                    total_factor_count=len(snap.factors),
                    factor_categories=categories,
                ).to_dict(),
                message=f"{snap.name}({snap.code}) 综合评分 {snap.total_score}",
                elapsed=elapsed,
            )
        except Exception as e:
            return ResearchResult(
                success=False, message=f"评估失败: {e}"
            )

    def screen_stocks(self, conditions: List[Dict],
                      scorecard: str = "综合评估",
                      universe: Optional[List[str]] = None,
                      top_n: int = 20
                      ) -> ResearchResult:
        """多条件筛选"""
        import time
        t0 = time.time()
        try:
            from stock_eval.screening import Condition
            conds = [Condition(**c) for c in conditions]

            result = self.screener.run(
                conditions=conds,
                scorecard_name=scorecard,
                universe=universe,
                top_n=top_n,
            )

            elapsed = time.time() - t0
            items = []
            for s in result.snapshots:
                key_factors = {}
                for c in conds:
                    v = s.get(c.factor)
                    if v is not None:
                        key_factors[c.factor] = v
                items.append({
                    "code": s.code, "name": s.name,
                    "total_score": s.total_score,
                    "key_factors": key_factors,
                })

            return ResearchResult(
                success=True,
                data=ScreeningData(
                    total_scanned=result.total_stocks_scanned,
                    passed=result.passed_count,
                    scorecard=scorecard,
                    items=[ScreenedItem(**i) for i in items],
                ).to_dict(),
                message=(f"扫描 {result.total_stocks_scanned} 只, "
                         f"通过 {result.passed_count} 只"),
                elapsed=elapsed,
            )
        except Exception as e:
            return ResearchResult(
                success=False, message=f"筛选失败: {e}"
            )

    def analyze_portfolio(self, holdings: List[tuple],
                          scorecard: str = "综合评估"
                          ) -> ResearchResult:
        """组合分析"""
        import time
        t0 = time.time()
        try:
            from stock_eval import PortfolioAnalyzer
            from stock_eval.scoring.scorecard import create_scorecard

            card = create_scorecard(scorecard)
            analyzer = PortfolioAnalyzer(self.ee)
            result = analyzer.analyze(holdings, scorecard=card)

            elapsed = time.time() - t0
            # Concentration label
            cl = "分散" if result.herfindahl < 0.1 else "集中" if result.herfindahl < 0.3 else "高度集中"
            return ResearchResult(
                success=True,
                data=PortfolioAnalysisData(
                    num_stocks=result.num_stocks,
                    weighted_score=result.weighted_avg_score,
                    herfindahl=result.herfindahl,
                    concentration_label=cl,
                    industry_exposure=result.industry_exposure,
                    holdings=[PortfolioHoldingItem(code=h[0], name=h[1], weight=h[2], score=h[3])
                              for h in result.holdings],
                    factor_exposures=[
                        FactorExposureItem(factor=fe.factor_name, category=fe.category,
                                          active=fe.active_exposure,
                                          interpretation=fe.interpretation)
                        for fe in result.factor_exposures[:10]
                    ],
                ).to_dict(),
                message=(f"{result.num_stocks}只持仓, "
                         f"加权评分 {result.weighted_avg_score:.1f}"),
                elapsed=elapsed,
            )
        except Exception as e:
            return ResearchResult(
                success=False, message=f"组合分析失败: {e}"
            )

    def get_industry_mining(self, industry: str) -> ResearchResult:
        """产业链挖掘"""
        import time
        t0 = time.time()
        try:
            from a_stock_layer import AshareEngine
            engine = AshareEngine()
            import sys, os
            skill_dir = os.path.expanduser(
                "~/.codex/plugins/cache/personal/"
                "a-stock-layer/1.0.0+codex.20260624012256/skills/"
                "industry-mining"
            )
            sys.path.insert(0, skill_dir)
            from report_mining import IndustryMiningReport
            reporter = IndustryMiningReport(engine)
            report = reporter.generate(industry)

            elapsed = time.time() - t0
            return ResearchResult(
                success=True,
                data=IndustryMiningData(
                    industry=industry,
                    summary=report[:1500],
                    chain_overview=report[:3000],
                ).to_dict(),
                message=f"{industry}产业链挖掘完成",
                elapsed=elapsed,
            )
        except Exception as e:
            return ResearchResult(
                success=False, message=f"产业链挖掘暂不可用: {e}"
            )

    def get_strategy_signal(self, code: str) -> ResearchResult:
        """t-strategy 策略信号"""
        import time
        t0 = time.time()
        try:
            from t_strategy import quick_assess, generate_report
            signal = quick_assess(self.de, code)
            elapsed = time.time() - t0
            # Parse signal into structured format
            sig_summary = signal if isinstance(signal, str) else str(signal)
            return ResearchResult(
                success=True,
                data=StrategySignalData(
                    code=code, name="",
                    summary=sig_summary,
                    bullish_count=0, bearish_count=0, neutral_count=0,
                    signals=[],
                ).to_dict(),
                message=f"{code} 策略信号: {sig_summary}",
                elapsed=elapsed,
            )
        except Exception as e:
            return ResearchResult(
                success=False, message=f"策略信号暂不可用: {e}"
            )

    def get_closing_report(self) -> ResearchResult:
        """收盘报告"""
        import time
        t0 = time.time()
        try:
            from a_stock_layer import AshareEngine
            engine = AshareEngine()
            import sys, os
            skill_dir = os.path.expanduser(
                "~/.codex/plugins/cache/personal/"
                "a-stock-layer/1.0.0+codex.20260624012256/skills/"
                "closing-report"
            )
            sys.path.insert(0, skill_dir)
            from report_closing import ClosingReport
            reporter = ClosingReport(engine)
            report = reporter.generate()
            elapsed = time.time() - t0
            return ResearchResult(
                success=True,
                data=MarketReportData(
                    report_type="closing", title="收盘报告",
                    summary=report[:500],
                    sections=[{"title": "完整报告", "content": report[:3000]}],
                ).to_dict(),
                message="收盘报告生成完成",
                elapsed=elapsed,
            )
        except Exception as e:
            return ResearchResult(
                success=False, message=f"收盘报告暂不可用: {e}"
            )

    def get_morning_brief(self) -> ResearchResult:
        """开盘早报"""
        import time
        t0 = time.time()
        try:
            from a_stock_layer import AshareEngine
            engine = AshareEngine()
            import sys, os
            skill_dir = os.path.expanduser(
                "~/.codex/plugins/cache/personal/"
                "a-stock-layer/1.0.0+codex.20260624012256/skills/"
                "morning-brief"
            )
            sys.path.insert(0, skill_dir)
            from report_morning import MorningBriefReport
            reporter = MorningBriefReport(engine)
            report = reporter.generate()
            elapsed = time.time() - t0
            return ResearchResult(
                success=True,
                data=MarketReportData(
                    report_type="morning", title="开盘早报",
                    summary=report[:500],
                    sections=[{"title": "完整报告", "content": report[:3000]}],
                ).to_dict(),
                message="开盘早报生成完成",
                elapsed=elapsed,
            )
        except Exception as e:
            return ResearchResult(
                success=False, message=f"开盘早报暂不可用: {e}"
            )

    def run_backtest(self, codes: List[str],
                     scorecard: str = "综合评估",
                     periods: int = 5) -> ResearchResult:
        """回测验证"""
        import time
        t0 = time.time()
        try:
            from stock_eval.backtest import BacktestEngine
            be = BacktestEngine(self.ee, self.store)
            result = be.run(
                universe=codes,
                scorecard_name=scorecard,
                periods=periods,
            )
            elapsed = time.time() - t0
            # Build IC lists
            factor_ics = []
            for fn, ic in sorted(result.factor_ics.items(), key=lambda x: -abs(x[1].mean_ic or 0)):
                if ic.n_periods < 3: continue
                factor_ics.append(FactorICItem(
                    factor_name=fn, mean_ic=ic.mean_ic, icir=ic.icir,
                    hit_rate=ic.hit_rate, n_periods=ic.n_periods,
                ))
            scorecard_ics = []
            for sn, ic in sorted(result.scorecard_ics.items(), key=lambda x: -abs(x[1].mean_ic or 0)):
                if ic.n_periods < 3: continue
                scorecard_ics.append(FactorICItem(
                    factor_name=sn, mean_ic=ic.mean_ic, icir=ic.icir,
                    hit_rate=ic.hit_rate, n_periods=ic.n_periods,
                ))
            return ResearchResult(
                success=True,
                data=BacktestResultData(
                    n_periods=result.n_periods,
                    universe_size=result.universe_size,
                    factor_ics=factor_ics,
                    scorecard_ics=scorecard_ics,
                ).to_dict(),
                message=f"回测完成: {result.n_periods} 期",
                elapsed=elapsed,
            )
        except Exception as e:
            return ResearchResult(
                success=False, message=f"回测失败: {e}"
            )

    def search_stocks(self, keyword: str) -> ResearchResult:
        """搜索股票"""
        import time
        t0 = time.time()
        try:
            r = self.de.stock_list()
            if not r.success or not r.data:
                return ResearchResult(
                    success=False, message="无法获取股票列表"
                )
            results = []
            for s in r.data:
                if (keyword.upper() in s.code
                        or keyword in (s.name or "")
                        or keyword in (s.industry or "")):
                    results.append({
                        "code": s.code, "name": s.name,
                        "industry": s.industry,
                    })
            elapsed = time.time() - t0
            results = results[:30]
            return ResearchResult(
                success=True,
                data=SearchStocksData(
                    keyword=keyword,
                    results=[StockSearchItem(**r) for r in results],
                ).to_dict(),
                message=f"找到 {len(results)} 只匹配股票",
                elapsed=elapsed,
            )
        except Exception as e:
            return ResearchResult(
                success=False, message=f"搜索失败: {e}"
            )


    def institution_rating(self, code: str,
                          groups: Optional[List[str]] = None
                          ) -> ResearchResult:
        """多机构综合评级 — 运行20个机构评估器"""
        import time
        t0 = time.time()
        try:
            from stock_eval.institutions.consolidated import ConsolidatedEngine
            engine = ConsolidatedEngine(self.de)
            result = engine.evaluate(code, groups=groups)
            report = ConsolidatedReport(result)
            elapsed = time.time() - t0
            # Build group stats
            group_stats = {}
            for gname, gs in result.group_stats.items():
                group_stats[gname] = GroupStatItem(**gs)

            # Build ratings
            from stock_eval.institutions.consolidated import EVALUATOR_GROUPS
            cls_to_group = {}
            for gname, gtypes in EVALUATOR_GROUPS.items():
                for gt in gtypes:
                    cls_to_group[gt] = gname

            rating_items = []
            for r in result.ratings:
                dims = None
                if r.dimensions:
                    dims = [RatingDimension(
                        name=d.name, score=d.score, weight=d.weight, detail=d.detail
                    ) for d in r.dimensions]
                # Find group
                rgroup = cls_to_group.get(type(r), "")
                rating_items.append(InstitutionRatingItem(
                    institution=r.institution, institution_short=r.institution_short,
                    rating=r.rating.value, rating_cn=r.rating_label_cn,
                    confidence=r.confidence, raw_confidence=r.raw_confidence,
                    method_source=r.method_source, model_name=r.model_name,
                    summary=r.summary, dimensions=dims, group=rgroup,
                ))

            return ResearchResult(
                success=True,
                data=InstitutionRatingData(
                    code=result.code, name=result.name,
                    avg_confidence=result.avg_confidence,
                    avg_raw_confidence=result.avg_raw_confidence,
                    consensus_rating=result.consensus_rating.value,
                    consensus_rating_cn=result.consensus_rating.label_cn,
                    confidence_std=result.confidence_std,
                    agreement_rate=result.agreement_rate,
                    rating_distribution=result.rating_distribution,
                    bullish_count=result.bullish_count,
                    bearish_count=result.bearish_count,
                    neutral_count=result.neutral_count,
                    group_stats=group_stats,
                    ratings=rating_items,
                    avg_data_quality=result.avg_data_quality,
                ).to_dict(),
                message=(f"{result.name}({result.code}) "
                         f"机构共识: {result.consensus_rating.label_cn} "
                         f"信心{result.avg_confidence:.1f}/10"),
                elapsed=elapsed,
            )
        except Exception as e:
            return ResearchResult(
                success=False, message=f"机构评级失败: {e}"
            )

    def institution_report_text(self, code: str,
                                groups: Optional[List[str]] = None
                                ) -> ResearchResult:
        """多机构综合评级 — 返回文本报告"""
        import time
        t0 = time.time()
        try:
            from stock_eval.institutions.consolidated import ConsolidatedEngine
            engine = ConsolidatedEngine(self.de)
            result = engine.evaluate(code, groups=groups)
            text = result.to_report().format_text()
            elapsed = time.time() - t0
            return ResearchResult(
                success=True,
                data=ReportTextData(
                    code=code, name=result.name,
                    report_type="institution_rating",
                    text=text,
                ).to_dict(),
                message=f"{result.name} 机构评级报告生成完成",
                elapsed=elapsed,
            )
        except Exception as e:
            return ResearchResult(
                success=False, message=f"机构评级报告失败: {e}"
            )


    def strategy_verify(self, code: str,
                       checkpoints: int = 30,
                       forward_days: int = 5
                       ) -> ResearchResult:
        """策略历史信号验证 — 回验9个策略的历史准确率"""
        import time
        t0 = time.time()
        try:
            from stock_eval.validation import SignalVerifier
            verifier = SignalVerifier(self.de)
            report = verifier.verify_strategies(code, checkpoints, forward_days)
            elapsed = time.time() - t0

            # 转换为可序列化数据
            perfs = {}
            for sname, perf in report.performances.items():
                perfs[sname] = perf.to_dict()

            best = report.best_strategy
            # Build performances list
            perf_items = []
            for sname, perf in report.performances.items():
                pd = perf.to_dict() if hasattr(perf, 'to_dict') else {}
                perf_items.append(StrategyPerformanceItem(
                    name=sname,
                    overall_win_rate=pd.get("overall_win_rate", 0),
                    avg_return=pd.get("avg_return", 0),
                    sharpe=pd.get("sharpe"),
                    signal_count=pd.get("n_signals", 0),
                ))
            avg_wr = round(
                sum(p.overall_win_rate for p in perf_items) / len(perf_items), 3
            ) if perf_items else 0

            return ResearchResult(
                success=True,
                data=StrategyVerifyData(
                    code=report.code, name=report.name,
                    checkpoints=report.checkpoints,
                    forward_days=report.forward_days,
                    date_range=list(report.date_range),
                    avg_win_rate=avg_wr,
                    best_strategy={"name": best[0], "win_rate": best[1]} if best[0] else None,
                    performances=perf_items,
                ).to_dict(),
                message=(f"{report.name}({report.code}) 策略验证完成: "
                         f"{report.checkpoints}个检查点"),
                elapsed=elapsed,
            )
        except Exception as e:
            return ResearchResult(
                success=False, message=f"策略验证失败: {e}"
            )

    def strategy_verify_report(self, code: str,
                              checkpoints: int = 30,
                              forward_days: int = 5
                              ) -> ResearchResult:
        """策略历史信号验证 — 返回文本报告"""
        import time
        t0 = time.time()
        try:
            from stock_eval.validation import SignalVerifier
            verifier = SignalVerifier(self.de)
            report = verifier.verify_strategies(code, checkpoints, forward_days)
            text = report.format_text()
            elapsed = time.time() - t0
            return ResearchResult(
                success=True,
                data=ReportTextData(
                    code=code, name=report.name,
                    report_type="strategy_verify",
                    text=text,
                ).to_dict(),
                message=f"{report.name} 策略验证报告生成完成",
                elapsed=elapsed,
            )
        except Exception as e:
            return ResearchResult(
                success=False, message=f"策略验证报告失败: {e}"
            )

    def get_latest_evaluation(self, code: str) -> ResearchResult:
        """查看最近的评估记录"""
        stored = self.store.get_latest(code)
        if stored is None:
            return ResearchResult(
                success=False,
                message=f"未找到 {code} 的历史评估记录"
            )
        return ResearchResult(
            success=True,
            data=LatestEvalData(
                code=stored.code, name=stored.name,
                timestamp=stored.timestamp,
                scorecard=stored.scorecard_name,
                total_score=stored.total_score,
                factor_values=stored.factor_values,
            ).to_dict(),
            message=(f"{stored.name} 上次评估: "
                     f"{stored.total_score} 分 ({stored.timestamp})"),
        )
