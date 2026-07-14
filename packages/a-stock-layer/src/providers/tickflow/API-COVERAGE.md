# TickFlow Provider — API 覆盖说明

> 面向 Opptrix 开发者。协议与字段以官方 OpenAPI 为准：https://api.tickflow.org/openapi.json

## 概述

| 项 | 说明 |
|---|---|
| 数据源 | [TickFlow](https://api.tickflow.org) — A 股 / 港股 / 美股行情与 A 股财务 |
| 传输 | HTTPS REST，`https://api.tickflow.org` |
| 鉴权 | 请求头 `x-api-key: {apiKey}` |
| Provider ID | `tickflow`；`defaultPriority: 100`（需 API Key 层；同花顺置顶其后） |
| 配置 | `enabled` + 必填 `apiKey` + `permissionMode` + `planTier` |

**实现路径：**

```
api/client.ts           → TickflowClient（19 个 OpenAPI 端点）
markets/handler.ts      → 行情 / K 线 / 指数
markets/common.ts       → 列表 / 资料 / 财务 / 分时 / 股本
markets/extensions.ts   → 扩展 API（盘口批量、标的池、除权因子等）
normalize/*             → 行数据 → Opptrix schema
driver.ts + manifest.ts → applyManifestSpec + bindingsFor
```

---

## OpenAPI 端点 → Client 方法

| OpenAPI | Client 方法 | 套餐 | 状态 |
|---|---|---|---|
| `GET /v1/exchanges` | `getExchanges()` | 免费 | ✅ |
| `GET /v1/quotes` | `getQuotes()` | 免费 | ✅ |
| `POST /v1/quotes` | `postQuotes()` | 免费 | ✅ |
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
| `STOCK_REALTIME` | `realtime()` / `batchRealtime()` | CN / US / HK | GET/POST quotes |
| `STOCK_KLINE` | `kline()` | CN / US / HK | `/v1/klines`；A 股默认前复权加法 |
| `STOCK_LIST` | `stockList()` | CN / US / HK | 交易所列表或 Universe |
| `STOCK_BASIC` | `stockBasic()` | CN / US / HK | `/v1/instruments` |
| `STOCK_PROFILE` | `profile()` | CN / US / HK | `/v1/instruments` |
| `INDEX_REALTIME` | `indexRealtime()` | CN | 复用 quotes |
| `INDEX_KLINE` | `indexKline()` | CN | 复用 klines |
| `INTRADAY_TICK` | `intradayTick()` / `fetchIntradaySessions()` | CN | 当日 `/v1/klines/intraday` |
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
| `tfUniverseBatch` | `POST /v1/universes/batch` | 批量标的池 |
| `tfExFactors` | `GET /v1/klines/ex-factors` | 除权因子 |
| `tfIntradayBatch` | `GET /v1/klines/intraday/batch` | 批量当日分时 |

---

## 套餐与 API 权限适配

官方无公开「套餐名 → 接口」矩阵；以下 **免费 / 付费** 划分来自对配置 Key 的全量实测（`npm run test:tickflow`）。

### 免费版（10 个 path，可正常访问）

| OpenAPI | 对应能力 |
|---|---|
| `GET /v1/exchanges` | 交易所列表 |
| `GET/POST /v1/quotes` | 实时行情（单只/批量） |
| `GET /v1/klines` | 日/周/月 K 线（单标的） |
| `GET/POST /v1/instruments` | 标的基础信息 |
| `GET /v1/exchanges/{exchange}/instruments` | 交易所成分列表 |
| `GET /v1/universes` / `{id}` / `batch` | 标的池 |

设置页档位 **`plan=free`（免费版）** 与此对齐。

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
| **API Key 必填** | 未配置时 `fromConfig()` 返回 `null`，驱动静默跳过 |
| **财务 / 股本** | 主要为 A 股；manifest 仅绑定 CN/EQUITY |
| **分时** | `/v1/klines/intraday` 仅**当日**分钟 K，不含历史多日 |
| **指数路由** | 引擎 `indexRealtime` / `indexKline` 使用 `CN/INDEX` scope |

---

## 测试

```bash
cd packages/a-stock-layer && npm run test:tickflow
```

连接测试：`testTickflowConnection(apiKey)` → `GET /v1/exchanges` + 权限探测摘要。
