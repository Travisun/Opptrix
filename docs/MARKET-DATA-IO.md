# Market Data I/O

行情库读写路径约定（Duck / SQLite / Gateway）。

Neo 短读与 CliPool 共用 `resolveDuckReadConcurrency()`；`marketStats` 为单条多标量子查询（字段语义不变）。详见 `packages/market-data/src/duck/MARKET-DATA-IO.md`。

## K 线批量写入

`cn_daily_bars` 大批量 upsert 经临时 JSON + 单次 `INSERT OR REPLACE … SELECT`（或分块）灌入，禁止逐行 `INSERT` 循环；生产仍走 Gateway → duck-cli，测试可直连 `KlineDuckStore`。
