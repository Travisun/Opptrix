# 多市场系统架构升级（V2）

> 目标：在现有 CN / US / Crypto 能力之上，建立 **InstrumentRef 主轴 + 注册表 + 标准应用 API**，使日韩港股等横向扩展只需「登记 → 实现 adapter → 开 pack」，而非全栈复制 `stock_*` / `us_*` 分支。

## 1. 现状评估（2026-07）

### 1.1 策略应用层

| 维度 | 现状 | 缺口 |
|------|------|------|
| **主轴** | `DiscoverStrategyProfile`（cn_equity / cn_etf / us_equity / crypto_spot） | 封闭 enum + 多处 `if (profile === …)` |
| **CN 股票** | 因子 prescreen + scorecard + t-strategy + 市况 regime | — |
| **CN ETF** | 本地筛选 + 决策雷达 + Agent 挖掘 | — |
| **US / Crypto** | 列表筛选 + Agent 挖掘（无 scorecard） | 无 regime；prescreen 无排序分 |
| **HK** | 无 discover profile | Provider / pack 未接 |
| **JP / KR** | 全栈未建模 | 类型、pack、provider、discover 皆无 |
| **Scorecard** | `scorecard-registry` 路由 cn_equity / cn_etf | US/Crypto/JP 无统一评分 facade |
| **t-strategy** | ETF 已跳过 CN 宏观字段 | 仍不可用于 US/JP；需 market-aware gather |

**结论**：Profile 架构方向正确，但 **DiscoverRunner / tool-meta / regime** 仍为四路硬编码；扩展第五市场需改 6+ 包。

### 1.2 数据层

| 维度 | 现状 | 缺口 |
|------|------|------|
| **Instrument** | `InstrumentRef` + SQLite `instruments` | `Market` 无 JP/KR；pack 仅 cn/us/crypto |
| **Provider** | §6.4 三维 Registry `(market × assetClass × capability)` | HK 零 provider；Engine 大量 CN 默认 |
| **本地库** | CN 深（因子/K线/ETF）；US/Crypto 浅（list + quotes） | 无 `jp_count` / `kr_count`；screen 每市场一份文件 |
| **Pack** | 用户开关 + sync job 过滤 | `MarketDataPackId` 封闭；server 校验写死三 pack |

**结论**：数据层 **骨架可扩展**（Registry + instruments 表），**执行路径未参数化**（Engine 方法族膨胀、validator 硬编码）。

### 1.3 应用层（聊天 / 搜索 / 右栏）

| 维度 | 现状 | 缺口 |
|------|------|------|
| **API** | 双轨：`stock_*` hub + `/api/us/*` REST | 无统一 instrument API；关注列表仍调 CN quotes |
| **搜索** | 工作区 CN stocks；聊天 `@` 用 `search_local_instruments` | 未统一 |
| **右栏** | CN 全功能；US/Crypto 快照；HK 走 US 面板 | 图表 / 雷达 / 分析管线未 capability-gate |
| **格式化** | `format.ts` 万/亿、手 | 未按 market 分 formatter |

**结论**：`InstrumentRef` 已部分落地，**产品主路径仍 CN-first**。

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

### Phase A — 应用 API 统一（当前迭代）

- [x] shared 注册表与 capability 矩阵
- [x] Hub `instrument_*` + InstrumentRouter
- [x] REST `/api/instruments/*`
- [x] client `research.instrumentSnapshot/Quotes/Chart/Capabilities`
- [ ] 关注列表改用 `instrument_quotes`
- [ ] `TradingViewChart` 经 `instrument_chart` 分支
- [ ] 工作区搜索合并为 `instrument_search`
- [ ] `useStockAnalysis` 经 `hasApplicationCapability` 门禁

### Phase B — 策略层参数化

- [ ] `DiscoverRunner` 读取 `DISCOVER_PROFILE_REGISTRY`，消除四路 prescreen 分支
- [ ] `discoverMiningToolNames` 改读 registry `miningToolGroup`
- [ ] `EvaluationEngine` 接口：`evaluate(ref: InstrumentRef)` facade（CN 实现，US 返回 not_supported）
- [ ] Regime：`market_regime` 增加 `profile_scope` 或独立 `us_regime` stub
- [ ] t-strategy：`gatherAll(ref)` 按 market 加载上下文

### Phase C — 数据层参数化

- [ ] `MarketDataPackId` 改为 registry 驱动（存 JSON 时向后兼容）
- [ ] 泛化 `local*Screen(store, packId, query)` 替代 us/crypto 复制
- [ ] Engine：`queryInstrument(ref, capability)` 收敛 `us*`/`crypto*` 方法族
- [ ] Readiness context：`Record<PackId, number>` 替代固定四计数
- [ ] HK pack + provider MVP

### Phase D — 日韩扩展

- [ ] JP/KR normalizer + 交易日历
- [ ] Provider（Tiingo/FMP/本地 vendor）+ list sync
- [ ] `jp_equity` / `kr_equity` discover（复用 list_filter 模板）
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
| discover_mine | ✓ | ✓ | ✓ | — | ✓ |
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
- US/JP 统一 scorecard facade
- 按 market 的 quote formatter（万/亿 vs K/M/B）

