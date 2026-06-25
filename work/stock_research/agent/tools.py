"""
工具注册表 — Agent 可调用的原子操作

每个工具:
  name        — 唯一标识
  description — 自然语言描述（供 LLM 理解用途）
  parameters  — 参数模板
  handler     — 执行函数

设计: 新增工具只需在 TOOLS 列表加一条
"""

from __future__ import annotations
from dataclasses import dataclass, field
from typing import Callable, Dict, Any, List, Optional


@dataclass
class ToolDef:
    """工具定义"""
    name: str
    description: str
    parameters: List[Dict[str, Any]]
    handler: Callable
    category: str = "通用"


class ToolRegistry:
    """
    工具注册表

    用法:
        tools = ToolRegistry(hub)
        tools.call("evaluate_stock", code="600519")
    """

    def __init__(self, hub):
        self._hub = hub
        self._tools: Dict[str, ToolDef] = {}
        self._register_all()

    def _register_all(self):
        """注册所有工具"""
        h = self._hub

        tools = [
            ToolDef(
                name="evaluate_stock",
                description="对一只股票进行全面评估：计算40个因子、综合评分、行业中性化",
                parameters=[
                    {"name": "code", "type": "string", "required": True,
                     "description": "股票代码，如 600519"},
                    {"name": "scorecard", "type": "string", "required": False,
                     "description": "评分卡名称，默认综合评估"},
                ],
                handler=lambda code, scorecard="综合评估":
                    h.evaluate_stock(code, scorecard),
                category="个股分析",
            ),
            ToolDef(
                name="screen_stocks",
                description="多条件筛选股票：支持任意因子组合的 AND 逻辑过滤",
                parameters=[
                    {"name": "conditions", "type": "list", "required": True,
                     "description": "条件列表，如 [{'factor':'roe','op':'>','value':15}]"},
                    {"name": "scorecard", "type": "string", "required": False},
                    {"name": "top_n", "type": "int", "required": False},
                ],
                handler=lambda conditions, scorecard="综合评估", top_n=20:
                    h.screen_stocks(conditions, scorecard, top_n=top_n),
                category="选股",
            ),
            ToolDef(
                name="analyze_portfolio",
                description="组合分析：计算持仓的因子暴露、行业集中度、加权评分",
                parameters=[
                    {"name": "holdings", "type": "list", "required": True,
                     "description": "持仓列表 [(代码, 权重)]，如 [('600519',0.5),('000858',0.5)]"},
                ],
                handler=lambda holdings:
                    h.analyze_portfolio(holdings),
                category="组合管理",
            ),
            ToolDef(
                name="search_stocks",
                description="搜索股票：按代码、名称或行业关键词查找",
                parameters=[
                    {"name": "keyword", "type": "string", "required": True},
                ],
                handler=lambda keyword: h.search_stocks(keyword),
                category="通用",
            ),
            ToolDef(
                name="get_strategy_signal",
                description="获取策略信号：运行9个投行级策略，输出综合买卖信号",
                parameters=[
                    {"name": "code", "type": "string", "required": True},
                ],
                handler=lambda code: h.get_strategy_signal(code),
                category="策略",
            ),
            ToolDef(
                name="get_latest_evaluation",
                description="查看某只股票最近一次评估的历史记录",
                parameters=[
                    {"name": "code", "type": "string", "required": True},
                ],
                handler=lambda code: h.get_latest_evaluation(code),
                category="通用",
            ),
            ToolDef(
                name="institution_rating",
                description="多机构综合评级：运行20个机构评估器(高盛/大摩/小摩/瑞银/花旗/瑞信/巴克莱/汇丰/德银/中金/中信/华泰/招商/国君/社保/汇金/证金/大基金/北向/技术面)，输出各自评级与信心评分",
                parameters=[
                    {"name": "code", "type": "string", "required": True,
                     "description": "股票代码，如 600519"},
                    {"name": "groups", "type": "list", "required": False,
                     "description": "可选: 选择机构组 ['国际投行','国内券商','国家队','其他']"},
                ],
                handler=lambda code, groups=None:
                    h.institution_rating(code, groups),
                category="个股分析",
            ),
            ToolDef(
                name="institution_report",
                description="生成完备的多机构评级报告文本，包含20家机构的详细评级、信心评分和评估维度",
                parameters=[
                    {"name": "code", "type": "string", "required": True,
                     "description": "股票代码，如 600519"},
                ],
                handler=lambda code: h.institution_report_text(code),
                category="报告",
            ),

            ToolDef(
                name="get_closing_report",
                description="生成收盘报告：当日大盘表现、资金流向、涨停跌停、龙虎榜",
                parameters=[],
                handler=lambda: h.get_closing_report(),
                category="报告",
            ),
            ToolDef(
                name="get_morning_brief",
                description="生成开盘早报：隔夜全球市场、A股预判、持仓风险检查",
                parameters=[],
                handler=lambda: h.get_morning_brief(),
                category="报告",
            ),
            ToolDef(
                name="run_backtest",
                description="回测验证：测试评分卡或因子在历史上的IC表现",
                parameters=[
                    {"name": "codes", "type": "list", "required": True},
                    {"name": "scorecard", "type": "string", "required": False},
                    {"name": "periods", "type": "int", "required": False},
                ],
                handler=lambda codes, scorecard="综合评估", periods=5:
                    h.run_backtest(codes, scorecard, periods),
                category="策略",
            ),
        ]

        for t in tools:
            self._tools[t.name] = t

    def get(self, name: str) -> Optional[ToolDef]:
        return self._tools.get(name)

    def list(self, category: Optional[str] = None) -> List[ToolDef]:
        if category:
            return [t for t in self._tools.values() if t.category == category]
        return list(self._tools.values())

    def call(self, name: str, **kwargs) -> Any:
        """执行工具"""
        tool = self.get(name)
        if tool is None:
            return None
        return tool.handler(**kwargs)

    def system_prompt(self) -> str:
        """生成工具的 LLM system prompt 描述"""
        lines = [
            "你是一个A股投研助手。你可以使用以下工具帮助用户分析股票。\n",
        ]
        for cat in sorted(set(t.category for t in self._tools.values())):
            lines.append(f"\n## {cat}")
            for t in self._tools.values():
                if t.category != cat:
                    continue
                params_desc = []
                for p in t.parameters:
                    req = "必填" if p.get("required") else "可选"
                    params_desc.append(f"    {p['name']} ({p['type']}, {req}): {p.get('description', '')}")
                params_str = "\n".join(params_desc) if params_desc else "    无参数"
                lines.append(f"\n- {t.name}: {t.description}")
                lines.append(params_str)

        lines.append("""

## 回答规范
1. 使用工具获取真实数据，不编造数字
2. 用中文回答，简洁专业
3. 涉及具体股票时给出代码和名称
4. 不推荐买卖，仅提供数据和分析
5. 如果工具返回错误，如实告知用户""")
        return "\n".join(lines)

    def __repr__(self):
        return f"<ToolRegistry {len(self._tools)} tools>"
