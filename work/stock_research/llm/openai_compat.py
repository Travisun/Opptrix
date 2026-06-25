"""OpenAI 兼容 API 客户端 — 用于兼容任意 OpenAI 格式的 API"""
from __future__ import annotations
from typing import List, Dict
import json, requests
from .provider import LLMProvider, LLMConfig


class OpenAICompatibleProvider(LLMProvider):
    """通用 OpenAI 兼容 API"""

    def chat(self, messages: List[Dict[str, str]],
             stream: bool = False) -> str:
        if not self.config.is_configured():
            return "[LLM 未配置]"
        headers = {
            "Authorization": f"Bearer {self.config.api_key}",
            "Content-Type": "application/json",
        }
        payload = {
            "model": self.config.model,
            "messages": messages,
            "temperature": self.config.temperature,
            "max_tokens": self.config.max_tokens,
            "stream": stream,
        }
        try:
            resp = requests.post(
                f"{self.config.base_url.rstrip('/')}/chat/completions",
                headers=headers, json=payload, timeout=self.config.timeout,
            )
            resp.raise_for_status()
            data = resp.json()
            return data["choices"][0]["message"]["content"]
        except Exception as e:
            return f"⚠️ API 请求失败: {e}"

    def list_models(self) -> List[str]:
        return [self.config.model]
