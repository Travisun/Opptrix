# 多市场系统架构升级（V2）

> 目标：在现有 CN / US / Crypto 能力之上，建立 **InstrumentRef 主轴 + 注册表 + 标准应用 API**，使日韩港股等横向扩展只需「登记 → 实现 adapter → 开 pack」，而非全栈复制 `stock_*` / `us_*` 分支。

## 1. 现状评估（2026-07-03 更新）

### 1.1 策略应用层

| 维度 | 现状 | 缺口 |
|------|------|------|
| **主轴** | `DISCOVER_PROFILE_REGISTRY` 驱动 prescreen / mining 工具组 | 深度 scorecard / t-strategy 仍 CN 为主（产品设计） |
| **CN 股票** | 因子 prescreen + scorecard + t-strategy + 市况 regime | — |
| **CN ETF** | 本地筛选 + 决策雷达 + Agent 挖掘 | — |
| **US / Crypto** | 列表筛选 + registry 挖掘 + SPY regime stub | 无 CN 级 scorecard |
| **HK / JP / KR** | 7 profile；list_filter + 区域挖掘；Yahoo 行情 | 无跨市场 scorecard |
| **Scorecard** | `gateInstrumentEvaluation(ref)` facade | 非 CN 返回 not_supported |
| **t-strategy** | CN 完整；`gatherStrategyData(ref)` 支持跨市场技术字段 | `strategy_signal` 产品 gate 仍 CN |

**结论**：Discover **prescreen / mining 已 registry 化**；深度评估与策略信号 intentionally CN-only。

### 1.2 数据层

| 维度 | 现状 | 缺口 |
|------|------|------|
| **Instrument** | `InstrumentRef` + SQLite 六市场 | — |
| **Provider** | Yahoo regional（JP/KR/HK）+ US/Crypto 既有 provider | Tiingo/FMP 作 list 主源（可选） |
| **本地库** | CN 深；US/Crypto 浅；**JP/KR/HK 各 50 种子 + Yahoo 补充** | 全市场 universe 仍小于 CN |
| **Pack / Sync** | `queryInstrumentData` 收敛；区域 quotes 休市日跳过 | 动态 exchange 假日历维护 |
| **Engine** | `profile` / `financials` / `stock_list` capability 已纳入 | legacy 方法仍作内部 shim |

**结论**：数据层 **pack / screen / sync 已参数化**；区域 list 达 MVP 可用规模，正式 vendor 替换为增强项。

### 1.3 应用层（聊天 / 搜索 / 右栏）

| 维度 | 现状 | 缺口 |
|------|------|------|
| **API** | `instrument_*` Hub + REST + `API.md` 章节 | — |
| **搜索** | 工作区 / 聊天 `@` → `searchInstruments` | `searchStocks` 保留兼容 |
| **右栏** | capability gate + `CrossMarketDetailTab` | `IndustryTab` CN-only（已标注，符合产品） |
| **图表** | 非 CN → `instrument_chart`；CN 分时仍 `stockChart` | — |
| **格式化** | `formatPriceForMarket` — CrossMarket + 关注列表/备注抽屉 | `PortfolioTab` 仍 CN（组合仅 A 股） |

**结论**：应用主路径 **InstrumentRef-first**；行业页与组合页为 CN 遗留面，与 capability 矩阵一致。

---

## 2. 目标架构（三层 + 标准接口）

```
┌─────────────────────────────────────────────────────────────┐
│  应用层 Application                                         │
│  client-ui · Agent tools · 工作区搜索 · 右栏面板              │
│  消费：ApplicationCapability + APPLICATION_HUB_FEATURES       │
└───────────────────────────┬─────────────────────────────────┘
                            │ InstrumentRef
┌───────────────────────────▼─────────────────────────────────┐
│  编排层 Orchestration — ResearchHub                           │
│  instrument_* 统一路由 · discover_* · market_regime*          │
│  InstrumentRouter → 市场 adapter（保留 stock_/us_ 实现）     │
└───────────────────────────┬─────────────────────────────────┘
                            │
        ┌───────────────────┼───────────────────┐
        ▼                   ▼                   ▼
┌───────────────┐  ┌───────────────┐  ┌───────────────────┐
│ 策略 Strategy │  │ 数据 Data     │  │ 评估 Evaluation   │
│ ProfileRegistry│  │ MarketRegistry│  │ ScorecardRegistry │
│ DiscoverRunner│  │ Pack + Sync   │  │ stock-eval (CN)   │
│ t-strategy    │  │ Provider §6.4 │  │ 未来 per-market   │
└───────────────┘  └───────────────┘  └───────────────────┘
```

