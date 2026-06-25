"""
LLM 配置管理 — YAML 持久化 + API Key 安全存储

设计:
  - 配置存 ~/.stock_research/config.yaml
  - API Key 明文存（本地工具，不涉及分发）
  - 支持多 provider 切换
"""

from __future__ import annotations
import os
import yaml
from typing import Optional, List
from dataclasses import dataclass, field

from .provider import LLMConfig


CONFIG_PATH = os.path.expanduser("~/.stock_research/config.yaml")
SECRETS_PATH = os.path.expanduser("~/.stock_research/.secrets.yaml")


@dataclass
class AppSettings:
    """应用全局设置"""
    llm: LLMConfig = field(default_factory=LLMConfig)
    default_scorecard: str = "综合评估"
    default_top_n: int = 20
    verbose: bool = True
    theme: str = "dark"       # dark / light
    history_size: int = 50

    history: List[str] = field(default_factory=list)


def load_settings(path: Optional[str] = None) -> AppSettings:
    """从 YAML 加载设置"""
    path = path or CONFIG_PATH
    settings = AppSettings()

    if os.path.exists(path):
        with open(path, "r") as f:
            data = yaml.safe_load(f) or {}
        if "llm" in data:
            for k, v in data["llm"].items():
                if hasattr(settings.llm, k):
                    setattr(settings.llm, k, v)
        if "default_scorecard" in data:
            settings.default_scorecard = data["default_scorecard"]
        if "default_top_n" in data:
            settings.default_top_n = data["default_top_n"]
        if "theme" in data:
            settings.theme = data["theme"]
        if "history_size" in data:
            settings.history_size = data["history_size"]
        if "history" in data:
            settings.history = data["history"]

    # 从 secrets 加载 API Key（独立文件，可 .gitignore）
    secrets_path = SECRETS_PATH
    if os.path.exists(secrets_path):
        with open(secrets_path, "r") as f:
            secrets = yaml.safe_load(f) or {}
        if not settings.llm.api_key:
            settings.llm.api_key = secrets.get("api_key", "")
        if not settings.llm.base_url:
            settings.llm.base_url = secrets.get("base_url", settings.llm.base_url)

    return settings


def save_settings(settings: AppSettings, path: Optional[str] = None):
    """保存设置到 YAML"""
    path = path or CONFIG_PATH
    os.makedirs(os.path.dirname(path), exist_ok=True)
    os.makedirs(os.path.dirname(SECRETS_PATH), exist_ok=True)

    # 主配置 (不含 API Key)
    data = {
        "llm": {
            "provider": settings.llm.provider,
            "model": settings.llm.model,
            "base_url": settings.llm.base_url,
            "temperature": settings.llm.temperature,
            "max_tokens": settings.llm.max_tokens,
        },
        "default_scorecard": settings.default_scorecard,
        "default_top_n": settings.default_top_n,
        "theme": settings.theme,
        "history_size": settings.history_size,
        "history": settings.history[-settings.history_size:],
    }
    with open(path, "w") as f:
        yaml.dump(data, f, default_flow_style=False, allow_unicode=True)

    # Secrets (API Key)
    secrets = {}
    existing = {}
    if os.path.exists(SECRETS_PATH):
        with open(SECRETS_PATH, "r") as f:
            existing = yaml.safe_load(f) or {}
    secrets["api_key"] = settings.llm.api_key or existing.get("api_key", "")
    secrets["base_url"] = settings.llm.base_url or existing.get("base_url", "")
    with open(SECRETS_PATH, "w") as f:
        yaml.dump(secrets, f, default_flow_style=False)

    # 权限保护
    os.chmod(SECRETS_PATH, 0o600)
