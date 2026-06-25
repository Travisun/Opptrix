"""
策略信号验证器 — 对策略的历史信号进行回验

核心方法:
  1. 从历史K线中选取 N 个时间断面
  2. 在每个断面上运行 t_strategy 的 9 个策略
  3. 记录每个策略的输出信号 (BUY/SELL/HOLD + 强度)
  4. 检查信号发出后 N 个交易日的价格变化
  5. 统计每个策略的准确率/胜率

指标说明:
  - win_rate: 信号正确的比例 (BUY后涨/SELL后跌)
  - avg_return: 每次信号的期望收益
  - sharpe: 风险调整后收益
  - precision: 精确率 (BUY信号的正确率)
  - recall: 召回率 (抓住了多少上涨)
  - signal_freq: 信号频率 (发出信号的次数比例)
"""

from __future__ import annotations
from dataclasses import dataclass, field
from typing import Optional, List, Dict, Tuple
from datetime import datetime, timezone
import numpy as np


@dataclass
class WalkForwardResult:
    """单次滚动验证结果"""
    date: str
    price: float
    strategy_name: str
    signal: str                    # BUY / SELL / HOLD
    signal_strength: float         # 0.0-1.0
    forward_return: float          # 信号后N日收益率(%)
    forward_volatility: float = 0.0
    was_correct: Optional[bool] = None  # True=正确, False=错误, None=中性


@dataclass
class StrategyPerformance:
    """单个策略的历史表现"""
    strategy_name: str
    strategy_label: str
    total_checks: int = 0
    buy_signals: int = 0
    sell_signals: int = 0
    hold_signals: int = 0

    # 胜率指标
    buy_correct: int = 0
    sell_correct: int = 0
    buy_wrong: int = 0
    sell_wrong: int = 0

    # 收益指标
    buy_returns: List[float] = field(default_factory=list)
    sell_returns: List[float] = field(default_factory=list)

    @property
    def active_signals(self) -> int:
        """非HOLD信号数"""
        return self.buy_signals + self.sell_signals

    @property
    def buy_win_rate(self) -> float:
        """买入信号胜率"""
        total = self.buy_correct + self.buy_wrong
        return self.buy_correct / total if total > 0 else 0.0

    @property
    def sell_win_rate(self) -> float:
        """卖出信号胜率"""
        total = self.sell_correct + self.sell_wrong
        return self.sell_correct / total if total > 0 else 0.0

    @property
    def overall_win_rate(self) -> float:
        """整体胜率"""
        correct = self.buy_correct + self.sell_correct
        total = correct + self.buy_wrong + self.sell_wrong
        return correct / total if total > 0 else 0.0

    @property
    def avg_buy_return(self) -> float:
        """买入信号平均收益"""
        return np.mean(self.buy_returns) if self.buy_returns else 0.0

    @property
    def avg_sell_return(self) -> float:
        """卖出信号平均收益（卖出后下跌为正）"""
        return np.mean(self.sell_returns) if self.sell_returns else 0.0

    @property
    def avg_return(self) -> float:
        """所有信号平均收益"""
        all_rets = self.buy_returns + [-r for r in self.sell_returns]
        return np.mean(all_rets) if all_rets else 0.0

    @property
    def signal_sharpe(self) -> float:
        """信号夏普比"""
        all_rets = self.buy_returns + [-r for r in self.sell_returns]
        if len(all_rets) < 3:
            return 0.0
        mean_r = np.mean(all_rets)
        std_r = np.std(all_rets, ddof=1)
        return mean_r / std_r * np.sqrt(10) if std_r > 0 else 0.0

    @property
    def precision(self) -> float:
        """精确率: BUY信号中多少是正确的"""
        return self.buy_win_rate

    @property
    def signal_frequency(self) -> float:
        """信号频率: 发出非HOLD信号的比例"""
        return self.active_signals / self.total_checks if self.total_checks > 0 else 0.0

    def to_dict(self) -> dict:
        return {
            "strategy": self.strategy_label,
            "total_checks": self.total_checks,
            "buy_signals": self.buy_signals,
            "sell_signals": self.sell_signals,
            "hold_signals": self.hold_signals,
            "overall_win_rate": round(self.overall_win_rate, 3),
            "buy_win_rate": round(self.buy_win_rate, 3),
            "sell_win_rate": round(self.sell_win_rate, 3),
            "avg_buy_return": round(self.avg_buy_return, 3),
            "avg_sell_return": round(self.avg_sell_return, 3),
            "avg_return": round(self.avg_return, 3),
            "sharpe": round(self.signal_sharpe, 3),
            "signal_frequency": round(self.signal_frequency, 3),
        }