### 2.1 标准接口（已实现于 `@opptrix/shared`）

| 模块 | 路径 | 职责 |
|------|------|------|
| **Instrument 解析** | `instrument-ref.ts` | `parseInstrumentRef`, `instrumentRefKey`, `instrumentDisplayCode` |
| **市场注册表** | `market-registry.ts` | `MARKET_REGISTRY`, `PLANNED_MARKET_REGISTRY`（JP/KR） |
| **应用能力矩阵** | `instrument-capabilities.ts` | `ApplicationCapability`, `resolveInstrumentCapabilities` |
| **发现 Profile 注册表** | `discover-profile-registry.ts` | prescreenMode, miningToolGroup, readiness 字段映射 |
| **Scorecard 路由** | `scorecard-registry.ts` | Profile → 评分卡名 |
| **应用 Hub 契约** | `application-api.ts` | `APPLICATION_HUB_FEATURES`, `UnifiedInstrumentQuote` |

### 2.2 标准 Hub Features（应用层应优先使用）

| Feature | 说明 | 替代的旧 feature |
|---------|------|------------------|
| `instrument_snapshot` | 按 InstrumentRef 聚合快照 | `stock_detail`, `us_snapshot`, `crypto_snapshot`, `etf_snapshot` |
| `instrument_quotes` | 批量混合市场报价 | `stock_quotes`（仅 CN） |
| `instrument_chart` | 按 Ref 拉 K 线/图表 | `stock_chart`, `us_kline`, `crypto_kline` |
| `instrument_search` | 跨市场本地搜索 | `search_stocks`, `search_local_instruments`（统一入口） |
| `instrument_capabilities` | 查询 UI 应展示哪些能力 | （新） |

实现：`packages/research-hub/src/instrument-router.ts`  
REST：`POST /api/instruments/{snapshot,quotes,chart,capabilities}`

### 2.3 发现策略标准契约

每个 Profile 在 `DISCOVER_PROFILE_REGISTRY` 登记：

```typescript
interface DiscoverProfileDefinition {
  id: DiscoverStrategyProfile
  prescreenMode: 'factor_screen' | 'etf_screen' | 'list_filter' | 'blocked'
  scorecardProfile: ScorecardProfile | null
  miningToolGroup: DiscoverMiningToolGroup
  packId: MarketDataPackId | null
  readinessCountKey: 'stock_count' | 'etf_count' | 'us_count' | 'crypto_count' | null
}
```

**新增市场（以 JP 为例） checklist：**

1. `market-registry.ts` → `Market = 'JP'`, `PLANNED` → `live`
2. `market-data-packs.ts` → `jp` pack + sync jobs `jp_list`, `jp_quotes`
3. `discover-profile-registry.ts` → `jp_equity`, `prescreenMode: list_filter`
4. `a-stock-layer` → provider + `markets/jp/handler.ts`
5. `market-data/query/jp-screen.ts` + hub `local_jp_screen`（或泛化 `local_list_screen(pack)`）
6. `agent` → `jpEquity()` 策略 + `JP_MINING_TOOL_NAMES`
7. `client-ui` → Profile Tab + `capabilities.ts` 矩阵一行

---

## 3. 分域升级路线

### Phase A — 应用 API 统一

- [x] shared 注册表与 capability 矩阵
- [x] Hub `instrument_*` + InstrumentRouter
- [x] REST `/api/instruments/*`
- [x] client `research.instrumentSnapshot/Quotes/Chart/Capabilities`
- [x] 关注列表改用 `instrument_quotes`
- [x] `TradingViewChart` 非 CN 经 `instrument_chart`（CN 分时/分钟仍 `stockChart`）
- [x] 工作区搜索 / 聊天 `@` 合并为 `searchInstruments`
- [x] `useStockAnalysis` 经 `hasApplicationCapability` 门禁
- [ ] `IndustryTab` 改 instrument 或保持 CN-only 并文档化（当前 CN-only + 标注）
- [x] `API.md` 补充 instrument_* 章节

### Phase B — 策略层参数化

