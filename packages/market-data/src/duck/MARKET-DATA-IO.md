# 本地市场数据 I/O 架构

## 分层

| 层 | 模块 | 职责 |
|----|------|------|
| SQLite 控制面 | `MarketDataStore` + `dbRead` | WAL、cursor、session；`getStatusLight()` |
| Duck 短读 | `@duckdb/node-api` → `duck-neo-reader.ts` | Hub/API async 协作式读；同步边界走 duck-cli `spawnSync`（Node 无法可靠桥接 in-process async） |
| Duck 写 / 重任务 | `duck-cli-pool.ts` + worker 线程 | apply-batch、迁移、因子重算；热路径 async；测试/导出用 `execSync` |
| Duck 重型读 | duck-cli worker 池 async | 初选 SQL、行业聚合（用户触发） |

## 短读（Neo）

- 单文件只读实例：`DuckDBInstance.fromCache(path, { access_mode: 'read_only' })`
- 读并发：`p-queue` 与 CliPool 同源 `resolveDuckReadConcurrency()`（默认 3；低配 / `OPPTRIX_DUCK_READ_CONCURRENCY` → 1）
- `marketStats`：单条多标量子查询（`buildMarketStatsSql`），字段语义与历史逐表 COUNT 一致
- **Hub / API**：`queryAllAsync` / `marketStatsAsync`（不阻塞事件循环）
- **Store 同步 / 测试 / 导出**：`queryAllSync` / `marketStatsSync` / `applyBatchSync` → 同 duck-cli 二进制，经 `spawnSync`（可靠阻塞，无事件循环依赖）
- 启动预热：默认 `warmReadCaches()`；低配或 `OPPTRIX_DUCK_WARM_ON_BOOT=0` 跳过（首次查询仍会拉 stats）
- **最新截面**：无参 `latestBars` / `latestBarSnapshot` 仍返回全量（测试/兼容）；Hub / 热路径用 `latestBarsPage*` + `stitchLatestBarsPages` 分页拼回（默认 limit 1000，低配 500，硬顶 2000），`latestBarsAsync` / `duckLatestBarsAll` 已走拼回。

## 写路径

- `p-queue` concurrency=1（恒定）+ `duck-cli` worker 线程
- **批写临时 JSON**：Gateway `apply-batch` / `upsert` / `query-json` 经 `duck-temp-json` 紧凑写入 `os.tmpdir` 并立即 unlink；同进程 `upsertCnDailyBarsBatch` 默认 VALUES 直连不落盘
- **测试 flush / .opmd 导出**：`flushDuckWritesSync` / `syncMarketDataToSqliteSync` → `spawnSync duck-cli`
- 衍生维护期间主进程暂停写入队列（`isDerivedMaintenanceActive()`）

## 禁止

- 主进程 `execFileSync` 写 Duck
- 文件锁自旋等待（`.oplock` + `spawnSync sleep`）
