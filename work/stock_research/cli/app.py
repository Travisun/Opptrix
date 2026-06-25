"""
stock-research 主面板

功能:
  - Rich 面板布局 (header / menu / content / footer / input)
  - 命令循环 (提示符 > )
  - 子菜单系统
  - 设置界面 (LLM API Key / 模型 / 评分卡)
  - 底部 agent 对话栏
"""

from __future__ import annotations
import os
import sys
from typing import Optional, List
from datetime import datetime

from rich.console import Console
from rich.layout import Layout
from rich.panel import Panel
from rich.table import Table
from rich.text import Text
from rich.live import Live
from rich import box
from rich.prompt import Prompt, Confirm

from ..integration.hub import ResearchHub
from ..agent.engine import AgentEngine
from ..llm.provider import LLMConfig
from ..llm.config import load_settings, save_settings, AppSettings
from .styles import DARK_THEME, LIGHT_THEME, score_color

console = Console()


class ResearchApp:
    """
    主应用

    面板结构:
      header  — 标题 + 状态
      menu    — 主菜单栏
      content — 结果显示区
      footer  — 状态栏 (LLM / 上次操作)
      input   — 命令输入
    """

    def __init__(self):
        self.settings = load_settings()
        self.theme = DARK_THEME if self.settings.theme == "dark" else LIGHT_THEME
        self.hub = ResearchHub()
        self.agent = AgentEngine(self.hub, self.settings)

        self._last_result = ""
        self._last_command = ""
        self._running = True

    def run(self):
        """主循环"""
        self._clear()
        self._show_header()

        while self._running:
            self._show_content()
            cmd = self._get_input()

            if not cmd:
                continue

            self._last_command = cmd

            if cmd == "0" or cmd == "/quit":
                self._running = False
                break

            self._handle_menu(cmd)

        self._show_goodbye()

    # ── 渲染 ────────────────────────────────────────

    def _show_header(self):
        """绘制顶部标题"""
        title = Text()
        title.append(" 🔍 stock-research ", style="bold cyan")
        title.append("投研助手", style="bold white")
        title.append(f"  v0.2.0", style="grey62")
        console.print(Panel(title, box=box.ROUNDED, style="cyan"))

    def _show_content(self):
        """绘制主内容区"""
        # 菜单
        menu = Table.grid(padding=(0, 2))
        menu.add_row(
            Text("[1]个股速览", style="bold"),
            Text("[2]筛选器", style="bold"),
            Text("[3]深度评估", style="bold"),
            Text("[4]组合分析", style="bold"),
        )
        menu.add_row(
            Text("[5]策略信号", style="bold"),
            Text("[6]收盘早报", style="bold"),
            Text("[7]产业挖掘", style="bold"),
            Text("[8]设置", style="bold"),
        )
        console.print(Panel(menu, box=box.SQUARE, style=self.theme["secondary"]))

        # 结果区
        if self._last_result:
            result_panel = Panel(
                self._last_result,
                title="结果",
                border_style=self.theme["primary"],
                box=box.ROUNDED,
            )
            console.print(result_panel)
        else:
            welcome = Text()
            welcome.append("\n欢迎使用 stock-research 投研助手\n\n", style="bold")
            welcome.append("快速开始:\n", style="bold")
            welcome.append("  • 直接输入命令，如 /evaluate 600519\n", style="")
            welcome.append("  • 输入 /help 查看全部命令\n", style="")
            welcome.append("  • 按 8 进入设置配置 DeepSeek API\n", style="")
            welcome.append("  • 配置后直接自然语言对话\n", style="")
            welcome.append("\n输入命令或直接提问: ", style="grey62")
            console.print(Panel(welcome, box=box.ROUNDED))

    def _show_prompt_line(self):
        """底部输入状态栏"""
        llm_status = "✅ 已配置" if self.agent.llm_configured else "⚠️ 未配置"
        model_name = self.settings.llm.model if self.agent.llm_configured else ""
        last = self._last_command[:40] if self._last_command else ""
        status = Text()
        status.append(f" LLM: {llm_status}", style="green" if self.agent.llm_configured else "yellow")
        if model_name:
            status.append(f" ({model_name})", style=self.theme["info"])
        status.append(f"  |  ", style="grey42")
        status.append(f"上次: {last}", style="grey62")
        console.print(Panel(status, box=box.SQUARE, style=self.theme["header_bg"]))

    def _get_input(self) -> str:
        """获取用户输入"""
        self._show_prompt_line()
        try:
            cmd = Prompt.ask(">")
            return cmd.strip()
        except (EOFError, KeyboardInterrupt):
            return "/quit"
        except Exception:
            return ""

    def _handle_menu(self, cmd: str):
        """处理菜单命令"""
        handlers = {
            "1": self._menu_quick_lookup,
            "2": self._menu_screener,
            "3": self._menu_deep_eval,
            "4": self._menu_portfolio,
            "5": self._menu_strategy,
            "6": self._menu_reports,
            "7": self._menu_industry,
            "8": self._menu_settings,
            "help": self._show_help,

            # 直接命令也允许
            "/evaluate": lambda: self._run_command(cmd),
            "/screen": lambda: self._run_command(cmd),
            "/search": lambda: self._run_command(cmd),
            "/portfolio": lambda: self._run_command(cmd),
            "/pf": lambda: self._run_command(cmd),
            "/signal": lambda: self._run_command(cmd),
            "/close": lambda: self._run_command(cmd),
            "/closing": lambda: self._run_command(cmd),
            "/morning": lambda: self._run_command(cmd),
            "/brief": lambda: self._run_command(cmd),
            "/history": lambda: self._run_command(cmd),
        }

        handler = handlers.get(cmd)
        if handler:
            handler()
        else:
            # 作为自然语言输入，尝试 agent
            self._handle_chat(cmd)

    def _run_command(self, cmd: str):
        """运行 / 命令并显示结果"""
        reply = self.agent.chat(cmd)
        self._last_result = reply

    def _handle_chat(self, text: str):
        """通过 agent 处理自然语言"""
        if not text.strip():
            return
        with console.status("思考中..."):
            reply = self.agent.chat(text)
        self._last_result = reply

    # ── 子菜单 ────────────────────────────────────

    def _menu_quick_lookup(self):
        """个股速览"""
        code = Prompt.ask("输入股票代码", default="600519")
        if not code:
            return
        self._run_command(f"/evaluate {code}")

    def _menu_screener(self):
        """筛选器"""
        console.print(Panel(
            "输入筛选条件，用空格分隔\n"
            "示例: roe>15 debt_ratio<50 dividend_yield>1\n"
            "支持运算符: >, >=, <, <=, ==",
            title="筛选条件", box=box.ROUNDED,
        ))
        cond_str = Prompt.ask("条件")
        if not cond_str.strip():
            # 交互式录入
            conds = []
            while True:
                c = Prompt.ask("添加条件 (留空结束)", default="")
                if not c:
                    break
                conds.append(c)
            if conds:
                self._run_command(f"/screen {' '.join(conds)}")
        else:
            self._run_command(f"/screen {cond_str}")

    def _menu_deep_eval(self):
        """深度评估"""
        code = Prompt.ask("股票代码", default="600519")
        scorecard = Prompt.ask(
            "评分卡",
            default=self.settings.default_scorecard
        )
        if code:
            self._run_command(f"/evaluate {code} {scorecard}")

    def _menu_portfolio(self):
        """组合分析"""
        console.print("输入持仓: 代码:权重(%), 用空格分隔")
        console.print("示例: 600519:40 000858:30 000333:30")
        raw = Prompt.ask("持仓")
        if raw.strip():
            self._run_command(f"/portfolio {raw}")

    def _menu_strategy(self):
        """策略信号"""
        code = Prompt.ask("股票代码", default="600519")
        self._run_command(f"/signal {code}")

    def _menu_reports(self):
        """收盘/早报"""
        console.print(Panel(
            "[1] 收盘报告  [2] 开盘早报",
            box=box.ROUNDED,
        ))
        choice = Prompt.ask("选择", default="1")
        if choice == "1":
            self._run_command("/close")
        else:
            self._run_command("/morning")

    def _menu_industry(self):
        """产业挖掘"""
        industry = Prompt.ask("输入行业名称", default="半导体")
        if industry:
            with console.status("挖掘产业链..."):
                result = self.hub.get_industry_mining(industry)
            if result.success:
                report = result.data.get("report", "")
                self._last_result = report[:2000]
            else:
                self._last_result = f"产业链挖掘暂不可用: {result.message}"

    def _menu_settings(self):
        """设置面板"""
        while True:
            self._show_settings_panel()
            choice = Prompt.ask("选择 (m=返回主菜单)", default="m")
            if choice == "m":
                break
            self._handle_settings(choice)

    def _show_settings_panel(self):
        """设置面板"""
        s = self.settings
        llm = s.llm
        api_display = f"****{llm.api_key[-4:]}" if llm.api_key else "未设置"

        table = Table(box=box.SIMPLE)
        table.add_column("项", style="bold")
        table.add_column("值")
        table.add_row("[1] LLM Provider", llm.provider)
        table.add_row("[2] 模型", llm.model)
        table.add_row("[3] API Key", api_display)
        table.add_row("[4] API Base URL", llm.base_url)
        table.add_row("[5] 默认评分卡", s.default_scorecard)
        table.add_row("[6] 默认展示数量", str(s.default_top_n))
        table.add_row("[7] 主题", s.theme)

        console.print(Panel(table, title="⚙️ 设置", box=box.ROUNDED))

    def _handle_settings(self, choice: str):
        """处理设置变更"""
        if choice == "1":
            provider = Prompt.ask("Provider", default=self.settings.llm.provider)
            self.settings.llm.provider = provider
        elif choice == "2":
            model = Prompt.ask("模型名称", default=self.settings.llm.model)
            self.settings.llm.model = model
        elif choice == "3":
            key = Prompt.ask("API Key", password=True)
            if key:
                self.settings.llm.api_key = key
        elif choice == "4":
            url = Prompt.ask("Base URL", default=self.settings.llm.base_url)
            self.settings.llm.base_url = url
        elif choice == "5":
            from ..scoring.scorecard import list_templates
            templates = list_templates()
            console.print("可选评分卡:")
            for i, t in enumerate(templates, 1):
                console.print(f"  {i}. {t}")
            sc_name = Prompt.ask("评分卡名称", default=self.settings.default_scorecard)
            if sc_name in templates:
                self.settings.default_scorecard = sc_name
        elif choice == "6":
            n = Prompt.ask("默认展示数量", default=str(self.settings.default_top_n))
            try:
                self.settings.default_top_n = int(n)
            except ValueError:
                pass
        elif choice == "7":
            theme = Prompt.ask("主题 (dark/light)", default=self.settings.theme)
            if theme in ("dark", "light"):
                self.settings.theme = theme
                self.theme = DARK_THEME if theme == "dark" else LIGHT_THEME

        # 保存并更新 agent
        save_settings(self.settings)
        if self.settings.llm.is_configured():
            self.agent.set_llm_config(self.settings.llm)
        console.print("✅ 设置已保存", style="green")

    def _show_help(self):
        """显示帮助"""
        self._run_command("/help")

    # ── 工具 ────────────────────────────────────────

    @staticmethod
    def _clear():
        os.system("clear" if os.name == "posix" else "cls")

    def _show_goodbye(self):
        self._clear()
        console.print(Panel(
            Text("感谢使用 stock-research，投资顺利！", style="bold cyan"),
            box=box.DOUBLE,
        ))
