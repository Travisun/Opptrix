"""
stock-research Textual TUI — 固定面板，零滚动

全屏固定布局，所有内容在面板内原地更新。
输入框始终在底部可见，任何状态下都能键入。
"""

from __future__ import annotations

from datetime import datetime
from typing import Optional
import os, sys

from textual.app import App, ComposeResult
from textual.widgets import (
    Header, Input, RichLog, Static, Button, Label
)
from textual.containers import Horizontal, Vertical, Container
from textual.binding import Binding
from textual import work
from textual.message import Message

from ..integration.hub import ResearchHub
from ..agent.engine import AgentEngine
from ..llm.config import load_settings, save_settings, AppSettings

# ── 状态管理 ────────────────────────────────────


class StatusBar(Static):
    """底部状态栏，显示 LLM 状态和上下文"""

    def update_status(self, llm_ready: bool, last_cmd: str = "",
                      model: str = "", scorecard: str = ""):
        llm_part = f"[green]✅ {model}[/]" if llm_ready else "[yellow]⚠️ 未配置[/]"
        parts = [f"LLM: {llm_part}"]
        if last_cmd:
            parts.append(f"[dim]|  上次:[/] [white]{last_cmd[:35]}[/]")
        if scorecard:
            parts.append(f"[dim]|[/] [cyan]{scorecard}[/]")
        self.update("  ".join(parts))


class LoadingBar(Static):
    """加载指示器，短暂显示后自动隐藏"""

    def show(self, text: str = "⏳ 处理中..."):
        self.update(text)
        self.display = True

    def hide(self):
        self.display = False


# ── 主应用 ────────────────────────────────────────


