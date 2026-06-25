"""
Agent 引擎 — 连接 LLM + 工具系统

工作模式:
  1. LLM 模式: 自然语言 → LLM → 工具调用 → 结果 → LLM → 回答
  2. 命令模式: 直接解析命令 → 工具调用 → 格式化输出
  3. 混合模式: LLM 解析意图 → 直接执行工具 → 输出结果

设计:
  - AgentEngine 管理对话历史
  - 每次对话自动注入工具描述的 system prompt
  - 支持流式/非流式
"""

from __future__ import annotations
from typing import Optional, List, Dict, Callable
from dataclasses import dataclass, field
from datetime import datetime
import json

from .tools import ToolRegistry
from ..llm.provider import LLMProvider, LLMConfig
from ..llm.config import AppSettings


@dataclass
class Message:
    """单条对话"""
    role: str           # user / assistant / system / tool
    content: str
    timestamp: str = ""

    def __post_init__(self):
        if not self.timestamp:
            self.timestamp = datetime.now().strftime("%H:%M:%S")


@dataclass
class Conversation:
    """一次对话会话"""
    messages: List[Message] = field(default_factory=list)
    created_at: str = ""

    def __post_init__(self):
        if not self.created_at:
            self.created_at = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    def add(self, role: str, content: str):
        self.messages.append(Message(role=role, content=content))

    def to_llm_format(self) -> List[Dict[str, str]]:
        return [{"role": m.role, "content": m.content} for m in self.messages]

    def last_user_message(self) -> Optional[str]:
        for m in reversed(self.messages):
            if m.role == "user":
                return m.content
        return None


