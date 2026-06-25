"""
验证模块 — 策略信号的历史回验 + 表现追踪

功能:
  1. 对9个策略的历史信号进行回验
  2. 计算每个策略的准确率/胜率/夏普
  3. 生成策略表现对比报告
  4. 追踪不同市态下的策略表现差异

用法:
    verifier = SignalVerifier(data_engine)
    report = verifier.verify_strategies("600519", periods=40)
    print(report.format_text())
"""

from .signal_verifier import (
    SignalVerifier,
    StrategyPerformance,
    VerificationReport,
    WalkForwardResult,
)

__all__ = [
    "SignalVerifier",
    "StrategyPerformance",
    "VerificationReport",
    "WalkForwardResult",
]
