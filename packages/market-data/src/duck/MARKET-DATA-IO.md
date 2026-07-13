# 本地市场数据 I/O 架构

## 分层

| 层 | 模块 | 职责 |
|----|------|------|
| SQLite 控制面 | `MarketDataStore` + `dbRead` | WAL、cursor、session；`getStatusLight()` |
| Duck 短读 | `@duckdb/node-api` → `duck-neo-reader.ts` | `startStreamThenReadAll` 协作式读，不 spawn 子进程 |
| Duck 写 / 重任务 | `duck-cli-pool.ts` + 独立子进程 | apply-batch、迁移、因子重算、Parquet 导入 |
| Duck 重型读 | duck-cli 子进程 | 初选 SQL、行业聚合（用户触发，非轮询） |

## 短读（Neo）

- 单文件只读实例：`DuckDBInstance.fromCache(path, { access_mode: 'read_only' })`
- 读并发：`p-queue` concurrency=3
- 同步 Store API：`queryAllSyncCached` / `klineStatsSyncCached`（async 预热 + TTL 缓存）
- 启动预热：`getDuckNeoReader(path).warmReadCaches()`

## 写路径

- `p-queue` concurrency=1 + `duck-cli` worker 线程
- 衍生维护期间主进程暂停写入队列（`isDerivedMaintenanceActive()`）

## 禁止

- 主进程 `execFileSync` 写 Duck
- 文件锁自旋等待（`.oplock` + `spawnSync sleep`）
