"""
统一 HTTP 客户端 — 全线绕过系统代理，统一超时/重试/报错。

强制策略:
1. session.trust_env = False  — requests 完全忽略 HTTP_PROXY/HTTPS_PROXY 等环境变量
2. 空 proxies 映射            — 不走任何代理
3. 统一超时 + 重试适配器      — 连接/读取超时 + 自动重试
4. 统一 User-Agent            — 所有 driver 使用同一请求头
"""

from __future__ import annotations

import logging
from typing import Optional

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry

logger = logging.getLogger("a_stock_layer.http")

# ── 全局唯一 Session（单例） ──────────────────────────────────────────

_session: Optional[requests.Session] = None


def get_session() -> requests.Session:
    """获取全局统一 Session（懒初始化）。"""
    global _session
    if _session is not None:
        return _session

    session = requests.Session()

    # ── 核心：彻底切断 proxy ──────────────────────────────────────────
    # trust_env=False 让 requests 完全忽略 HTTP_PROXY/HTTPS_PROXY 等环境变量
    session.trust_env = False
    # 显式置空 proxy 配置（双重保证）
    session.proxies = {"http": "", "https": ""}

    # ── 默认请求头 ────────────────────────────────────────────────────
    session.headers.update({
        "User-Agent": (
            "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/120.0.0.0 Safari/537.36"
        ),
        "Accept": "application/json, text/plain, */*",
        "Accept-Language": "zh-CN,zh;q=0.9,en;q=0.8",
    })

    # ── 重试适配器 ────────────────────────────────────────────────────
    retry_strategy = Retry(
        total=2,                    # 最多重试2次
        backoff_factor=1,           # 退避: 1s, 2s
        status_forcelist=[429, 500, 502, 503, 504],
        allowed_methods=["GET"],
    )
    adapter = HTTPAdapter(
        max_retries=retry_strategy,
        pool_connections=20,
        pool_maxsize=50,
    )
    session.mount("https://", adapter)
    session.mount("http://", adapter)

    _session = session
    logger.debug("HTTP 客户端初始化: trust_env=False, proxy=off, retry=2")
    return session


def reset_session():
    """重置 Session（用于测试或配置变更后）。"""
    global _session
    _session = None


# ── 便捷方法 ──────────────────────────────────────────────────────────

def get(url: str, **kwargs) -> requests.Response:
    """GET 请求（自动绕过 proxy）。"""
    session = get_session()
    kwargs.setdefault("timeout", 15)
    return session.get(url, **kwargs)


def post(url: str, **kwargs) -> requests.Response:
    """POST 请求（自动绕过 proxy）。"""
    session = get_session()
    kwargs.setdefault("timeout", 15)
    return session.post(url, **kwargs)


def verify_session():
    """验证当前 session 是否确实禁用了 proxy。

    返回诊断信息 dict。
    """
    s = get_session()
    return {
        "trust_env": s.trust_env,
        "proxies": dict(s.proxies),
        "headers": dict(s.headers),
        "adapter_count": len(s.adapters),
    }
