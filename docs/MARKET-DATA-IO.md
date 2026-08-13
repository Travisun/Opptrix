# Market Data I/O

行情库读写路径约定（Duck / SQLite / Gateway）。

Neo 短读与 CliPool 共用 `resolveDuckReadConcurrency()`；`marketStats` 为单条多标量子查询（字段语义不变）。详见 `packages/market-data/src/duck/MARKET-DATA-IO.md`。

## K 线批量写入

`cn_daily_bars` 大批量 upsert：同进程（`KlineDuckStore` / duck-cli 内）优先 `INSERT OR REPLACE … VALUES` 直连、零临时 JSON；Gateway 跨进程仍用 `os.tmpdir` 紧凑 JSON + 写完立即 unlink（禁止 pretty / 残留放大）；boot/retention 用 `pruneOrphanDuckTempJson` 清 mtime>1h 崩溃孤儿。语义仍为 PRIMARY KEY 幂等覆盖。

最新日 K 截面：热路径用 `latestBarsPage*` / `stitchLatestBarsPages`（或 `latestBarsAsync`）分页拼回，勿一次无界全表进内存；无参全量 API 仅保留给测试/兼容。

## 同步控制面日志（sync_logs）

`market.db` 的 `sync_logs` 有硬顶：单 session ≤2000 行、全局 ≤8000 行；`finishSession` 时 prune，`appendLog` 每 256 次做一次 session prune（不每次 COUNT）。