- [x] `DiscoverRunner` prescreen 读 `discoverPrescreenMode` + `localScreenFeature`
- [x] `discoverMiningToolNamesForProfile` 读 registry `miningToolGroup`
- [x] `buildDiscoverMiningSystemPrompt` — Agent system prompt registry 驱动
- [x] `discoverProfileAssetLabel` — 策略解析 / 执行提示统一
- [x] `gateInstrumentEvaluation(ref)` facade（CN 实现，其他 not_supported）
- [x] Regime：`market_regime` 支持 `profile_scope=cn|us`；US 基于 SPY 动量 stub
- [x] t-strategy：`gatherStrategyData(ref)` + `quickAssess` 可选 InstrumentRef
- [x] t-strategy：Hub `strategySignal` 传 InstrumentRef（仍 CN-only gate）

### Phase C — 数据层参数化

- [x] `MarketDataPackId` registry 驱动（`pack-registry` 六市场）
- [x] 泛化 `localListScreen(store, packId, query)` + `regional-equity-screen`
- [x] Readiness context：`jp_count` / `kr_count` / `hk_count`
- [x] HK pack + discover profile + supplement 导出
- [x] `syncRegionalList` — JP/KR/HK 各 50 只种子 + Yahoo 补充
- [x] `syncRegionalQuotes` — jp/hk/kr_quotes；休市日跳过
- [x] Engine：`queryInstrumentData(ref, cap)` 收敛 DataEngine 入口
- [x] HK/JP/KR Yahoo regional provider + `regionalRealtime/Kline`
- [x] Hub / sync / t-strategy 主路径改经 `queryInstrumentData`；legacy `us*`/`crypto*`/`regional*` 已 @deprecated

### Phase D — 日韩港扩展

- [x] `jp_equity` / `kr_equity` / `hk_equity` discover（list_filter 模板）
- [x] Agent 区域 screen / mining 工具 wired
- [x] HK `discover_mine` capability 对齐 JP/KR
- [x] JP/KR/HK normalizer + 交易日历（本地时区 tradeDate + 静态假日历 + sync 休市跳过）
- [x] Provider 列表：`yahoo_jp/kr/hk` 登记 `STOCK_LIST`；`jp_list` 经 Provider 灌库
- [ ] 可选：简单 momentum scorecard（非 CN 因子库）

---

## 4. 能力矩阵（右栏 / 聊天）

| ApplicationCapability | CN 股票 | CN ETF | US | HK | Crypto |
|----------------------|---------|--------|-----|-----|--------|
| quote / batch_quote | ✓ | ✓ | ✓ | ✓ | ✓ |
| snapshot | ✓ | ✓ | ✓ | ✓ | ✓ |
| chart_intraday | ✓ | — | — | — | — |
| chart_daily | ✓ | ✓ | ✓ | ✓ | ✓ |
| scorecard | ✓ | ✓ | — | — | — |
| factor_screen | ✓ | — | — | — | — |
| strategy_signal | ✓ | — | — | — | — |
| institution_rating | ✓ | — | — | — | — |
| cyq / money_flow | ✓ | — | — | — | — |
| industry_context | ✓ | — | — | — | — |
| discover_mine | ✓ | ✓ | ✓ | ✓ | ✓ |
| portfolio_pnl | ✓ | — | 部分 | — | — |

UI 规则：**先 `instrument_capabilities`，再决定渲染 StockDetailTab 还是 CrossMarketSnapshot，是否调用 `useStockAnalysis`。**

---

## 5. 包职责（升级后）

| 包 | 职责 |
|----|------|
| `@opptrix/shared` | 类型 + 注册表 + 纯函数（regime/scorecard/readiness） |
| `@opptrix/market-data-core` | Provider Registry + binding 工厂 |
| `@opptrix/a-stock-layer` | Provider 实现 + Engine（逐步 InstrumentRef-first） |
| `@opptrix/market-data-store` | SQLite + sync + 泛化 local query |
| `@opptrix/stock-eval` | **CN 因子评估 adapter**（非全球唯一 eval） |
| `@opptrix/t-strategy` | **CN 技术信号 adapter** |
| `@opptrix/agent` | DiscoverRunner + tools（读 registry） |
| `@opptrix/research-hub` | Hub dispatch + InstrumentRouter |
| `client-ui` | capability mirror + 统一 instrument API |

### 5.1 Agent MCP 工具

聊天 Agent 与 Discover 挖掘共用 `ToolRegistry`，但 **默认暴露给 LLM 的工具集不同**：

