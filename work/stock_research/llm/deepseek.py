"""
DeepSeek API 客户端 — 兼容 OpenAI 格式

支持:
  - Chat Completions
  - 流式/非流式
  - 模型列表查询
"""

from __future__ import annotations
from typing import List, Dict, Optional
import json
import requests

from .provider import LLMProvider, LLMConfig


class DeepSeekProvider(LLMProvider):
    """DeepSeek API 客户端"""

    def chat(self, messages: List[Dict[str, str]],
             stream: bool = False) -> str:
        if not self.config.is_configured():
            return "[LLM 未配置] 请在设置中填入 API Key"

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
                headers=headers,
                json=payload,
                timeout=self.config.timeout,
            )
            resp.raise_for_status()

            if stream:
                return self._handle_stream(resp)
            data = resp.json()
            return data["choices"][0]["message"]["content"]

        except requests.exceptions.Timeout:
            return "⚠️ API 请求超时，请检查网络或增大 timeout 设置"
        except requests.exceptions.ConnectionError:
            return "⚠️ 无法连接 API 服务器，请检查 base_url 配置"
        except requests.exceptions.HTTPError as e:
            status = e.response.status_code
            if status == 401:
                return "⚠️ API Key 无效，请在设置中重新配置"
            elif status == 429:
                return "⚠️ 请求过于频繁，请稍后再试"
            return f"⚠️ HTTP {status}: {e.response.text[:200]}"
        except (json.JSONDecodeError, KeyError) as e:
            return f"⚠️ API 返回格式异常: {e}"
        except Exception as e:
            return f"⚠️ 请求失败: {e}"

    def _handle_stream(self, resp: requests.Response) -> str:
        """处理流式响应"""
        result = ""
        for line in resp.iter_lines():
            if not line:
                continue
            line = line.decode("utf-8")
            if line.startswith("data: "):
                data_str = line[6:]
                if data_str == "[DONE]":
                    break
                try:
                    chunk = json.loads(data_str)
                    delta = chunk.get("choices", [{}])[0].get("delta", {})
                    content = delta.get("content", "")
                    result += content
                except json.JSONDecodeError:
                    continue
        return result

    def list_models(self) -> List[str]:
        """查询可用模型"""
        default_models = [
            "deepseek-chat",
            "deepseek-reasoner",
        ]
        if not self.config.is_configured():
            return default_models

        try:
            headers = {"Authorization": f"Bearer {self.config.api_key}"}
            resp = requests.get(
                f"{self.config.base_url.rstrip('/')}/models",
                headers=headers,
                timeout=10,
            )
            if resp.status_code == 200:
                models = resp.json().get("data", [])
                return [m["id"] for m in models] or default_models
        except Exception:
            pass
        return default_models
