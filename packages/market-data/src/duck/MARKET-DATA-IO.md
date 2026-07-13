# 本地市场数据 I/O 架构

## 分层

| 层 | 模块 | 职责 |
|----|------|------|
| SQLite 控制面 | `MarketDataStore` + `dbRead` | WAL、cursor、session；`getStatusLight()` |
| Duck 短读 | `@duckdb/node-api` → `duck-neo-reader.ts` | 协作式 async 读；同步边界 `queryAllSyncBlocking` = `runAsyncSync(queryAll)` |
| Duck 写 / 重任务 | `duck-cli-pool.ts` + worker 线程 | apply-batch、迁移、因子重算；同步边界 `applyBatchSync` = `runAsyncSync(applyBatchAsync)` |
| Duck 重型读 | duck-cli worker 池 async | 初选 SQL、行业聚合（用户触发） |

## 短读（Neo）

- 单文件只读实例：`DuckDBInstance.fromCache(path, { access_mode: 'read_only' })`
- 读并发：`p-queue` concurrency=3
- **Hub / API**：`queryAllAsync`（不阻塞事件循环）
- **Store 同步 / 测试**：`queryAllSync` → neo `queryAllSyncBlocking`（同 node-api 路径，经 `runAsyncSync` 阻塞等待）
- 启动预热：`getDuckNeoReader(path).warmReadCaches()`（async 填充 TTL 缓存）

## 写路径

- `p-queue` concurrency=1 + `duck-cli` worker 线程
- **测试 flush**：`flushDuckWritesSync` → worker 池 `applyBatchAsync` + `runAsyncSync`（与生产写路径一致，非主进程 spawnSync）
- 衍生维护期间主进程暂停写入队列（`isDerivedMaintenanceActive()`）

## 禁止

- 主进程 `execFileSync` 写 Duck
- 文件锁自旋等待（`.oplock` + `spawnSync sleep`）