| 场景 | 白名单 | 说明 |
|------|--------|------|
| **聊天** | `CHAT_MCP_TOOL_NAMES(registry)` | 从 registry 全量工具中 **排除** `LEGACY_MARKET_DATA_TOOL_NAMES`（如 `get_us_stock_quote`、`get_crypto_quote`、部分 `get_stock_*`） |
| **Discover 挖掘** | `discoverMiningToolNamesForProfile` → `DISCOVER_MINING_TOOL_GROUPS` | 非 CN profile 的行情补全使用 `UNIFIED_INSTRUMENT_MINING_TOOLS` |

**统一 MCP 工具（InstrumentRef 入口，`packages/agent/src/unified-mcp-tools.ts`）**：

| 工具 | 职责 |
|------|------|
| `get_instrument_capabilities` | 查询标的可用能力 |
| `get_instrument_snapshot` | 单只聚合快照 |
| `get_instrument_quotes` | 批量混合市场报价 |
| `get_instrument_chart` | K 线 / 图表 |
| `evaluate_instrument` | 评估：A 股因子评分卡 / 其他市场技术面 bundle |
| `get_instrument_strategy_signal` | 9 策略融合多空倾向（全市场有日K者） |
| `get_instrument_indicators` | 技术指标最新值与序列摘要 |
| `verify_instrument_strategy` | 历史信号胜率验证（K 线回测） |

**分析抽象层（`packages/shared/src/instrument-analytics.ts` + Hub `instrument-analytics-router.ts`）**：

| 模式 | 市场 | 评估 | 策略 | 指标 |
|------|------|------|------|------|
| `cn_factor_scorecard` | CN 股票 | EvaluationEngine 因子评分 | 9 策略 + 宏观 | ✓ |
| `cn_etf_scorecard` | CN ETF | ETF 决策雷达 | 9 策略 | ✓ |
| `technical_bundle` | US/HK/JP/KR/Crypto | 技术面综合分 | 9 策略（K 线驱动） | ✓ |

Discover 挖掘组（US / Crypto / JP / KR / HK）展开 **`UNIFIED_INSTRUMENT_MINING_TOOLS`**（行情四件套 + `UNIFIED_INSTRUMENT_ANALYTICS_TOOLS`）。**CN 挖掘与聊天已收敛至统一 `instrument_*` 工具**（含 `batch_instrument_snapshots`、`evaluate_instrument`、`get_instrument_cyq` 等）；legacy `get_stock_*` / `evaluate_stock` / `batch_stock_snapshots` 仍注册于 ToolRegistry 供内部兼容，默认聊天白名单不再暴露。

旧版按市场拆分的 `get_us_stock_*`、`get_crypto_*` 等仍注册于 ToolRegistry 供内部兼容，**默认聊天白名单已不再暴露**；Agent 应优先引导 LLM 使用 `get_instrument_*` 与 `evaluate_instrument` / `get_instrument_strategy_signal`。

---

## 6. 反模式（扩展时避免）

1. **新增 `jp_snapshot` + `jp_kline` + … 全套 hub case** — 应扩展 `InstrumentRouter` 一支。
2. **在 DiscoverRunner 再加 `else if (profile === 'jp_equity')`** — 应登记 `DiscoverProfileDefinition`。
3. **UI 对 US 代码调 `stockQuotes`** — 应 `instrumentQuotes([ref])`。
4. **复制 `us-screen.ts` 为 `jp-screen.ts` 而不抽象 query 接口** — 应参数化 pack。
5. **在 client-ui 引入 `@opptrix/shared` 大包** — 继续 mirror 注册表（`discoverProfiles.ts`, `capabilities.ts`）。

---

## 7. 相关文档

- [ARCHITECTURE.md](./ARCHITECTURE.md) — 总览与请求流
- [DATA-LAYER.md](./DATA-LAYER.md) — Provider §6.4 与 Schema
- [API.md](./API.md) — Hub features 列表（待补充 instrument_*）
- [RIGHT-PANEL-RESEARCH-PLAN.md](./RIGHT-PANEL-RESEARCH-PLAN.md) — 右栏产品规划

---

## 8. 本次落地文件清单

```
packages/shared/src/
  instrument-ref.ts
  market-registry.ts
  instrument-capabilities.ts
  discover-profile-registry.ts
  application-api.ts

packages/research-hub/src/
  instrument-router.ts

apps/server/src/index.ts          # POST /api/instruments/*
client-ui/src/api/client.ts       # research.instrument*
client-ui/src/market/capabilities.ts
client-ui/src/types/instrument.ts # UnifiedInstrumentQuote
```

