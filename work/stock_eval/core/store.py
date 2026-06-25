from __future__ import annotations
"""
评估快照持久化 — SQLite 存储

按时间戳保存每次评估结果，支持:
  - 保存/批量保存
  - 按代码查询最新
  - 按代码查询历史变化
  - 查询高分股票
  - 两个时间点之间的评分变化比较

用法:
    store = SnapshotStore("~/.stock_eval/store.db")
    store.save(snapshot, scorecard_name="综合评估")

    # 查询
    latest = store.get_latest("600519")
    history = store.get_history("600519", days=90)
    best = store.get_top(scorecard="综合评估", n=20)
    changes = store.compare("2026-01-01", "2026-06-01")
"""

import os
import json
import sqlite3
from typing import Optional, List, Dict
from dataclasses import dataclass
from datetime import datetime, timedelta

from .models import StockSnapshot


@dataclass
class StoredSnapshot:
    """从数据库中恢复的评估快照"""
    code: str
    name: str
    timestamp: str
    total_score: Optional[float]
    scorecard_name: Optional[str]
    factor_values: Dict[str, Optional[float]]
    dimension_scores: Dict[str, float]
    industry: Optional[str] = None

    def to_snapshot(self) -> StockSnapshot:
        """转换成可操作的 StockSnapshot"""
        from .registry import REGISTRY
        snap = StockSnapshot(code=self.code, name=self.name)
        snap.total_score = self.total_score
        snap.scores = dict(self.dimension_scores)
        for fname, fval in self.factor_values.items():
            meta = REGISTRY.get_meta(fname)
            snap.factors[fname] = type(
                "StoredResult", (), {
                    "name": fname, "value": fval,
                    "meta": meta, "details": {}
                }
            )()
        return snap


def _get_db_path(path: str) -> str:
    """解析 db 路径，支持 ~"""
    path = os.path.expanduser(path)
    os.makedirs(os.path.dirname(path), exist_ok=True)
    return path


