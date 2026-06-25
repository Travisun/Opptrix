"""
LLM Provider 抽象 — 支持多模型后端

设计原则:
  - Provider 只负责发送/接收消息
  - Config 管理 API key / model / endpoint
  - 新增一个后端只需实现 chat() 方法
"""

from __future__ import annotations
from abc import ABC, abstractmethod
from dataclasses import dataclass, field
from typing import Optional, List, Dict, Any


@dataclass
class LLMConfig:
    """LLM 配置"""
    provider: str = "deepseek"       # deepseek / openai / ...
    api_key: str = ""
    model: str = "deepseek-chat"
    base_url: str = "https://api.deepseek.com/v1"
    temperature: float = 0.7
    max_tokens: int = 2048
    timeout: int = 60
    system_prompt: str = ""

    def to_dict(self) -> dict:
        return {
            "provider": self.provider,
            "api_key": "****" + self.api_key[-4:] if self.api_key else "",
            "model": self.model,
            "base_url": self.base_url,
            "temperature": self.temperature,
            "max_tokens": self.max_tokens,
        }

    @classmethod
    def default(cls) -> "LLMConfig":
        return cls()

    def is_configured(self) -> bool:
        return bool(self.api_key) and bool(self.base_url)


class LLMProvider(ABC):
    """LLM 提供者抽象基类"""

    def __init__(self, config: LLMConfig):
        self.config = config

    @abstractmethod
    def chat(self, messages: List[Dict[str, str]],
             stream: bool = False) -> str:
        """
        发送对话消息

        messages: [{"role": "system", "content": "..."},
                   {"role": "user", "content": "..."}]
        """
        ...

    @abstractmethod
    def list_models(self) -> List[str]:
        """列出可用模型"""
        ...

    @property
    def name(self) -> str:
        return self.config.model

    @classmethod
    def create(cls, config: LLMConfig) -> "LLMProvider":
        """工厂方法"""
        if config.provider == "deepseek":
            from .deepseek import DeepSeekProvider
            return DeepSeekProvider(config)
        elif config.provider == "openai":
            from .openai_compat import OpenAICompatibleProvider
            return OpenAICompatibleProvider(config)
        else:
            raise ValueError(f"不支持的 provider: {config.provider}")