后续 PR 应按 **Phase A → B → C → D** 顺序推进，每阶段保持 main 可发布。

---

## 9. 审计修复落地（2026-07-03）

在 Phase A–D 基础上，已完成前端 + 策略层 P0/P1 修复（未单独发版 tag）：

| 区域 | 内容 |
|------|------|
| **右栏路由** | `detailPanelKind` → `cross-market`；US/HK/JP/KR 统一 `CrossMarketDetailTab` + `instrumentSnapshot` |
| **身份** | `watchlistItemKey` / `instrumentDisplayCode`；JP/KR 不再 A 股补零 |
| **能力门控** | UI + Hub 双保险：`strategy_signal` / `watchlist_radar` / `latest_evaluation` / `portfolio_pnl` 仅 CN |
| **Discover** | `hk_equity` profile；JP/KR/HK 独立挖掘工具组；禁止 CN 工具 fallback |
| **上下文** | `StockContext.instrument`；顶栏搜索 / Agent 携带市场标签 |
| **关注管理** | 非 A 股详情页「备注」入口；`FollowStockDialog` 分市场（备注 vs 持仓录入） |
| **测试** | `tests/multi-market-architecture.test.mjs` — 7 profile、`isLikelyCnEquityInput`、HK 工具组 |

**仍待后续 Phase**（非阻塞发布）：

- ~~工作区 `MarketDataSettingsSection` 导出/导入仅 us/crypto 包~~（已支持 hk/jp/kr 补充包）
- ~~`apps/server` pack 校验扩展 hk/jp/kr~~（prepare / export 已对齐 Hub）
- US/JP 统一 scorecard facade（`gateInstrumentEvaluation` 已就位，深度评估待产品需求）
- ~~按 market 的 quote formatter~~（CrossMarket + 关注列表已接入；组合页仍 CN）

---

## 10. 实施记录（living log）

| 日期 | Phase | 内容 | 状态 |
|------|-------|------|------|
| 2026-07-03 | 基线 | `49ac0d8` 多市场骨架：InstrumentRef、pack registry、JP/KR discover MVP | done |
| 2026-07-03 | A/B | `8b013a9` 审计修复：cross-market 右栏、CN API gate、HK profile、补充包 | done |
| 2026-07-03 | A | Phase A 收尾：instrument_quotes / instrument_chart / capability gate 确认 | done |
| 2026-07-03 | B | `discover-mining-prompt.ts` + DiscoverRunner registry 驱动 mining prompt | done |
| 2026-07-03 | B | `evaluate-instrument.ts` + Hub `latestEvaluation` 经 `gateInstrumentEvaluation` | done |
| 2026-07-03 | C | `syncRegionalList` + JP/KR/HK 各 20 只 MVP 种子 | done |
| 2026-07-03 | D | HK `discover_mine` + batch_quote capability 对齐 | done |
| 2026-07-03 | B | `market_regime` profile_scope + SPY 美股市况 stub | done |
| 2026-07-03 | B | `gatherStrategyData(ref)` + t-strategy 导出 | done |
| 2026-07-03 | C | `jp/hk/kr_quotes` sync + pack registry 对齐 | done |
| 2026-07-03 | C | `queryInstrument` facade（research-hub） | done |
| 2026-07-03 | A | `API.md` instrument REST 章节 | done |
| 2026-07-03 | C/D | Yahoo regional provider + `queryInstrumentData` + regional router | done |
| 2026-07-03 | A | `formatPriceForMarket` + CrossMarket 接入 | done |
| 2026-07-03 | A | 关注列表 / FollowStockDialog 按 market 格式化 | done |
| 2026-07-03 | B | Hub `strategySignal` 解析 InstrumentRef + quickAssess(ref) | done |
| 2026-07-03 | — | `279cccf` push origin/main | done |
| 2026-07-03 | C | `queryInstrumentData` 收敛 Hub/sync/t-strategy；regional calendar | done |
| 2026-07-03 | C | `queryInstrumentData` 扩展 profile/financials/stock_list | done |
| 2026-07-03 | D | regional 假日历 MVP + Yahoo search 列表补充 | done |
| 2026-07-03 | D | 区域种子扩至 50/市场 + Yahoo 搜索增强 + sync 休市跳过 | done |
| 2026-07-03 | A | 文档 §1 现状表与实现对齐 | done |
| — | D | Tiingo/FMP vendor + 动态假日历维护 | pending |
| — | B | 非 CN momentum scorecard（可选） | pending |

