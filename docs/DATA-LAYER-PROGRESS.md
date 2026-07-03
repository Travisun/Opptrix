# Data Layer 实施进度报告

> 接续开发前先读本文 + [DATA-LAYER.md](./DATA-LAYER.md) 路线图。  
> **最后更新**：2026-07-03（市场数据包分包 + us_quotes sync）

---

## 如何使用

| 场景 | 动作 |
|------|------|
| 新会话接续 | 读「各 Phase 状态总览」→ 当前 Phase 的「未完成」→ 对应文件索引 |
| 完成一项 | 勾选 DATA-LAYER.md 对应 checkbox + 更新本文件条目 |
| 新增延后项 | 写入对应 Phase「未完成」，勿散落 TODO |

---

## 各 Phase 状态总览

| Phase | 主题 | 状态 | 说明 |
|-------|------|------|------|
| **0** | 内核 refactor + Provider 配置 | 🟢 完成 | QueryPlan、MarketDataEngine alias、tushare 目录、binding overrides |
| **1** | A 股 ETF | 🟢 完成 | 本地筛选、决策雷达、instrument 统一视图 |
| **2** | 美股 US | 🟢 完成 | Polygon + Tiingo + FMP + Yahoo 回退 |
| **3** | Crypto | 🟢 底层 + 前端 MVP | 详情页、多 quote 筛选 |
| **4** | 包整理 | 🟢 完成 | core + 按市场 providers shim |

图例：🟢 进行中/可用 · 🟡 部分 · ⚪ 未开始 · 🔴 阻塞

---

## Phase 0 — 未完成

| ID | 项 | 优先级 | 文件/入口 |
|----|-----|--------|-----------|
| ~~P0-1~~ | 提取 `QueryPlan`，TDX fast-path 移出 Engine 硬编码 | ✅ | `core/query-plan.ts`、`query-plan-intraday.ts`、`tdx/kline-paginate.ts` |
| ~~P0-2~~ | 类型 alias：`MarketDataEngine` canonical + `AshareEngine` 兼容 | ✅ | `engine.ts`、`research-hub`、`market-data` |
| ~~P0-3~~ | `providers/tushare/` 按 §6.4 目录拆分 | ✅ | `providers/tushare/*` + `settings.ts` |
| ~~P0-4~~ | `provider_binding_overrides` UI/API | ✅ | `user-store`、`Registry`、`/api/data/providers/:id/bindings` |

**已完成（P0）**：shared 类型、bindings、3D Registry、provider_settings、Catalog、REST `/api/data/providers*`、设置页数据源 Tab。

---

## Phase 1 — 未完成

| ID | 项 | 优先级 | 文件/入口 |
|----|-----|--------|-----------|
| ~~P1-1~~ | ETF 本地筛选 | ✅ | `query/etf-screen.ts`、Hub `local_etf_screen`、Agent `screen_local_etfs` |
| ~~P1-2~~ | ETF 决策雷达 / scorecard | ✅ | `query/etf-scorecard.ts`、Hub `etf_scorecard`、Agent `get_etf_scorecard`、`EtfDecisionCard` |
| ~~P1-3~~ | `WatchlistItem.instrument` | ✅ | `watchlist/models.ts`、`watchlist/instrument.ts`、client-ui 双写 |
| ~~P1-4~~ | `instruments` 与 `stocks` 双写统一视图 | ✅ | schema v6、`v_instruments_unified` / `v_cn_equity_stocks`、store 双写 + 读路径 |
| ~~P1-5~~ | mootdx 以外 CN Provider 显式 ETF binding 审计 | ✅ | tencent/efinance/sina/tushare/eastmoney/tdx 显式 `cnEtfBindings` |

**已完成（P1）**：ETF Capability、东财实现、schema v5、sync（list/nav/holdings/kline）、Hub/REST/Agent、`EtfDetailTab`、本地筛选与决策雷达。

---

## Phase 2 — 美股（底层先行，无前端）

### 已完成（P2 MVP）

| ID | 项 | 状态 |
|----|-----|------|
| P2-1 | `polygon` Provider + API Key 配置 | ✅ |
| P2-2 | `yahoo_us` fallback | ✅ |
| P2-3 | US normalizer + ET 辅助 | ✅ |
| P2-4 | Engine `us*` API | ✅ |
| P2-5 | Hub + REST + Agent | ✅ |
| P2-6 | `us_list` sync | ✅ |
| P2-7 | Manifest（设置页「美股」分组） | ✅ |

### 未完成（P2 后续）