class ResearchTUI(App):
    """固定面板式投研助手"""

    CSS_PATH = "research.tcss"
    TITLE = "🔍 stock-research 投研助手"
    BINDINGS = [
        Binding("ctrl+q", "app.quit", "退出"),
        Binding("ctrl+l", "clear_screen", "清屏"),
        Binding("escape", "focus_input", "输入焦点"),
    ]

    def __init__(self):
        super().__init__()
        self.settings = load_settings()
        self.hub = ResearchHub()
        self.agent = AgentEngine(self.hub, self.settings)
        self._last_cmd = ""
        self._is_processing = False

    # ── UI 构建 ────────────────────────────────────

    def compose(self) -> ComposeResult:
        # ── 顶部标题栏 ──
        with Container(id="title-bar"):
            yield Static("🔍 stock-research 投研助手  v0.3.0", id="app-title")
            yield Static("", id="app-clock")

        # ── 菜单按钮行 ──
        with Container(id="menu-row"):
            yield Button("个股", id="btn-stock", variant="default")
            yield Button("筛选", id="btn-screen", variant="default")
            yield Button("评估", id="btn-eval", variant="default")
            yield Button("组合", id="btn-portfolio", variant="default")
            yield Button("策略", id="btn-strategy", variant="default")
            yield Button("报告", id="btn-report", variant="default")
            yield Button("产业", id="btn-industry", variant="default")
            yield Button("设置", id="btn-settings", variant="default")
            yield Button("帮助", id="btn-help", variant="default")
            yield Button("退出", id="btn-quit", variant="default")

        # ── 加载指示器 ──
        yield LoadingBar("", id="loading-panel")

        # ── 主内容区 ──
        with Container(id="content-panel"):
            yield RichLog(
                id="content-area",
                highlight=True,
                markup=True,
                max_lines=2000,
                wrap=True,
            )

        # ── 底部状态栏 ──
        yield StatusBar("", id="status-panel")

        # ── 输入区域 ──
        with Container(id="input-panel"):
            yield Static("➤", id="input-prompt")
            yield Input(
                placeholder="输入命令 (/help) 或直接提问...",
                id="main-input",
            )
            yield Static("Ctrl+Q 退出", id="input-hint")

    def on_mount(self):
        """应用启动"""
        self._show_welcome()
        self._update_status()
        self._update_clock()
        self.set_interval(1, self._update_clock)
        # 确保输入框获得焦点
        self.call_after_refresh(self._focus_input)

    # ── 输入事件处理 ────────────────────────────

    def on_input_submitted(self, event: Input.Submitted):
        """输入框回车提交"""
        # 阻止事件传播
        event.stop()
        if self._is_processing:
            return
        cmd = event.value.strip()
        if not cmd:
            self._focus_input()
            return
        self._process_command(cmd)

    def _process_command(self, cmd: str):
        """处理命令（主线程调度）"""
        self._last_cmd = cmd
        self._update_status()

        # 清空输入框
        inp = self.query_one("#main-input", Input)
        inp.clear()

        # 特殊命令
        if cmd in ("/quit", "/exit"):
            self.exit()
            return
        if cmd in ("/clear", "clear"):
            self.query_one("#content-area", RichLog).clear()
            self._focus_input()
            return

        # 显示用户的输入
        content = self.query_one("#content-area", RichLog)
        content.write(f"\n[bold cyan]➤[/] [white]{cmd}[/]")

        # 显示加载指示
        loading = self.query_one("#loading-panel", LoadingBar)
        loading.show()

        # 后台执行
        self._run_agent(cmd)

    @work(thread=True)
    def _run_agent(self, cmd: str):
        """后台线程执行 agent"""
        self._is_processing = True
        try:
            reply = self.agent.chat(cmd)
            self.call_from_thread(self._show_result, reply)
        except Exception as e:
            self.call_from_thread(self._show_result, f"[bold red]❌ 错误:[/] {e}")
        finally:
            self._is_processing = False
            self.call_from_thread(self._done_processing)

    def _show_result(self, reply: str):
        """显示结果"""
        content = self.query_one("#content-area", RichLog)
        content.write(reply)
        content.scroll_home(animate=False)
        self._update_status()

    def _done_processing(self):
        """完成处理"""
        self.query_one("#loading-panel", LoadingBar).hide()
        self._focus_input()

    # ── 按钮事件 ────────────────────────────────────

    def on_button_pressed(self, event: Button.Pressed):
        """菜单按钮点击"""
        btn_map = {
            "btn-stock":    ("/evaluate 600519", "📊"),
            "btn-eval":     ("/evaluate 600519", "📊"),
            "btn-screen":   ("", "screen_help"),
            "btn-portfolio":("/pf 600519:0.5 000858:0.5", "📊"),
            "btn-strategy": ("/signal 600519", "📈"),
            "btn-report":   ("", "report_help"),
            "btn-industry": ("", "industry_help"),
            "btn-settings": ("", "show_settings"),
            "btn-help":     ("", "show_help"),
            "btn-quit":     ("/quit", ""),
        }
        entry = btn_map.get(event.button.id)
        if entry is None:
            return
        cmd, icon = entry

        if cmd and cmd != "/quit":
            self._process_command(cmd)
        elif cmd == "/quit":
            self.exit()
        elif icon == "screen_help":
            self._show_screen_help()
        elif icon == "report_help":
            self._show_report_help()
        elif icon == "industry_help":
            self._show_industry_help()
        elif icon == "show_settings":
            self._show_settings()
        elif icon == "show_help":
            self._show_help()

    # ── 内容显示 ────────────────────────────────────

    def _show_welcome(self):
        content = self.query_one("#content-area", RichLog)
        content.write(
            "[bold cyan]🔍 stock-research 投研助手[/] [white]v0.3.0[/]"
        )
        content.write("")
        content.write("[bold]快速开始:[/]")
        content.write("  [cyan]/evaluate 600519[/]   全因子评估")
        content.write("  [cyan]/screen roe>15[/]     多条件筛选")
        content.write("  [cyan]/help[/]              查看全部命令")
        content.write("")
        content.write("菜单按钮触发快捷操作，底部输入框支持命令和自然语言。")
        content.write("")

    def _show_help(self):
        content = self.query_one("#content-area", RichLog)
        content.write("")
        content.write("[bold cyan]📖 命令帮助[/]")
        content.write("")
        content.write("[bold]个股分析[/]")
        content.write("  [cyan]/evaluate <代码>[/]            全因子评估")
        content.write("  [cyan]/history <代码>[/]             历史评估")
        content.write("  [cyan]/signal <代码>[/]              策略信号")
        content.write("")
        content.write("[bold]筛选搜索[/]")
        content.write("  [cyan]/screen <条件>...[/]           多条件选股")
        content.write("  [cyan]  例: roe>15 debt_ratio<50[/]")
        content.write("  [cyan]/search <关键词>[/]            搜索股票")
        content.write("")
        content.write("[bold]组合[/]")
        content.write("  [cyan]/pf 代码:权重...[/]            组合分析")
        content.write("  [cyan]  例: 600519:0.5 000858:0.5[/]")
        content.write("")
        content.write("[bold]报告[/]")
        content.write("  [cyan]/close[/]                      收盘报告")
        content.write("  [cyan]/morning[/]                    开盘早报")
        content.write("")
        content.write("[bold]设置[/]")
        content.write("  [cyan]/set key <api_key>[/]          设置 API Key")
        content.write("  [cyan]/set model <名称>[/]           切换模型")
        content.write("")
        content.write("[bold]系统[/]")
        content.write("  [cyan]Ctrl+Q[/]                      退出")
        content.write("  [cyan]Ctrl+L[/]                      清屏")
        content.write("  [cyan]/help[/]                       本帮助")

    def _show_screen_help(self):
        content = self.query_one("#content-area", RichLog)
        content.write("")
        content.write("[bold yellow]🔍 筛选示例[/]")
        content.write("  [cyan]/screen roe>15 dividend_yield>1[/]")
        content.write("  [cyan]/screen pe_percentile<20[/]")
        content.write("  [cyan]/screen profit_cagr_3y>10 debt_ratio<50[/]")
        content.write("")
        content.write("支持: >, >=, <, <=, ==")

    def _show_report_help(self):
        content = self.query_one("#content-area", RichLog)
        content.write("")
        content.write("[bold yellow]📋 报告命令[/]")
        content.write("  [cyan]/close[/]      收盘报告（盘后）")
        content.write("  [cyan]/morning[/]    开盘早报（盘前）")

    def _show_industry_help(self):
        content = self.query_one("#content-area", RichLog)
        content.write("")
        content.write("[bold yellow]🏭 产业挖掘[/]")
        content.write("  直接输入行业名称提问，例如:")
        content.write('  "帮我分析半导体产业链"')
        content.write('  "新能源汽车的瓶颈环节"')

    def _show_settings(self):
        s = self.settings
        llm = s.llm
        key_display = f"****{llm.api_key[-4:]}" if llm.api_key else "⚠️ 未设置"
        content = self.query_one("#content-area", RichLog)
        content.write("")
        content.write("[bold cyan]⚙️ 设置[/]")
        content.write(f"  [1] Provider: [white]{llm.provider}[/]")
        content.write(f"  [2] 模型:     [white]{llm.model}[/]")
        content.write(f"  [3] API Key:  [white]{key_display}[/]")
        content.write(f"  [4] 评分卡:   [cyan]{s.default_scorecard}[/]")
        content.write(f"  [5] 主题:     [white]{s.theme}[/]")
        content.write("")
        content.write("[bold]设置命令:[/]")
        content.write('  [cyan]/set key <your_api_key>[/]')
        content.write('  [cyan]/set model deepseek-chat[/]')
        content.write('  [cyan]/set scorecard 综合评估[/]')

    # ── 定时更新 ────────────────────────────────────

    def _update_clock(self):
        try:
            clock = self.query_one("#app-clock", Static)
            clock.update(datetime.now().strftime("%H:%M:%S"))
        except Exception:
            pass

    def _update_status(self):
        try:
            bar = self.query_one("#status-panel", StatusBar)
            bar.update_status(
                self.agent.llm_configured,
                self._last_cmd,
                self.settings.llm.model,
                self.settings.default_scorecard,
            )
        except Exception:
            pass

    # ── 焦点管理 ────────────────────────────────────

    def _focus_input(self):
        """确保输入框获得焦点"""
        try:
            inp = self.query_one("#main-input", Input)
            self.set_focus(inp)
        except Exception:
            pass

    # ── Action handlers ──────────────────────────────

    def action_clear_screen(self):
        self.query_one("#content-area", RichLog).clear()
        self._focus_input()

    def action_focus_input(self):
        self._focus_input()
