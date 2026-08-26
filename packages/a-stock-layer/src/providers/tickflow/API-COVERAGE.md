# TickFlow Provider — API 覆盖说明

> 面向 Opptrix 开发者。协议与字段以官方 OpenAPI 为准：https://api.tickflow.org/openapi.json

## 概述

| 项 | 说明 |
|---|---|
| 数据源 | [TickFlow](https://api.tickflow.org) — A 股 / 港股 / 美股行情与 A 股财务 |
| 传输 | HTTPS REST；公开免费 `https://free-api.tickflow.org`；付费 `https://api.tickflow.org` |
| 客户端 | `@opptrix/tickflow-sdk`（`TickFlowClient`）；适配层 `TickflowClient` 薄壳 |
| 限流 | SDK `intervalMs: 300`（约 3 QPS）；**不**经 `ProviderHttpClient` 主机闸门 |
| 鉴权 | 无 Key：`mode:'free'`；有 Key：`mode:'full'` + `x-api-key` |
| Provider ID | `tickflow`；`defaultPriority: 100` |
| 配置 | `enabled` + 可选 `apiKey` + `permissionMode` + `plan` |

**实现路径：**

```
api/client.ts           → TickflowClient 薄壳 → @opptrix/tickflow-sdk
markets/handler.ts      → 行情 / K 线 / 指数
markets/common.ts       → 列表 / 资料 / 财务 / 分时 / 股本
markets/extensions.ts   → 扩展 API（盘口批量、标的池、除权因子等）
normalize/*             → 行数据 → Opptrix schema（quotes 百分比按 SDK 0.01=1% ×100）
driver.ts + manifest.ts → applyManifestSpec + bindingsFor
```

---

## OpenAPI 端点 → Client 方法

| OpenAPI | Client 方法 | 套餐 | 状态 |
|---|---|---|---|
| `GET /v1/exchanges` | `getExchanges()` | 免费 | ✅ |
| `GET /v1/quotes` | `getQuotes()` | 带 Key 免费 / 付费 | ✅（公开免费 403，handler 用日 K 近似） |
| `POST /v1/quotes` | `postQuotes()` | 带 Key 免费 / 付费 | ✅ |
| `GET /v1/klines` | `getKlines()` | 免费 | ✅ |
| `GET /v1/instruments` | `getInstruments()` | 免费 | ✅ |
| `POST /v1/instruments` | `postInstruments()` | 免费 | ✅ |
| `GET /v1/exchanges/{exchange}/instruments` | `getExchangeInstruments()` | 免费 | ✅ |
| `GET /v1/universes` | `getUniverses()` | 免费 | ✅ |
| `GET /v1/universes/{id}` | `getUniverse()` | 免费 | ✅ |
| `POST /v1/universes/batch` | `postUniversesBatch()` | 免费 | ✅ |
| `GET /v1/depth` | `getDepth()` | 付费 | ✅ |
| `GET /v1/depth/batch` | `getDepthBatch()` | 付费 | ✅ |
| `GET /v1/klines/batch` | `getKlinesBatch()` | 付费 | ✅ |
| `GET /v1/klines/intraday` | `getKlinesIntraday()` | 付费 | ✅ |
| `GET /v1/klines/intraday/batch` | `getKlinesIntradayBatch()` | 付费 | ✅ |
| `GET /v1/klines/ex-factors` | `getKlinesExFactors()` | 付费 | ✅ |
| `GET /v1/financials/income` | `getFinancialsIncome()` | 付费 | ✅ |
| `GET /v1/financials/balance-sheet` | `getFinancialsBalanceSheet()` | 付费 | ✅ |
| `GET /v1/financials/cash-flow` | `getFinancialsCashFlow()` | 付费 | ✅ |
| `GET /v1/financials/metrics` | `getFinancialsMetrics()` | 付费 | ✅ |
| `GET /v1/financials/shares` | `getFinancialsShares()` | 付费 | ✅ |

**合计：19 path × 21 HTTP 操作 = 全部实现。** 套餐列依据 `npm run test:tickflow` 对当前配置 Key 的实测（10 免费 / 11 付费 403）。

---

## 标准 Capability 绑定

| Capability | Handler 方法 | 市场 | 备注 |
|---|---|---|---|
| `STOCK_REALTIME` | `realtime()` / `batchRealtime()` | CN / US / HK | 有 Key：quotes；无 Key：日 K 近似最新价 |
| `STOCK_KLINE` | `kline()` | CN / US / HK | `GET /v1/klines` + **period**（1m…1Y）；A 股默认前复权加法 |
| `STOCK_LIST` | `stockList()` | CN / US / HK | 交易所列表或 Universe |
| `STOCK_BASIC` | `stockBasic()` | CN / US / HK | `/v1/instruments` |
| `STOCK_PROFILE` | `profile()` | CN / US / HK | `/v1/instruments` |
| `INDEX_REALTIME` | `indexRealtime()` | CN | 复用 quotes |
| `INDEX_KLINE` | `indexKline()` | CN | 复用 klines |
| `INTRADAY_TICK` | `intradayTick()` / `fetchIntradaySessions()` | CN / US / HK | 仅带 Key；公开免费档直接跳过分钟 K |
| `FINANCIAL_SUMMARY` | `financials()` | CN | metrics + income |
| `BALANCE_SHEET` | `balanceSheet()` | CN | |
| `INCOME_STMT` | `incomeStatement()` | CN | |
| `CASH_FLOW` | `cashFlow()` | CN | |
| `SHAREHOLDER` | `shareholders()` | CN | `/v1/financials/shares` |

**Provider 钩子：** `applyManifestSpec`（capabilities / bindings / maxConcurrent）、`isTickflowEnabled` 运行时开关。

---

## 扩展方法（custom-methods）

| 方法 | OpenAPI | 说明 |
|---|---|---|
| `fetchDepth` | `GET /v1/depth` | 五档盘口 |
| `tfDepthBatch` | `GET /v1/depth/batch` | 批量五档 |
| `tfListUniverses` | `GET /v1/universes` | 标的池列表 |
| `tfGetUniverse` | `GET /v1/universes/{id}` | 单个标的池 |
| `tfUniverseBatch` | `POST /v1/universes/batch` | 批量标的池 |
| `tfExFactors` | `GET /v1/klines/ex-factors` | 除权因子 |
| `tfKlinesBatch` | `GET /v1/klines/batch` | 批量历史 K 线 |
| `tfQuotesUniverses` | `GET /v1/quotes`（`universes`） | 标的池实时行情 |
| `tfKlinesIntraday` | `GET /v1/klines/intraday` | 单标的当日分钟 K |
| `tfIntradayBatch` | `GET /v1/klines/intraday/batch` | 批量当日分钟 K |

---

## 套餐与 API 权限适配

请区分两套「免费」概念：

### A. 官方公开免费档（无 API Key / `free-api.tickflow.org`）

对齐官方 `TickFlow.free()`：无需注册。约 60 次/分钟 IP 限流。

| OpenAPI | 对应能力 |
|---|---|
| `GET /v1/exchanges` | 交易所列表 |
| `GET /v1/klines` | 历史日/周/月/季/年 K（`1d/1w/1M/1Q/1Y`）；**无分钟线** |
| `GET/POST /v1/instruments` | 标的基础信息 |
| `GET /v1/exchanges/{exchange}/instruments` | 交易所成分列表 |
| `GET /v1/universes` / `{id}` / `batch` | 标的池 |
| `GET /v1/klines/ex-factors` | 除权因子 |

**不支持：** `GET/POST /v1/quotes`（403 `FREE_TIER_RESTRICTED`）→ handler 用最近日 K 合成最新价；分钟 K 本地直接跳过。

### B. 带 Key 的免费套餐（`api.tickflow.org`，实测）

| OpenAPI | 对应能力 |
|---|---|
| `GET /v1/exchanges` | 交易所列表 |
| `GET/POST /v1/quotes` | 实时行情（单只/批量） |
| `GET /v1/klines` | 日/周/月/季/年 K 线 |
| `GET/POST /v1/instruments` | 标的基础信息 |
| `GET /v1/exchanges/{exchange}/instruments` | 交易所成分列表 |
| `GET /v1/universes` / `{id}` / `batch` | 标的池 |

设置页档位 **`plan=free`（Key 免费套餐）** 与 B 对齐；无 Key 时走 A。

### 付费版（11 个 path，免费 Key 返回 403）

| OpenAPI | 403 错误码 |
|---|---|
| `GET /v1/depth` / `batch` | `NO_DEPTH_PERMISSION` |
| `GET /v1/klines/batch` | `NO_KLINE_BATCH_PERMISSION` |
| `GET /v1/klines/intraday` / `batch` | `NO_INTRADAY_PERMISSION` / `NO_INTRADAY_BATCH_PERMISSION` |
| `GET /v1/klines/ex-factors` | `NO_EX_FACTORS_PERMISSION` |
| `GET /v1/financials/*`（5 个） | `NO_FINANCIAL_PERMISSION` |

**两种适配模式（设置页「权限适配」）：**

| 模式 | 行为 |
|---|---|
| **自动适配（推荐）** | 运行时遇 403 登记至通用 `permission-denial`，永久屏蔽直至换 Key / 重启用 |
| **手动选择** | `plan=free` 免费版；`plan=paid` 全量 |

| 档位 | 说明 |
|---|---|
| `free` | 免费版（实测 10 path） |
| `paid` | 付费全量 |

实现：`providers/common/permission-denial.ts` + `api/permissions.ts`、`api/probe.ts`、`driver.ts`、`settings.ts`。

---

## 已知限制

| 限制 | 详情 |
|---|---|
| **API Key 可选** | 无 Key 时 `fromConfig()` 仍返回客户端，SDK `mode:'free'`，基址 `free-api.tickflow.org` |
| **出站 / 限流** | 经 `@opptrix/tickflow-sdk`；仅 `intervalMs` 限流，无自研 HTTP client |
| **公开免费无实时** | quotes 403；右侧面板最新价由日 K 近似（`quoteSession=closed`） |
| **公开免费无分钟线** | 解析为分钟 period 时直接 `return null`，不请求上游 |
| **财务 / 股本** | 需付费 Key；manifest 仅绑定 CN/EQUITY |
| **分时** | 带 Key：`period=1m`；公开免费不可用 |
| **图表周期** | `resolveTickflowKlineQuery`：UI 周期 → klines `period` + `count` |
| **指数路由** | 引擎 `indexRealtime` / `indexKline` 使用 `CN/INDEX` scope |

---

## 测试

```bash
cd packages/a-stock-layer && npm run test:tickflow
# 公开免费档可无 Key：node --test tests/tickflow-free-tier.test.mjs
```

连接测试：`testTickflowConnection(apiKey?)` — 无 Key 测 `free-api` 的 `GET /v1/exchanges`；有 Key 测付费端 + 权限探测摘要。