| ID | 项 | 优先级 | 说明 |
|----|-----|--------|------|
| P2-8 | **client-ui** 多 market `@` picker | ✅ | `searchInstruments` + watchlist 合并 |
| ~~P2-9~~ | **client-ui** 美股详情 Tab | ✅ | `CrossMarketSnapshotDetail` + `/api/us/*/snapshot` |
| ~~P2-10~~ | Tiingo / FMP 第二、三主源 | ✅ | Tiingo priority 55；FMP priority 50 |
| ~~P2-11~~ | 美股财报 `FINANCIAL_SUMMARY` | ✅ | Polygon `/vX/reference/financials`、`usFinancials` |
| ~~P2-12~~ | 完整 NYSE 假日历 | ✅ | `utils/us-holidays.ts`、`isUsTradingDay` |
| ~~P2-13~~ | 盘前/盘后行情字段与 session 标注 | ✅ | Polygon/Yahoo + `quoteSession` + 详情页 badge |
| ~~P2-14~~ | US 本地筛选 MVP | ✅ | `query/us-screen.ts`、`local_us_screen` |
| ~~P2-15~~ | `us_quotes` sync 入 `stock_quotes_daily` | ✅ | US pack 内 `us_quotes` job，按 ET 交易日 scope |

---

## Phase 3 — Crypto（底层先行，无前端）

### 已完成（P3 MVP）

| ID | 项 | 状态 |
|----|-----|------|
| P3-1 | binance/okx SPOT Provider | ✅ |
| P3-2 | 7×24 cache TTL（`crypto_realtime` 30s / `crypto_kline` 300s） | ✅ |
| P3-3 | Engine `crypto*` + Hub/REST/Agent | ✅ |
| P3-4 | `crypto_list` sync → `instruments` | ✅ |
| P3-5 | `InstrumentRef` quote/exchange（`toInstrumentRef`） | ✅ |

### 未完成（P3 后续）

| ID | 项 | 优先级 | 说明 |
|----|-----|--------|------|
| ~~P3-6~~ | **client-ui** Crypto 详情 / 7×24 图表 | ✅ | 快照 + 迷你 K 线，30s 刷新 |
| ~~P3-7~~ | 多 quote（USDC/BTC）本地筛选 | ✅ | `crypto-screen.ts` + Binance 多 quote 列表同步 |
| ~~P3-8~~ | `crypto_quotes` sync | ✅ | Crypto pack 内按 UTC 日 scope |

---

## Phase 4 — 包整理

### 已完成（P4 MVP）

| ID | 项 | 状态 |
|----|-----|------|
| P4-1 | `@opptrix/market-data-core` facade（Engine/Registry/Instrument re-export） | ✅ |
| P4-2 | `@opptrix/market-data-providers-cn` shim | ✅ |
| P4-3 | rename `@opptrix/market-data` → `@opptrix/market-data-store` | ✅ |
| P4-4 | `MarketDataEngine` type alias | ✅ |

### 未完成（P4 后续）

| ID | 项 | 说明 |
|----|-----|------|
| ~~P4-5~~ | 物理迁移 `core/*` 出 a-stock-layer | ✅ | `market-data-core/src/core/*`；a-stock-layer shim 重导出 |
| ~~P4-6~~ | 按市场拆 `market-data-providers-us/crypto` | ✅ | `@opptrix/market-data-providers-us` / `-crypto` shim |
| ~~P4-7~~ | 全量 Provider §6.4 标准化（manifest SPEC + markets handler + thin driver） | ✅ | 20× `providers/<id>/`；`common/driver-factory.ts`；US/Crypto `api/` + `normalize/` |
| ~~P4-8~~ | 移除全部 shim（`drivers/`、`src/tushare/`）；efinance/tdx 收进 providers | ✅ | `scripts/verify-providers.mjs` |

---

## 市场数据包（跨 Phase）

默认仅同步 **A 股（cn）** 基础数据；用户在设置中开启 **美股 / Crypto** 后，再触发对应 pack 的准备同步。

| ID | 项 | 状态 |
|----|-----|------|
| MP-1 | `MarketDataPackConfig` 类型 + 用户偏好 `market_data_packs` | ✅ |
| MP-2 | sync job → pack 映射 + `filterJobsByMarketPacks` | ✅ |
| MP-3 | 自动/增量 sync 仅跑已开启 pack | ✅ |
| MP-4 | `prepareMarketPack` + REST `/api/market-data/packs*` | ✅ |
| MP-5 | 设置页「市场数据包」开关 + 准备数据 | ✅ |
| MP-6 | `.opmd` metadata 写入 `market_packs` 快照 | ✅ |
| ~~MP-7~~ | 按 pack 物理分包导出/导入（选择性 `.opmd`） | ✅ | `market_pack_supplement` + merge 导入 |

**Pack → Jobs**

| Pack | Jobs |
|------|------|
| `cn` | `BOOTSTRAP_SYNC_JOBS` + CN deep jobs（不含 us/crypto list） |
| `us` | `us_list`, `us_quotes` |
| `crypto` | `crypto_list`, `crypto_quotes` |

**关键路径**：`packages/shared/src/market-data-packs.ts`、`market-data/src/sync/market-packs.ts`、`market-pack-settings.ts`、`client-ui/.../MarketDataSettingsSection.tsx`

---

