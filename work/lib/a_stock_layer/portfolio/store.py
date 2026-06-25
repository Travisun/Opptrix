"""
持仓数据持久化 — SQLite 存储层

数据库位置: ~/.a_stock_layer/portfolio.db
"""

from __future__ import annotations

import logging
import os
import sqlite3
import threading
from datetime import datetime
from typing import List, Optional

from .models import TradeRecord, TradeSide

logger = logging.getLogger("a_stock_layer.portfolio.store")

DB_DIR = os.path.join(os.path.expanduser("~"), ".a_stock_layer")
DB_PATH = os.path.join(DB_DIR, "portfolio.db")


_DB_SCHEMA = """
CREATE TABLE IF NOT EXISTS config (
    key   TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
INSERT OR IGNORE INTO config VALUES ('commission_rate', '0.00025');
INSERT OR IGNORE INTO config VALUES ('commission_min', '5.0');
INSERT OR IGNORE INTO config VALUES ('stamp_duty_rate', '0.0005');
INSERT OR IGNORE INTO config VALUES ('transfer_fee_rate', '0.00001');

CREATE TABLE IF NOT EXISTS stock_config (
    code              TEXT PRIMARY KEY,
    commission_rate   REAL,
    commission_min    REAL,
    stamp_duty_rate   REAL,
    transfer_fee_rate REAL
);

CREATE TABLE IF NOT EXISTS trades (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    code        TEXT NOT NULL,
    name        TEXT DEFAULT '',
    trade_side  TEXT NOT NULL CHECK(trade_side IN ('buy','sell')),
    shares      REAL NOT NULL,
    price       REAL NOT NULL,
    amount      REAL NOT NULL,
    commission  REAL DEFAULT 0,
    stamp_duty  REAL DEFAULT 0,
    transfer_fee REAL DEFAULT 0,
    total_fee   REAL DEFAULT 0,
    trade_date  TEXT NOT NULL,
    created_at  TEXT DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_trades_code ON trades(code);
CREATE INDEX IF NOT EXISTS idx_trades_date ON trades(trade_date);
"""


class PortfolioStore:
    """持仓数据存储（线程安全）"""

    _instance = None
    _lock = threading.Lock()

    def __new__(cls):
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = super().__new__(cls)
                    cls._instance._initialized = False
        return cls._instance

    def __init__(self):
        if getattr(self, "_initialized", False):
            return
        self._initialized = True
        self._local = threading.local()
        os.makedirs(DB_DIR, exist_ok=True)
        self._init_db()
        logger.info("持仓数据库: %s", DB_PATH)

    def _get_conn(self) -> sqlite3.Connection:
        if not hasattr(self._local, "conn") or self._local.conn is None:
            self._local.conn = sqlite3.connect(DB_PATH, timeout=10)
            self._local.conn.row_factory = sqlite3.Row
            self._local.conn.execute("PRAGMA journal_mode=WAL")
            self._local.conn.execute("PRAGMA foreign_keys=ON")
        return self._local.conn

    def _init_db(self):
        conn = self._get_conn()
        conn.executescript(_DB_SCHEMA)
        conn.commit()

    # ── 交易 CRUD ────────────────────────────────────────────────

    def add_trade(self, rec: TradeRecord) -> int:
        conn = self._get_conn()
        cur = conn.execute(
            """INSERT INTO trades (code, name, trade_side, shares, price, amount,
               commission, stamp_duty, transfer_fee, total_fee, trade_date)
               VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
            (rec.code, rec.name, rec.trade_side, rec.shares, rec.price, rec.amount,
             rec.commission, rec.stamp_duty, rec.transfer_fee, rec.total_fee, rec.trade_date)
        )
        conn.commit()
        return cur.lastrowid or 0

    def delete_trade(self, trade_id: int) -> bool:
        conn = self._get_conn()
        cur = conn.execute("DELETE FROM trades WHERE id=?", (trade_id,))
        conn.commit()
        return cur.rowcount > 0

    def get_trades(self, code: str = "") -> List[TradeRecord]:
        conn = self._get_conn()
        if code:
            rows = conn.execute(
                "SELECT * FROM trades WHERE code=? ORDER BY trade_date ASC, id ASC",
                (code.strip().zfill(6),)
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT * FROM trades ORDER BY trade_date DESC, id DESC LIMIT 500"
            ).fetchall()
        results = []
        for r in rows:
            results.append(TradeRecord(
                id=r["id"], code=r["code"], name=r["name"] or "",
                trade_side=r["trade_side"], shares=r["shares"],
                price=r["price"], amount=r["amount"],
                commission=r["commission"] or 0,
                stamp_duty=r["stamp_duty"] or 0,
                transfer_fee=r["transfer_fee"] or 0,
                total_fee=r["total_fee"] or 0,
                trade_date=r["trade_date"], created_at=r["created_at"] or "",
            ))
        return results

    def clear_all(self) -> int:
        conn = self._get_conn()
        cur = conn.execute("DELETE FROM trades")
        conn.commit()
        return cur.rowcount

    def get_stats(self) -> dict:
        conn = self._get_conn()
        r = conn.execute(
            "SELECT COUNT(*) as cnt, COALESCE(SUM(shares),0) as sum_shares, "
            "COUNT(DISTINCT code) as stocks FROM trades"
        ).fetchone()
        return {"trades": r["cnt"], "stocks": r["stocks"]}

    # ── 配置管理 ──────────────────────────────────────────────────

    def get_config(self) -> dict:
        """获取全局费率配置。"""
        conn = self._get_conn()
        rows = conn.execute("SELECT key, value FROM config").fetchall()
        return {r["key"]: float(r["value"]) for r in rows}

    def set_config_value(self, key: str, value: float) -> None:
        """设置一项全局配置。"""
        conn = self._get_conn()
        conn.execute("INSERT OR REPLACE INTO config (key, value) VALUES (?, ?)",
                     (key, str(value)))
        conn.commit()

    def get_stock_config(self, code: str) -> dict:
        """获取股票的专属配置。"""
        conn = self._get_conn()
        r = conn.execute(
            "SELECT * FROM stock_config WHERE code=?", (code.strip().zfill(6),)
        ).fetchone()
        if r is None:
            return {}
        return {
            "commission_rate": r["commission_rate"],
            "commission_min": r["commission_min"],
            "stamp_duty_rate": r["stamp_duty_rate"],
            "transfer_fee_rate": r["transfer_fee_rate"],
        }

    def set_stock_config(self, code: str, **kwargs) -> None:
        """设置股票的专属费率。kwargs 可含 commission_rate / commission_min 等。"""
        cn = code.strip().zfill(6)
        existing = self.get_stock_config(cn)
        merged = {**existing, **{k: v for k, v in kwargs.items() if v is not None}}
        self._get_conn().execute(
            """INSERT OR REPLACE INTO stock_config
               (code, commission_rate, commission_min, stamp_duty_rate, transfer_fee_rate)
               VALUES (?,?,?,?,?)""",
            (cn,
             merged.get("commission_rate"),
             merged.get("commission_min"),
             merged.get("stamp_duty_rate"),
             merged.get("transfer_fee_rate"))
        )
        self._get_conn().commit()

    def delete_stock_config(self, code: str) -> None:
        conn = self._get_conn()
        conn.execute("DELETE FROM stock_config WHERE code=?", (code.strip().zfill(6),))
        conn.commit()
