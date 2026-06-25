"""
持久化缓存层 — SQLite 后端，按数据类型设置 TTL。

缓存策略:
- 实时行情: 不缓存 (TTL=0)
- K线数据: 缓存60分钟
- 资金流: 缓存60分钟
- 板块列表: 缓存24小时
- 股票基本信息: 缓存7天
- 交易日历: 缓存30天
"""

from __future__ import annotations

import json
import logging
import os
import sqlite3
import threading
import time
from datetime import datetime, timedelta
from typing import Any, Optional

logger = logging.getLogger("a_stock_layer.cache")

# 默认 TTL（秒）
DEFAULT_TTL: dict[str, int] = {
    "stock_kline":      3600,       # 1小时
    "stock_money_flow": 3600,       # 1小时
    "index_kline":      3600,       # 1小时
    "index_realtime":   0,          # 不缓存
    "stock_realtime":   0,          # 不缓存
    "market_money_flow": 3600,      # 1小时
    "sector_money_flow": 3600,      # 1小时
    "sector_list":      86400,      # 24小时
    "stock_basic":      604800,     # 7天
    "stock_profile":    86400,      # 24小时
    "shareholder":      86400,      # 24小时
    "financial_summary": 86400,     # 24小时
    "news":             3600,       # 1小时
    "sentiment":        0,          # 不缓存
    "dragon_tiger":     3600,       # 1小时
    "margin_trade":     3600,       # 1小时
    "dividend":         86400,      # 24小时
    "balance_sheet":    86400,      # 24小时
    "income_statement": 86400,      # 24小时
    "cash_flow":        86400,      # 24小时
    "inst_holding":     86400,      # 24小时
    "block_trade":      3600,       # 1小时
    "lockup_expiry":    3600,       # 1小时
    "share_pledge":     86400,      # 24小时
    "intraday_tick":    0,          # 不缓存
    "stock_list":       86400,      # 24小时
    "index_constituent":86400,      # 24小时
    "insider_trade":    3600,       # 1小时
    "perf_forecast":    86400,      # 24小时
    "limit_updown":     0,          # 不缓存
    "market_breadth":   0,          # 不缓存
    "ipo_data":         86400,      # 24小时
    "convertible_bond": 0,          # 不缓存
    "etf_data":         3600,       # 1小时
    "manager_info":     86400,      # 24小时
    "shareholder_plan": 3600,       # 1小时
    "buyback":          3600,       # 1小时
    "global_index":     0,          # 不缓存
    "exchange_rate":    3600,       # 1小时
    "macro_indicator":  86400,      # 24小时
    "tech_indicator":   3600,       # 1小时
    "trade_calendar":   2592000,    # 30天
    "main_business":       86400,      # 24小时
    "top_customer":        86400,      # 24小时
    "top_supplier":        86400,      # 24小时
    "actual_controller":   86400,      # 24小时
    "subsidiary":          86400,      # 24小时
    "related_party":       86400,      # 24小时
    "rd_investment":       86400,      # 24小时
    "merger_acquisition":  86400,      # 24小时
    "employee_composition": 86400,      # 24小时
    "institutional_visit": 3600,       # 1小时
    "peer_company":        604800,     # 7天
}