| 区域 | 路径 |
|------|------|
| 设计 | `docs/DATA-LAYER.md` §8.2、§12、§12.1 |
| 进度 | `docs/DATA-LAYER-PROGRESS.md`（本文件） |
| US 工具 | `packages/a-stock-layer/src/utils/us-market.ts` |
| US 标的 | `packages/a-stock-layer/src/core/instrument.ts` |
| Polygon | `packages/a-stock-layer/src/providers/polygon/` |
| Tiingo | `packages/a-stock-layer/src/providers/tiingo/` |
| FMP | `packages/a-stock-layer/src/providers/fmp/` |
| Yahoo 回退 | `packages/a-stock-layer/src/providers/yahoo_us/` |
| Engine | `packages/a-stock-layer/src/engine.ts`（`us*` 段） |
| Hub | `packages/research-hub/src/hub.ts`（`us_*` case） |
| REST | `apps/server/src/index.ts`（`/api/us/*`） |
| Agent | `packages/agent/src/tools.ts`、`tool-meta.ts` |
| Sync | `packages/market-data/src/sync/engine.ts`（`us_list`） |
| Crypto 工具 | `packages/a-stock-layer/src/utils/crypto-market.ts` |
| Binance/OKX | `packages/a-stock-layer/src/providers/binance/`、`providers/okx/` |
| 东财 | `packages/a-stock-layer/src/providers/eastmoney/`（`api/f10.ts`、`markets/cn/research.ts`、`chain.ts`） |
| TDX 协议 | `packages/a-stock-layer/src/providers/tdx/protocol.ts` |
| Provider 注册 | `packages/a-stock-layer/src/providers/register.ts` |
| Provider 公共层 | `packages/a-stock-layer/src/providers/common/` |
| Engine crypto | `packages/a-stock-layer/src/engine.ts`（`crypto*` 段） |
| Hub crypto | `packages/research-hub/src/hub.ts`（`crypto_*` case） |
| REST crypto | `apps/server/src/index.ts`（`/api/crypto/*`） |
| Sync crypto | `packages/market-data/src/sync/engine.ts`（`crypto_list`） |
| 统一检索 | `packages/market-data/src/query/search-instruments.ts` |
| Watchlist instrument | `packages/a-stock-layer/src/watchlist/instrument.ts` |
| 前端 instrument | `client-ui/src/market/instrument.ts` |
| 跨市场详情占位 | `client-ui/src/market/UsDetailTab.tsx`、`CryptoDetailTab.tsx` |
| market-data-core | `packages/market-data-core/` |
| providers-cn | `packages/market-data-providers-cn/` |
| providers-us | `packages/market-data-providers-us/` |
| providers-crypto | `packages/market-data-providers-crypto/` |
| market-data-store | `packages/market-data/`（包名 `@opptrix/market-data-store`） |

---

## 变更日志

| 日期 | 内容 |
|------|------|
| 2026-07-03 | 创建进度文档；启动 P2 polygon + yahoo_us + Hub/REST/Agent/sync |
| 2026-07-03 | P2 MVP 完成：polygon/yahoo_us Provider、us_* API、us_list sync |
| 2026-07-03 | P3 MVP：binance/okx、crypto_* Hub/REST/Agent、crypto_list sync |
| 2026-07-03 | P4 MVP：market-data-core、providers-cn、market-data-store 重命名 |
| 2026-07-03 | P1-3 instrument 字段、统一 instruments 检索、前端多市场骨架（§12.1 部分） |
| 2026-07-03 | 市场数据包分包：默认 CN、可选 US/Crypto 准备同步；us_quotes；设置 UI |
| 2026-07-03 | crypto_quotes、US/Crypto 详情页、补充包导出/合并导入（MP-7） |
| 2026-07-03 | P2-13 美股盘前/盘后 session；P3-7 Crypto 多 quote 本地筛选 |
| 2026-07-03 | P0-1 QueryPlan：TDX/Tushare 编排移出 Engine，mootdx 分页入 driver |
| 2026-07-03 | P0-2 MarketDataEngine canonical；P0-3 providers/tushare；P0-4 binding overrides API/UI |
| 2026-07-03 | P1-4 instruments/stocks v6 统一视图；P1-5 CN ETF bindings 审计 |
| 2026-07-03 | P2-10 Tiingo US 第二数据源；P4-5 core/* 迁入 market-data-core |
| 2026-07-03 | P4-6 providers-us/crypto shim；FMP 美股第三数据源 |
| 2026-07-03 | 全部 20 个数据源迁入 `providers/<id>/` 模块（manifest + settings + driver + index） |
| 2026-07-03 | P4-7 §6.4 完成：`manifest *_SPEC`、`markets/<m>/handler.ts`、薄 `driver.ts` + `applyManifestSpec`；`npm run build:packages` 通过 |
| 2026-07-03 | P4-8 移除 shim（drivers/、tushare/）；efinance/api、tdx/ 收进 providers；verify-providers 审计脚本 |
