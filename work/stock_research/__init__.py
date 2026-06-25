"""
stock-research — A股投研助手 TUI

技能联动:
  a_stock_layer → 数据源 (13源回退/60+维度)
  stock_eval    → 评估引擎 (40因子/8评分卡)
  t-strategy    → 策略信号 (9投行策略)
  LLM           → DeepSeek 自然语言理解

启动:
  cd work && python __main__.py
"""

from .tui import ResearchTUI
from .integration.hub import ResearchHub
from .agent.engine import AgentEngine

__all__ = ["ResearchTUI", "ResearchHub", "AgentEngine"]
__version__ = "0.3.0"
