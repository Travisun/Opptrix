"""
UI 样式 — 颜色方案和主题
"""

from __future__ import annotations
from typing import Dict
from rich.style import Style
from rich.color import Color

# 主题色
DARK_THEME = {
    "primary": "cyan",
    "secondary": "blue",
    "success": "green",
    "warning": "yellow",
    "danger": "red",
    "info": "bright_blue",
    "muted": "grey62",
    "highlight": "bold cyan",
    "score_high": "green",
    "score_mid": "yellow",
    "score_low": "red",
    "header_bg": "grey19",
    "input_bg": "grey11",
}

LIGHT_THEME = {
    "primary": "blue",
    "secondary": "cyan",
    "success": "green",
    "warning": "dark_orange",
    "danger": "red",
    "info": "blue",
    "muted": "grey50",
    "highlight": "bold blue",
    "score_high": "green",
    "score_mid": "dark_orange",
    "score_low": "red",
    "header_bg": "grey85",
    "input_bg": "white",
}

# 评分颜色映射
def score_color(score: float, theme: Dict) -> str:
    if score is None:
        return theme["muted"]
    if score >= 75:
        return theme["success"]
    elif score >= 55:
        return theme["warning"]
    else:
        return theme["danger"]

def change_color(value: float, theme: Dict) -> str:
    if value is None:
        return theme["muted"]
    return theme["success"] if value >= 0 else theme["danger"]