class SnapshotStore:
    """
    评估快照持久化存储

    数据表 snapshots:
      code, name, timestamp, total_score, scorecard_name,
      factor_values (JSON), dimension_scores (JSON), industry
    """

    def __init__(self, db_path: str = "~/.stock_eval/store.db"):
        self._path = _get_db_path(db_path)
        self._init_db()

    def _conn(self):
        return sqlite3.connect(self._path)

    def _init_db(self):
        with self._conn() as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS snapshots (
                    id          INTEGER PRIMARY KEY AUTOINCREMENT,
                    code        TEXT NOT NULL,
                    name        TEXT NOT NULL DEFAULT '',
                    timestamp   TEXT NOT NULL,
                    total_score REAL,
                    scorecard_name TEXT DEFAULT '',
                    factor_values TEXT DEFAULT '{}',
                    dimension_scores TEXT DEFAULT '{}',
                    industry    TEXT DEFAULT '',
                    created_at  TEXT DEFAULT (datetime('now','localtime'))
                )
            """)
            conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_snapshots_code
                ON snapshots(code)
            """)
            conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_snapshots_ts
                ON snapshots(timestamp)
            """)
            conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_snapshots_score
                ON snapshots(total_score)
            """)
            conn.execute("""
                CREATE INDEX IF NOT EXISTS idx_snapshots_code_ts
                ON snapshots(code, timestamp)
            """)

    # ── 写入 ────────────────────────────────────────

    def save(self, snapshot: StockSnapshot,
             scorecard_name: str = "",
             timestamp: Optional[str] = None) -> int:
        """
        保存一个评估快照

        返回: 插入的 row id
        """
        ts = timestamp or datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        fv = {n: fr.value for n, fr in snapshot.factors.items()}
        ds = dict(snapshot.scores)
        industry = getattr(snapshot, "industry", None) or ""

        with self._conn() as conn:
            cur = conn.execute("""
                INSERT INTO snapshots
                    (code, name, timestamp, total_score,
                     scorecard_name, factor_values, dimension_scores, industry)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """, (
                snapshot.code, snapshot.name, ts, snapshot.total_score,
                scorecard_name, json.dumps(fv), json.dumps(ds), industry,
            ))
            return cur.lastrowid

    def save_batch(self, snapshots: List[StockSnapshot],
                   scorecard_name: str = "") -> int:
        """批量保存"""
        count = 0
        with self._conn() as conn:
            for s in snapshots:
                ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                fv = {n: fr.value for n, fr in s.factors.items()}
                ds = dict(s.scores)
                industry = getattr(s, "industry", None) or ""
                conn.execute("""
                    INSERT INTO snapshots
                        (code, name, timestamp, total_score,
                         scorecard_name, factor_values, dimension_scores, industry)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """, (s.code, s.name, ts, s.total_score,
                      scorecard_name, json.dumps(fv), json.dumps(ds), industry))
                count += 1
        return count

    # ── 查询 ────────────────────────────────────────

    def get_latest(self, code: str) -> Optional[StoredSnapshot]:
        """获取某只股票最近的评估"""
        with self._conn() as conn:
            row = conn.execute("""
                SELECT code, name, timestamp, total_score,
                       scorecard_name, factor_values, dimension_scores, industry
                FROM snapshots
                WHERE code = ?
                ORDER BY timestamp DESC
                LIMIT 1
            """, (code,)).fetchone()
        return self._row_to_snapshot(row) if row else None

    def get_history(self, code: str, days: int = 90,
                    limit: int = 50) -> List[StoredSnapshot]:
        """获取某只股票的历史评估"""
        since = (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d")
        with self._conn() as conn:
            rows = conn.execute("""
                SELECT code, name, timestamp, total_score,
                       scorecard_name, factor_values, dimension_scores, industry
                FROM snapshots
                WHERE code = ? AND timestamp >= ?
                ORDER BY timestamp DESC
                LIMIT ?
            """, (code, since, limit)).fetchall()
        return [self._row_to_snapshot(r) for r in rows]

    def get_top(self, scorecard: str = "",
                n: int = 20,
                since_days: int = 7) -> List[StoredSnapshot]:
        """
        查询最近 N 天评分最高的股票

        参数:
          scorecard: 评分卡名称过滤，""=不限
          n: 返回条数
          since_days: 查询最近几天的数据
        """
        since = (datetime.now() - timedelta(days=since_days)).strftime("%Y-%m-%d")
        with self._conn() as conn:
            if scorecard:
                rows = conn.execute("""
                    SELECT code, name, timestamp, total_score,
                           scorecard_name, factor_values,
                           dimension_scores, industry
                    FROM snapshots
                    WHERE timestamp >= ? AND scorecard_name = ?
                    ORDER BY total_score DESC
                    LIMIT ?
                """, (since, scorecard, n)).fetchall()
            else:
                rows = conn.execute("""
                    SELECT code, name, timestamp, total_score,
                           scorecard_name, factor_values,
                           dimension_scores, industry
                    FROM snapshots
                    WHERE timestamp >= ?
                    ORDER BY total_score DESC
                    LIMIT ?
                """, (since, n)).fetchall()
        return [self._row_to_snapshot(r) for r in rows]

    def get_by_factor(self, factor_name: str,
                      order: str = "DESC",
                      n: int = 20,
                      since_days: int = 7) -> List[StoredSnapshot]:
        """
        按因子值排序查询（选股时按某个因子找最高/最低）

        order: "DESC"=从高到低, "ASC"=从低到高
        """
        since = (datetime.now() - timedelta(days=since_days)).strftime("%Y-%m-%d")
        with self._conn() as conn:
            rows = conn.execute(f"""
                SELECT code, name, timestamp, total_score,
                       scorecard_name, factor_values,
                       dimension_scores, industry
                FROM snapshots
                WHERE timestamp >= ?
                ORDER BY
                    json_extract(factor_values, '$.{factor_name}') {order}
                LIMIT ?
            """, (since, n)).fetchall()
        return [self._row_to_snapshot(r) for r in rows]

    def compare(self, date_a: str, date_b: str,
                scorecard: str = "",
                min_change: float = 0) -> List[dict]:
        """
        比较两个日期的评分变化

        参数:
          date_a: 起始日期 "2026-01-01"
          date_b: 终止日期 "2026-06-01"
          scorecard: 评分卡过滤
          min_change: 最小变化量过滤

        返回: [{"code", "name", "score_a", "score_b", "change", ...}]
        """
        with self._conn() as conn:
            sub = f"""
                AND scorecard_name = '{scorecard}'
            """ if scorecard else ""

            rows = conn.execute(f"""
                SELECT
                    a.code, a.name,
                    a.total_score as score_a,
                    b.total_score as score_b,
                    a.timestamp as ts_a,
                    b.timestamp as ts_b,
                    (b.total_score - a.total_score) as change
                FROM snapshots a
                JOIN snapshots b ON a.code = b.code
                    AND date(a.timestamp) = ? AND date(b.timestamp) = ?
                    {sub.replace("'", "''")}
                WHERE ABS(b.total_score - a.total_score) >= ?
                ORDER BY change DESC
            """, (date_a, date_b, min_change)).fetchall()

        results = []
        for r in rows:
            results.append({
                "code": r[0], "name": r[1],
                "score_a": r[2], "score_b": r[3],
                "ts_a": r[4], "ts_b": r[5],
                "change": round(r[6], 2) if r[6] else 0,
            })
        return results

    def count(self) -> int:
        """总记录数"""
        with self._conn() as conn:
            return conn.execute("SELECT COUNT(*) FROM snapshots").fetchone()[0]

    # ── 内部 ────────────────────────────────────────

    @staticmethod
    def _row_to_snapshot(row) -> StoredSnapshot:
        return StoredSnapshot(
            code=row[0],
            name=row[1],
            timestamp=row[2],
            total_score=row[3],
            scorecard_name=row[4],
            factor_values=json.loads(row[5]),
            dimension_scores=json.loads(row[6]),
            industry=row[7] or None,
        )

    def __repr__(self):
        return f"<SnapshotStore path={self._path} count={self.count()}>"