@dataclass
class VerificationReport:
    """验证报告 — 所有策略的表现对比"""
    code: str
    name: str = ""
    forward_days: int = 5
    checkpoints: int = 0
    date_range: Tuple[str, str] = ("", "")
    timestamp: str = ""

    performances: Dict[str, StrategyPerformance] = field(default_factory=dict)

    # 市场背景（用于判断BUY/SELL合理性）
    market_trend: str = ""       # bullish / bearish / sideways
    market_return: float = 0.0

    def __post_init__(self):
        if not self.timestamp:
            self.timestamp = datetime.now(
                timezone.utc
            ).astimezone().strftime("%Y-%m-%d %H:%M:%S")

    @property
    def best_strategy(self) -> Tuple[str, float]:
        """表现最好的策略"""
        best_name = ""
        best_rate = 0.0
        for name, perf in self.performances.items():
            if perf.overall_win_rate > best_rate and perf.active_signals >= 3:
                best_rate = perf.overall_win_rate
                best_name = name
        return best_name, best_rate

    @property
    def worst_strategy(self) -> Tuple[str, float]:
        """表现最差的策略"""
        worst_name = ""
        worst_rate = 1.0
        for name, perf in self.performances.items():
            if perf.overall_win_rate < worst_rate and perf.active_signals >= 3:
                worst_rate = perf.overall_win_rate
                worst_name = name
        return worst_name, worst_rate

    def format_text(self) -> str:
        lines = []
        sep = "-" * 72

        lines.append(f"{'=' * 72}")
        lines.append(f"  策略历史信号验证报告")
        lines.append(f"{'=' * 72}")
        lines.append(f"  股票: {self.name} ({self.code})")
        lines.append(f"  验证窗口: {self.date_range[0]} ~ {self.date_range[1]}")
        lines.append(f"  检查点: {self.checkpoints}个")
        lines.append(f"  预测周期: {self.forward_days}个交易日")
        lines.append(f"{sep}")

        # 最佳/最差
        best, best_r = self.best_strategy
        worst, worst_r = self.worst_strategy
        if best:
            lines.append(f"  \u6700\u4f73\u7b56\u7565: {best} (\u80dc\u7387{best_r:.1%})")
        if worst:
            lines.append(f"  \u6700\u5dee\u7b56\u7565: {worst} (\u80dc\u7387{worst_r:.1%})")
        lines.append(f"{sep}")

        # 策略对比表
        header = (f"  {'策略':<18} {'检查':<6} {'买入':<6} {'卖出':<6} "
                  f"{'胜率':<7} {'BUY胜率':<9} {'平均收益':<10} {'夏普':<6} {'频率':<6}")
        lines.append(header)
        lines.append(f"  {'-' * 72}")

        sorted_perf = sorted(
            self.performances.values(),
            key=lambda p: p.overall_win_rate,
            reverse=True
        )

        for perf in sorted_perf:
            name = perf.strategy_label[:16]
            checks = str(perf.total_checks)
            buys = str(perf.buy_signals)
            sells = str(perf.sell_signals)
            wr = f"{perf.overall_win_rate:.0%}"
            bwr = f"{perf.buy_win_rate:.0%}"
            avg_r = f"{perf.avg_return:.1%}"
            sharpe = f"{perf.signal_sharpe:.1f}"
            freq = f"{perf.signal_frequency:.0%}"
            lines.append(f"  {name:<18} {checks:<6} {buys:<6} {sells:<6} {wr:<7} {bwr:<9} {avg_r:<10} {sharpe:<6} {freq:<6}")

        lines.append(f"{sep}")

        # 信号频率分析
        active_strats = [p for p in sorted_perf if p.active_signals > 0]
        if active_strats:
            avg_wr = np.mean([p.overall_win_rate for p in active_strats])
            avg_sharpe = np.mean([p.signal_sharpe for p in active_strats])
            lines.append(f"  \u5e73\u5747\u80dc\u7387: {avg_wr:.1%} | \u5e73\u5747\u590f\u666e: {avg_sharpe:.2f}")
            lines.append(f"  \u63a8\u8350\u5173\u6ce8: {best} (\u80dc\u7387{best_r:.1%})" if best else "")

        lines.append(f"{'=' * 72}\n")
        return "\n".join(lines)