class Cache:
    """SQLite 持久缓存，线程安全。"""

    _instance = None
    _lock = threading.Lock()

    def __new__(cls, db_path: Optional[str] = None):
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
                    cls._instance._initialized = False
        return cls._instance

    def __init__(self, db_path: Optional[str] = None):
        if getattr(self, "_initialized", False):
            return
        self._initialized = True

        if db_path is None:
            cache_dir = os.path.join(
                os.path.expanduser("~"), ".cache", "ashare"
            )
            os.makedirs(cache_dir, exist_ok=True)
            db_path = os.path.join(cache_dir, "a_stock_layer_cache.db")

        self._db_path = db_path
        self._local = threading.local()
        self._init_db()
        logger.info("缓存初始化: %s", self._db_path)

    def _get_conn(self) -> sqlite3.Connection:
        if not hasattr(self._local, "conn") or self._local.conn is None:
            self._local.conn = sqlite3.connect(
                self._db_path, timeout=10, check_same_thread=False
            )
            self._local.conn.execute("PRAGMA journal_mode=WAL")
            self._local.conn.execute("PRAGMA synchronous=NORMAL")
        return self._local.conn

    def _init_db(self):
        conn = self._get_conn()
        conn.execute("""
            CREATE TABLE IF NOT EXISTS cache (
                cache_key TEXT PRIMARY KEY,
                data_type TEXT NOT NULL,
                data TEXT NOT NULL,
                created_at REAL NOT NULL,
                expires_at REAL NOT NULL
            )
        """)
        conn.execute("""
            CREATE INDEX IF NOT EXISTS idx_cache_expires
            ON cache(expires_at)
        """)
        conn.commit()

    def _make_key(self, data_type: str, **params) -> str:
        """生成缓存键。"""
        parts = [data_type]
        for k, v in sorted(params.items()):
            parts.append(f"{k}={v}")
        return ":".join(parts)

    def get(self, data_type: str, **params) -> Optional[Any]:
        """读取缓存，过期或不存在返回 None。"""
        key = self._make_key(data_type, **params)
        now = time.time()
        try:
            conn = self._get_conn()
            row = conn.execute(
                "SELECT data, expires_at FROM cache WHERE cache_key = ?",
                (key,)
            ).fetchone()
            if row is None:
                return None
            data_json, expires_at = row
            if now > expires_at:
                conn.execute("DELETE FROM cache WHERE cache_key = ?", (key,))
                conn.commit()
                return None
            return json.loads(data_json)
        except Exception as e:
            logger.debug("缓存读取失败: %s", e)
            return None

    def set(self, data_type: str, data: Any, ttl: Optional[int] = None, **params) -> None:
        """写入缓存。"""
        if ttl is None:
            ttl = DEFAULT_TTL.get(data_type, 3600)
        if ttl <= 0:
            return  # TTL<=0 不缓存

        key = self._make_key(data_type, **params)
        now = time.time()
        expires_at = now + ttl
        try:
            conn = self._get_conn()
            conn.execute(
                """INSERT OR REPLACE INTO cache (cache_key, data_type, data, created_at, expires_at)
                   VALUES (?, ?, ?, ?, ?)""",
                (key, data_type, json.dumps(data, ensure_ascii=False), now, expires_at)
            )
            conn.commit()
        except Exception as e:
            logger.debug("缓存写入失败: %s", e)

    def delete(self, data_type: str, **params) -> None:
        """删除指定缓存。"""
        key = self._make_key(data_type, **params)
        try:
            conn = self._get_conn()
            conn.execute("DELETE FROM cache WHERE cache_key = ?", (key,))
            conn.commit()
        except Exception as e:
            logger.debug("缓存删除失败: %s", e)

    def clear_type(self, data_type: str) -> int:
        """清除某类型的所有缓存。返回清除条数。"""
        try:
            conn = self._get_conn()
            cursor = conn.execute("DELETE FROM cache WHERE data_type = ?", (data_type,))
            conn.commit()
            return cursor.rowcount
        except Exception as e:
            logger.debug("缓存清除失败: %s", e)
            return 0

    def clear_all(self) -> int:
        """清除所有缓存。"""
        try:
            conn = self._get_conn()
            cursor = conn.execute("DELETE FROM cache")
            conn.commit()
            return cursor.rowcount
        except Exception as e:
            logger.debug("缓存全部清除失败: %s", e)
            return 0

    def cleanup_expired(self) -> int:
        """清理过期缓存。返回清理条数。"""
        try:
            conn = self._get_conn()
            cursor = conn.execute("DELETE FROM cache WHERE expires_at < ?", (time.time(),))
            conn.commit()
            return cursor.rowcount
        except Exception as e:
            logger.debug("过期缓存清理失败: %s", e)
            return 0