class AgentEngine:
    """
    Agent 执行引擎

    用法:
        agent = AgentEngine(hub, settings)
        reply = agent.chat("分析一下贵州茅台")
        reply = agent.chat("帮我筛选ROE>15%的股票")
    """

    def __init__(self, hub, settings: AppSettings):
        self._hub = hub
        self._settings = settings
        self._tools = ToolRegistry(hub)
        self._llm: Optional[LLMProvider] = None
        self._conversation = Conversation()

        # 初始化 LLM
        if settings.llm.is_configured():
            self._llm = LLMProvider.create(settings.llm)

    # ── 核心方法 ────────────────────────────────────

    def chat(self, message: str,
             stream_callback: Optional[Callable[[str], None]] = None
             ) -> str:
        """
        处理用户消息，返回回答

        stream_callback: 如果提供，每收到一段内容就调用
        """
        if not message.strip():
            return "请输入问题。"

        self._conversation.add("user", message)

        # 1. 识别命令模式
        cmd_result = self._try_command(message)
        if cmd_result is not None:
            text = cmd_result
            self._conversation.add("assistant", text)
            return text

        # 2. LLM 模式
        if self._llm is None:
            return ("⚠️ LLM 未配置。请在设置中配置 DeepSeek API Key。\n"
                    "你也可以直接使用命令：\n"
                    "  /evaluate <代码>  — 评估股票\n"
                    "  /screen <条件>    — 筛选\n"
                    "  /search <关键词>  — 搜索\n"
                    "  /help            — 查看全部命令")

        try:
            # 构建消息
            llm_messages = self._build_messages(message)

            # 调用 LLM
            reply = self._llm.chat(llm_messages)

            # 后处理：检查回答中是否包含工具调用意图
            reply = self._post_process(reply)

            self._conversation.add("assistant", reply)
            return reply

        except Exception as e:
            error_msg = f"处理出错: {e}"
            self._conversation.add("assistant", error_msg)
            return error_msg

    def _try_command(self, message: str):
        """尝试作为命令解析"""
        msg = message.strip()

        # /evaluate 600519
        if msg.startswith("/evaluate "):
            parts = msg.split()
            code = parts[1] if len(parts) > 1 else ""
            if not code:
                return "用法: /evaluate <股票代码> [评分卡名称]"
            scorecard = parts[2] if len(parts) > 2 else self._settings.default_scorecard
            result = self._hub.evaluate_stock(code, scorecard)
            if not result.success:
                return f"❌ {result.message}"
            d = result.data
            lines = [
                f"📊 {d['name']}({d['code']}) 评估结果",
                f"综合评分: {d['total_score']} / 100",
                f"有效因子: {d['valid_factors']} / {d['total_factors']}",
                f"耗时: {result.elapsed:.1f}s",
            ]
            if d.get("scores"):
                lines.append("")
                lines.append("维度评分:")
                for sname, sval in sorted(d["scores"].items(),
                                           key=lambda x: -x[1])[:10]:
                    lines.append(f"  {sname}: {sval}")
            return "\n".join(lines)

        # /screen roe>15 debt_ratio<50
        if msg.startswith("/screen"):
            parts = msg.split()[1:]
            conditions = []
            for p in parts:
                for op in [">=", "<=", ">", "<", "=="]:
                    if op in p:
                        field, val = p.split(op)
                        conditions.append({"factor": field, "op": op, "value": float(val)})
                        break
            if not conditions:
                return "用法: /screen <因子><运算符><值> ...\n示例: /screen roe>15 debt_ratio<50"
            result = self._hub.screen_stocks(
                conditions, scorecard=self._settings.default_scorecard,
                top_n=self._settings.default_top_n,
            )
            if not result.success:
                return f"❌ {result.message}"
            d = result.data
            lines = [
                f"🔍 筛选结果: 扫描 {d['total_scanned']} 只, 通过 {d['passed']} 只",
                f"条件: {conditions}",
                "",
            ]
            for item in d["items"][:10]:
                factors_str = ", ".join(f"{k}={v}" for k, v in item["key_factors"].items())
                lines.append(
                    f"  {item['code']:8s} {item['name']:10s} "
                    f"评分 {item['total_score']:5.1f}  {factors_str}"
                )
            return "\n".join(lines)

        # /search 茅台
        if msg.startswith("/search "):
            keyword = msg[8:].strip()
            result = self._hub.search_stocks(keyword)
            if not result.success:
                return f"❌ {result.message}"
            d = result.data
            lines = [f"🔎 搜索 \"{keyword}\": 找到 {len(d['results'])} 只"]
            for r in d["results"][:15]:
                lines.append(f"  {r['code']:8s} {r['name']:10s} {r.get('industry','')}")
            return "\n".join(lines)

        # /portfolio 600519:0.5 000858:0.5
        if msg.startswith("/portfolio ") or msg.startswith("/pf "):
            parts = msg.split()[1:]
            holdings = []
            for p in parts:
                if ":" in p:
                    code, w = p.split(":")
                    holdings.append((code, float(w)))
            if not holdings:
                return "用法: /portfolio 代码:权重 代码:权重 ...\n示例: /portfolio 600519:0.5 000858:0.5"
            result = self._hub.analyze_portfolio(holdings)
            if not result.success:
                return f"❌ {result.message}"
            d = result.data
            lines = [
                f"📊 组合分析: {d['num_stocks']} 只持仓",
                f"加权评分: {d['weighted_score']}",
                f"集中度(HHI): {d['herfindahl']}",
                "",
                "行业分布:",
            ]
            for ind, wgt in sorted(d.get("industry_exposure", {}).items(),
                                    key=lambda x: -x[1]):
                bar = "█" * int(wgt * 30)
                lines.append(f"  {ind:15s} {wgt:6.1%} {bar}")
            return "\n".join(lines)

        # /signal 600519
        if msg.startswith("/signal "):
            code = msg[8:].strip()
            result = self._hub.get_strategy_signal(code)
            return result.message if result.success else f"❌ {result.message}"

        # /close — 收盘报告
        if msg in ("/close", "/closing"):
            result = self._hub.get_closing_report()
            if not result.success:
                return f"❌ {result.message}"
            return result.data.get("report", "无报告数据")

        # /morning — 开盘早报
        if msg in ("/morning", "/brief"):
            result = self._hub.get_morning_brief()
            if not result.success:
                return f"❌ {result.message}"
            return result.data.get("report", "无报告数据")

        # /history 600519
        if msg.startswith("/history "):
            code = msg[9:].strip()
            result = self._hub.get_latest_evaluation(code)
            if not result.success:
                return f"没有 {code} 的历史记录"
            d = result.data
            return (f"📜 {d['name']}({d['code']}) 上次评估\n"
                    f"时间: {d['timestamp']}\n"
                    f"评分卡: {d['scorecard']}\n"
                    f"总分: {d['total_score']}")

        # /help
        if msg == "/help" or msg == "help":
            return self._help_text()

        return None  # 不是命令

    def _build_messages(self, user_message: str) -> List[Dict[str, str]]:
        """构建发送给 LLM 的消息列表"""
        system_content = self._tools.system_prompt()

        # 注入用户偏好上下文
        context_parts = [f"默认评分卡: {self._settings.default_scorecard}"]
        context_str = "\n".join(context_parts)
        system_content += f"\n\n## 用户偏好\n{context_str}"

        messages = [{"role": "system", "content": system_content}]

        # 加入最近的对话历史（最多6轮）
        recent = self._conversation.messages[-12:]
        for m in recent:
            if m.role == "tool":
                continue
            messages.append({"role": m.role, "content": m.content})

        return messages

    def _post_process(self, reply: str) -> str:
        """后处理 LLM 回答"""
        return reply

    def _help_text(self) -> str:
        """帮助信息"""
        lines = [
            "📖 stock-research 命令帮助\n",
            "┌─ 命令模式 ─────────────────────────────────┐",
            "│ /evaluate <代码> [评分卡]  个股全因子评估    │",
            "│ /screen <条件>...          多条件筛选       │",
            "│  /screen roe>15 debt_ratio<50              │",
            "│ /search <关键词>            搜索股票        │",
            "│ /portfolio 代码:权重...     组合分析        │",
            "│  /pf 600519:0.5 000858:0.5                 │",
            "│ /signal <代码>              策略信号        │",
            "│ /close                     收盘报告        │",
            "│ /morning                   开盘早报        │",
            "│ /history <代码>             历史评估        │",
            "│ /help                      显示本帮助      │",
            "└─────────────────────────────────────────────┘",
            "",
            "┌─ 对话模式 ─────────────────────────────────┐",
            "│ 直接输入自然语言，配置 DeepSeek 后自动分析   │",
            "│ 例如: \"分析茅台的基本面\"                    │",
            "│        \"帮我找找被低估的白酒股\"              │",
            "│        \"我的组合茅台五粮液各一半怎么样\"      │",
            "└─────────────────────────────────────────────┘",
            "",
            "⚠️  命令模式不需要 LLM 配置即可使用",
            "   对话模式需要先在 [设置] 中配置 API Key",
        ]
        return "\n".join(lines)

    @property
    def conversation(self) -> Conversation:
        return self._conversation

    @property
    def tools(self) -> ToolRegistry:
        return self._tools

    @property
    def llm_configured(self) -> bool:
        return self._llm is not None and self._llm.config.is_configured()

    def set_llm_config(self, config: LLMConfig):
        """更新 LLM 配置（运行时动态切换）"""
        self._llm = LLMProvider.create(config)
        self._settings.llm = config