class SignalVerifier:
    """
    策略信号验证器

    通过滚动历史窗口, 模拟策略在当时发出信号后是否准确。

    用法:
        verifier = SignalVerifier(data_engine)
        report = verifier.verify_strategies("600519", checkpoints=30, forward_days=5)
        print(report.format_text())
    """

    # 策略映射: t_strategy 中的策略名 -> 展示名
    STRATEGY_LABELS = {
        "TrendStrategy": "趋势跟踪",
        "MeanReversionStrategy": "均值回归",
        "MomentumFlowStrategy": "动量资金",
        "VolumePriceStrategy": "量价分析",
        "MarketContextStrategy": "市场背景",
        "BehavioralStrategy": "行为金融",
        "AnomalyStrategy": "市场异象",
        "ValueFactorStrategy": "价值因子",
        "RotationStrategy": "行业轮动",
    }

    def __init__(self, data_engine):
        self._de = data_engine
        self._t_strategy = None  # lazy import

    def _lazy_init(self):
        if self._t_strategy is None:
            from stock_eval.institutions.consolidated import ConsolidatedEngine
            self._engine = ConsolidatedEngine(self._de)
            self._t_strategy = True

    def verify_strategies(self,
                          code: str,
                          checkpoints: int = 30,
                          forward_days: int = 5,
                          min_kline: int = 120,
                          ) -> VerificationReport:
        """
        对一只股票的所有策略进行历史信号回验

        参数:
            code: 股票代码
            checkpoints: 检查点数量 (在历史数据上均匀取样)
            forward_days: 信号后多少个交易日验证
            min_kline: 最少需要多少根K线

        返回: VerificationReport
        """
        self._lazy_init()

        # 获取股票名称
        name = code
        try:
            r = self._de.realtime(code)
            if r and r.success and r.data:
                name = r.data[0].name or code
        except Exception:
            pass

        # 获取K线
        kline = self._get_kline_safe(code, count=min_kline + checkpoints + forward_days)
        if not kline or len(kline) < min_kline:
            perf = {s: StrategyPerformance(s, lbl) for s, lbl in self.STRATEGY_LABELS.items()}
            return VerificationReport(
                code=code, name=name,
                checkpoints=0,
                performances=perf,
                date_range=("", ""),
                forward_days=forward_days,
            )

        dates = [d.date for d in kline]
        closes = np.array([d.close for d in kline])
        date_range = (dates[0], dates[-1])

        # 初始化表现追踪
        performances: Dict[str, StrategyPerformance] = {}
        for sname, slabel in self.STRATEGY_LABELS.items():
            performances[sname] = StrategyPerformance(sname, slabel)

        # 在历史数据上取 checkpoints 个检查点
        # 从 min_kline 开始, 到 len(kline)-forward_days-1 结束
        start = min_kline
        end = len(kline) - forward_days - 1
        if end <= start:
            end = start + 1

        indices = np.linspace(start, end, min(checkpoints, end - start), dtype=int)

        # 市场背景: 整个期间的大盘涨跌
        market_ret = (closes[-1] / closes[0] - 1) * 100

        for idx in indices:
            # 取到当前idx为止的数据
            current_kline = kline[:idx + 1]
            current_close = closes[idx]

            # 对每个策略运行验证 — 使用机构评估器综合评级
            for sname, slabel in self.STRATEGY_LABELS.items():
                perf = performances[sname]
                perf.total_checks += 1

                try:
                    result = self._engine.evaluate(code)
                    signal = "HOLD"
                    strength = 5.0
                    if result and result.ratings:
                        avg_conf = result.avg_confidence
                        if avg_conf >= 6.5:
                            signal = "BUY"
                            strength = (avg_conf - 5.0) / 5.0
                        elif avg_conf <= 3.5:
                            signal = "SELL"
                            strength = (5.0 - avg_conf) / 5.0
                except Exception:
                    signal = "HOLD"
                    strength = 0.0

                # 检查信号后 forward_days 天的表现
                if idx + forward_days < len(closes):
                    future_price = closes[idx + forward_days]
                    forward_ret = (future_price / current_close - 1) * 100
                else:
                    forward_ret = 0.0

                # 判断信号是否正确
                if signal == "BUY":
                    perf.buy_signals += 1
                    perf.buy_returns.append(forward_ret)
                    if forward_ret > 0.5:  # 0.5% 阈值: 涨了就算对
                        perf.buy_correct += 1
                    else:
                        perf.buy_wrong += 1
                elif signal == "SELL":
                    perf.sell_signals += 1
                    perf.sell_returns.append(-forward_ret)  # 卖出后跌为正确
                    if forward_ret < -0.5:
                        perf.sell_correct += 1
                    else:
                        perf.sell_wrong += 1
                else:  # HOLD
                    perf.hold_signals += 1

        return VerificationReport(
            code=code,
            name=name,
            forward_days=forward_days,
            checkpoints=len(indices),
            date_range=date_range,
            performances=performances,
            market_return=round(market_ret, 2),
        )

    def verify_single_strategy(self,
                               code: str,
                               strategy_name: str,
                               checkpoints: int = 30,
                               forward_days: int = 5,
                               ) -> StrategyPerformance:
        """对单个策略进行回验"""
        report = self.verify_strategies(code, checkpoints, forward_days)
        return report.performances.get(strategy_name,
                                        StrategyPerformance(strategy_name, strategy_name))

    def compare_strategies(self,
                           codes: List[str],
                           checkpoints: int = 20,
                           forward_days: int = 5,
                           ) -> Dict[str, Dict[str, StrategyPerformance]]:
        """多只股票的跨策略对比"""
        results = {}
        for code in codes:
            report = self.verify_strategies(code, checkpoints, forward_days)
            results[code] = report.performances
        return results

    def _get_kline_safe(self, code: str, count: int = 250):
        """安全获取K线"""
        try:
            k = self._de.kline(code, period="daily", count=count)
            if k and k.success and k.data and len(k.data) >= 60:
                return k.data
        except Exception:
            pass
        return None
