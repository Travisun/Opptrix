# Opptrix 全面架构指南

> **版本**：v1.0 · 2026-07-14  
> **适用对象**：开发者、AI Agent、代码审查者  
> **关联文档**：[ARCHITECTURE.md](./ARCHITECTURE.md)、[AGENT-GUIDE.md](./AGENT-GUIDE.md)、[DEVELOPMENT.md](./DEVELOPMENT.md)

---

## 目录

1. [项目总览与设计原则](#1-项目总览与设计原则)
2. [包结构与职责划分](#2-包结构与职责划分)
3. [数据库层（SQLite）](#3-数据库层sqlite)
4. [数据层架构](#4-数据层架构)
5. [Provider 机制](#5-provider-机制)
6. [模块化开发规范](#6-模块化开发规范)
7. [UI 规范与设计系统](#7-ui-规范与设计系统)
8. [Electron 桌面架构与安全](#8-electron-桌面架构与安全)
9. [弹性模式（Resilience Patterns）](#9-弹性模式resilience-patterns)
10. [端口管理与进程生命周期](#10-端口管理与进程生命周期)
11. [本地翻译服务](#11-本地翻译服务)
12. [测试基础设施](#12-测试基础设施)
13. [CI/CD 流水线](#13-cicd-流水线)
14. [配置管理与环境变量](#14-配置管理与环境变量)
15. [发布打包要求](#15-发布打包要求)
16. [发布前打包测试](#16-发布前打包测试)
17. [发布前完全可用审计流程](#17-发布前完全可用审计流程)
18. [开发工作流速查](#18-开发工作流速查)

---

## 1. 项目总览与设计原则

### 1.1 项目定位

Opptrix 是一款面向投资者的 AI 投研助手，支持 Web 和 Electron 桌面端。核心能力包括：

- **多市场行情**：A 股、美股、港股、加密货币等
- **AI Agent 对话**：基于 LLM 的投研问答与工具调用
- **深度投研**：因子分析、机构评级、策略信号、K 线分析
- **本地数据挖掘**：本地因子选股与 Duck 衍生维护管道已移除；名录/K 线缓存与 `.opmd` 兼容层保留

### 1.2 设计原则

| 原则 | 说明 |
|------|------|
| **单一调度入口** | 投研能力经 `ResearchHub.dispatch()` 或 `queryInstrumentData()` 路由；HTTP 与 Agent tools 共用实现 |
| **InstrumentRef 主轴** | 标的以 `{ market, assetClass, symbol }` 标识；应用层优先 `instrument_*` Hub feature |
| **纯 Node 运行时** | 抓取、协议、因子、报告均在 TypeScript 完成，无 Python 桥接 |
| **Web 与桌面并存** | `client-ui` 为 Vite SPA；Electron 加载同一 UI，API 以 sidecar 运行 |
| **用户数据本地化** | 配置、会话、关注列表等写入 `~/.opptrix/opptrix.db` |
| **Capability 作为稳定契约** | 上层只关心「要什么数据」，不关心具体源站 |
| **优先级回退链** | Provider 按优先级依次尝试，首个成功即返回 |
| **渐进迁移** | 重构不破坏现有 API；A 股行为保持不变 |

### 1.3 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | React 18 + Fluent UI v9 + TypeScript + Vite |
| 桌面 | Electron + electron-builder + electron-updater |
| API | Fastify (apps/server) |
| 数据库 | better-sqlite3 (user-store) |
| LLM | OpenAI 兼容 API + Function Calling |
| 工具协议 | MCP (Model Context Protocol) |
| 构建 | npm workspaces + TypeScript project references |

---

## 2. 包结构与职责划分

### 2.1 包依赖关系

```
shared  (+ market-registry, instrument-ref, discover profiles)
  ↑
market-data-core · provider-sdk
  ↑
a-stock-layer · market-data-providers-{cn,us,crypto}
  ↑
market-data-store · stock-eval · institutions · t-strategy · skills · news-feed · article-enrichment
  ↑
research-hub · search-hub · local-inference
  ↑
agent · user-store
  ↑
server · (desktop 仅壳层 + 打包)
```

### 2.2 核心包职责

| 包 | 路径 | 职责 |
|----|------|------|
| `@opptrix/shared` | `packages/shared` | InstrumentRef、市场注册表、类型定义、工具函数 |
| `@opptrix/market-data-core` | `packages/market-data-core` | Capability 枚举、DriverRegistry、Cache、Binding 定义 |
| `@opptrix/provider-sdk` | `packages/provider-sdk` | Provider 开发辅助、`defineProvider`、验证器 |
| `@opptrix/a-stock-layer` | `packages/a-stock-layer` | MarketDataEngine、Provider 实现、TDX 客户端 |
| `@opptrix/market-data-providers-cn` | `packages/market-data-providers-cn` | A 股 Provider 实现（东财、新浪、腾讯等） |
| `@opptrix/market-data-providers-us` | `packages/market-data-providers-us` | 美股 Provider 实现 |
| `@opptrix/market-data-providers-crypto` | `packages/market-data-providers-crypto` | 加密货币 Provider 实现（Binance、OKX） |
| `@opptrix/user-store` | `packages/user-store` | 用户 SQLite 持久化（配置、会话、关注、Provider 设置） |
| `@opptrix/stock-eval` | `packages/stock-eval` | 40 因子、8 评分卡、筛选、回测、快照 |
| `@opptrix/institutions` | `packages/institutions` | 28 evaluator，YAML 驱动机构共识评级 |
| `@opptrix/t-strategy` | `packages/t-strategy` | 9 种策略信号、`verifyStrategy`、组合权重 |
| `@opptrix/research-hub` | `packages/research-hub` | Hub 调度（`feature` 字符串路由） |
| `@opptrix/search-hub` | `packages/search-hub` | 跨市场标的搜索 |
| `@opptrix/agent` | `packages/agent` | LLM + MCP 工具（40+ 工具） |
| `@opptrix/news-feed` | `packages/news-feed` | 新闻 RSS 与订阅 |
| `@opptrix/article-enrichment` | `packages/article-enrichment` | 文章增强与摘要 |
| `@opptrix/local-inference` | `packages/local-inference` | 桌面本地翻译/推理 |
| `@opptrix/server` | `apps/server` | Fastify API 服务 |
| `@opptrix/desktop` | `apps/desktop` | Electron 桌面壳 + 打包 |
| `opptrix-client` | `client-ui` | React SPA 前端 |

---

## 3. 数据库层（SQLite）

### 3.1 数据库架构

项目使用 SQLite 作为本地持久化存储，主要分为三个层次：

```
┌─────────────────────────────────────────────────────┐
│  用户层 (user-store)                                 │
│  ~/.opptrix/opptrix.db                              │
│  ├─ meta           迁移标记                          │
│  ├─ documents      通用文档存储 (namespace + id)     │
│  ├─ provider_settings  Provider 配置                 │
│  ├─ speed_ranking  Provider 速度排名                 │
│  ├─ free_provider_throttle  免费源限流               │
│  ├─ fts_sessions   会话全文搜索                      │
│  └─ fts_news       新闻全文搜索                      │
├─────────────────────────────────────────────────────┤
│  行情层 (market-data)                                │
│  ~/.opptrix/market-data/*.db                        │
│  ├─ stocks         股票基础信息                      │
│  ├─ klines         K 线历史数据                      │
│  ├─ factors        因子数据                          │
│  └─ instrument_ns  标的命名空间 (v9+)                │
├─────────────────────────────────────────────────────┤
│  新闻层 (news-feed)                                  │
│  ~/.opptrix/news.db                                 │
│  ├─ feeds          RSS 订阅源                        │
│  └─ articles       文章存储                          │
└─────────────────────────────────────────────────────┘
```

### 3.2 user-store 详解

**入口**：`packages/user-store/src/store.ts`

```typescript
export class UserDataStore {
  private static inst: UserDataStore | null = null
  private db: Database.Database
  readonly providerSettings: ProviderSettingsRepository
  readonly speedRanking: SpeedRankingRepository
  readonly freeProviderThrottle: FreeProviderThrottleRepository
}
```

**核心表结构**：

```sql
-- 元数据表（迁移标记）
CREATE TABLE meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- 通用文档存储（namespace + id 二维键）
CREATE TABLE documents (
  namespace TEXT NOT NULL,
  id TEXT NOT NULL,
  data TEXT NOT NULL,           -- JSON 序列化
  updated_at TEXT NOT NULL,
  PRIMARY KEY (namespace, id)
);

-- Provider 设置
CREATE TABLE provider_settings (
  provider_id TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL DEFAULT 1,
  priority INTEGER,
  settings TEXT,                -- JSON: API keys, 自定义配置
  updated_at TEXT NOT NULL
);

-- 速度排名（Provider 性能记录）
CREATE TABLE speed_ranking (
  provider_id TEXT NOT NULL,
  capability TEXT NOT NULL,
  avg_response_ms REAL,
  success_rate REAL,
  sample_count INTEGER,
  PRIMARY KEY (provider_id, capability)
);

-- 免费源限流
CREATE TABLE free_provider_throttle (
  provider_id TEXT NOT NULL,
  window_start TEXT NOT NULL,
  query_count INTEGER NOT NULL DEFAULT 0,
  error_count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (provider_id, window_start)
);

-- 全文搜索（会话）
CREATE VIRTUAL TABLE fts_sessions USING fts5(
  session_id, title, content,
  content='', content_rowid=''
);

-- 全文搜索（新闻）
CREATE VIRTUAL TABLE fts_news USING fts5(
  article_id, title, summary, source,
  content='', content_rowid=''
);
```

**文档操作 API**：

```typescript
// 读取
getDocument<T>(namespace: string, id: string): T | null

// 写入（幂等 upsert）
setDocument(namespace: string, id: string, data: unknown): void

// 删除
deleteDocument(namespace: string, id: string): void

// 列表
listDocuments<T>(namespace: string): T[]
listDocumentIds(namespace: string): string[]
```

### 3.3 Schema 迁移规则（硬性）

**禁止断代**：任何已发布客户端在升级后仍须能打开、读数据、逐步迁移。

**必须遵守**：

1. **注册迁移步骤**：每增一版须 `up()` + `isApplied()`；启动时自动检测旧 schema 并逐步升级
2. **版本号一致**：`SCHEMA_VERSION` 与注册表步数必须匹配
3. **幂等**：重复 `migrate` 安全；`isApplied` 为真时不得再执行破坏性 DDL
4. **失败可重试**：`up` 后 `isApplied` 校验失败 → 抛错且不写完成标记
5. **只增不破**：优先 `ALTER TABLE` / 新表 + 回填；禁止无迁移地 `DROP`/重命名列
6. **过渡期双读/双写**：读优先新格式，回退读旧格式

**market-data 专用清单**：

```typescript
// schema.ts
SCHEMA_VERSION += 1
MIGRATION_V(N+1)_SQL = `ALTER TABLE ...`

// schema-migrate.ts
MIGRATION_STEPS.push({
  version: N+1,
  description: '...',
  isApplied: (db) => { /* 检查结构 */ },
  up: (db) => { db.exec(MIGRATION_V(N+1)_SQL) }
})
```

**测试要求**：

| 场景 | 做法 |
|------|------|
| 跨版本跃迁 | `seedDatabaseThroughVersion(db, priorVersion)` → 打开后断言版本正确且数据保留 |
| 幂等 | 已在最新版的库上连续 `migrate` 两次，行数/结构不变 |
| 部分失败恢复 | 模拟半迁移状态，再次打开须补齐结构 |
| 注册表一致 | `MIGRATION_STEPS.length === SCHEMA_VERSION` 且 version 连续 |

---

## 4. 数据层架构

### 4.1 整体架构

```
┌─────────────────────────────────────────────────────────────┐
│  ResearchHub / Agent / MarketDataService                    │
└───────────────────────────┬─────────────────────────────────┘
                            │
         ┌──────────────────┴──────────────────┐
         ▼                                      ▼
┌─────────────────────┐              ┌─────────────────────┐
│ @opptrix/a-stock-layer │              │ @opptrix/market-data   │
│ MarketDataEngine (在线) │◄── sync ────│ SQLite (本地挖掘)      │
│ 14× BaseDriver        │              │ 因子 / K线 / 筛选      │
└─────────────────────┘              └─────────────────────┘
```

### 4.2 核心组件

#### MarketDataEngine（唯一标准入口）

**位置**：`packages/a-stock-layer/src/engine.ts`

```typescript
export class MarketDataEngine {
  readonly registry = new DriverRegistry()
  readonly cache = new Cache()
  readonly providerCatalog: ProviderCatalogService
  readonly providerLoader: ProviderLoader
  private readonly queryPlans: QueryPlanExecutor
  private readonly speedRanker: ProviderSpeedRanker
  private readonly loadBalancer: LoadBalancer
}
```

**标准调用方式**：

```typescript
// Hub / Agent / 同步层唯一入口
engine.queryInstrumentData(ref, capability, opts?)

// 非标能力（最后手段）
engine.invokeCustomMethod(providerId, method, args)
```

#### DriverRegistry（三维索引）

**位置**：`packages/market-data-core/src/core/registry.ts`

```typescript
export class DriverRegistry {
  private drivers = new Map<string, RegistryProvider>()
  private capIndex = new Map<Capability, string[]>()
  private bindingIndex = new Map<BindingKey, string[]>()

  // 按 (market, assetClass, capability) 查询 Provider
  getProviders(market: Market, assetClass: AssetClass, cap: Capability): RegistryProvider[]
  
  // 负载感知的 Provider 选择
  getLoadAwareProvider(market: Market, assetClass: AssetClass, cap: Capability): RegistryProvider | null
}
```

**BindingKey 格式**：`${Market}:${AssetClass}:${Capability}`

**示例**：
- `CN:EQUITY:stock_realtime` — A 股个股实时行情
- `CN:ETF:etf_nav` — A 股 ETF 净值
- `US:EQUITY:stock_kline` — 美股 K 线
- `CRYPTO:CRYPTO_SPOT:stock_realtime` — 加密货币实时行情

#### Capability 枚举

**位置**：`packages/market-data-core/src/core/capabilities.ts`

```typescript
export enum Capability {
  STOCK_REALTIME = 'stock_realtime',
  STOCK_KLINE = 'stock_kline',
  STOCK_MONEY_FLOW = 'stock_money_flow',
  INDEX_REALTIME = 'index_realtime',
  INDEX_KLINE = 'index_kline',
  ETF_LIST = 'etf_list',
  ETF_NAV = 'etf_nav',
  ETF_HOLDINGS = 'etf_holdings',
  ETF_PROFILE = 'etf_profile',
  NEWS = 'news',
  // ... 共 56 个数据维度
}
```

#### InstrumentDataCapability（标准 API 能力）

**位置**：`packages/a-stock-layer/src/core/instrument-query.ts`

```typescript
export type InstrumentDataCapability =
  | 'realtime' | 'kline' | 'snapshot' | 'profile' | 'financials'
  | 'stock_list' | 'instrument_search' | 'sector_list'
  | 'etf_list' | 'etf_profile' | 'etf_nav' | 'etf_holdings' | 'etf_snapshot'
  | 'dividend' | 'news' | 'notices' | 'shareholders' | 'money_flow' | 'technical_analysis'
```

### 4.3 查询计划路由

**位置**：`packages/a-stock-layer/src/core/instrument-query.ts`

```typescript
export type InstrumentQueryPlan =
  | { kind: 'registry'; market: Market; assetClass: AssetClass; capability: Capability; method: string; ... }
  | { kind: 'composite_snapshot'; market: Market; symbol: string; ... }
  | { kind: 'cn_realtime'; symbol: string; exchange?: string; }
  | { kind: 'cn_kline'; symbol: string; count: number; period?: string; ... }
```

**路由规则**：
- `registry`：标准 Registry 路由（US/HK/JP/KR 等）
- `cn_realtime`：A 股实时行情专用通道（新浪/东财批量接口）
- `cn_kline`：A 股 K 线专用通道（BaoStock/自在量化/东财）
- `composite_snapshot`：跨市场复合快照

### 4.4 查询执行策略

**位置**：`packages/a-stock-layer/src/core/query-plan.ts`

```typescript
export type QueryPlanStrategy = 'sequential' | 'merge' | 'race'

// sequential: 按优先级依次尝试，首个成功即返回（适用于单标的查询）
// merge: 多个 Provider 并行/串行合并结果，去重后返回（适用于批量实时行情）
// race: 多个 Provider 竞速，最快返回者胜出（预留）
```

### 4.5 缓存层

**位置**：`packages/a-stock-layer/src/core/cache.ts`

- 内存缓存，按 `CACHE_TYPE` 分类（如 `stock_realtime`、`stock_kline`）
- TTL 按能力类型不同（实时行情短、K 线长）
- 关注列表标的有独立缓存策略

### 4.6 负载均衡与熔断

- **LoadBalancer**：按 Provider 并发限制路由请求
- **ProviderSpeedRanker**：根据历史响应时间排名 Provider
- **FreeProviderThrottle**：免费源限流保护
- **ProviderHealth**：健康检查与熔断

---

## 5. Provider 机制

### 5.1 Provider 合规模型

每个 Provider 必须满足：

1. **manifest.ts**：`capabilities` 与 `bindingsFor(p, maxConcurrent)` 一致
2. **标准方法名**：与 Engine `queryScoped` 调用的 `method` 字符串一致
3. **多市场**：同一 Driver 可为 CN/US/HK 分别生成 binding
4. **ETF/个股/指数**：用 `cnEquityEtfIndex` / `cnEtfBindings` / `cnIndexBindings` 分拆 assetClass
5. **自定义方法**：`custom-method-docs.ts` + `core/custom-methods.ts` 登记

### 5.2 Provider 结构

```
packages/a-stock-layer/src/providers/
├── common/
│   ├── base.ts              # BaseDriver 抽象类
│   ├── permission-denial.ts # 权限拒绝处理
│   └── provider-aliases.ts  # Provider 别名
├── tushare/                 # Tushare Provider
│   ├── manifest.ts
│   ├── index.ts
│   ├── api/
│   └── normalize/
├── tencent/                 # 腾讯 Provider
│   ├── manifest.ts
│   ├── custom-method-docs.ts
│   ├── markets/
│   └── api/
├── sinafinance/             # 新浪 Provider
├── binance/                 # Binance Provider
├── okx/                     # OKX Provider
├── baostock/                # BaoStock Provider
├── zzshare/                 # 自在量化 Provider
├── tickflow/                # TickFlow Provider
├── tonghuashun/             # 同花顺 Provider
├── stockindex/              # 股票指数 Provider
├── akshare/                 # AkShare Provider（纯自定义）
├── catalog.ts               # Provider 目录服务
├── config-store.ts          # Provider 配置存储
├── installer.ts             # Provider 安装器
├── loader.ts                # Provider 加载器
├── register.ts              # Provider 注册表
└── manifests.ts             # Provider 清单
```

### 5.3 BaseDriver 抽象

**位置**：`packages/a-stock-layer/src/providers/common/base.ts`

```typescript
export abstract class BaseDriver {
  abstract get name(): string
  abstract get priority(): number
  abstract capabilities(): Capability[]
  
  readonly selfThrottled?: boolean    // 驱动内部限流
  readonly maxConcurrent?: number     // 最大并发数

  bindings(): ProviderBinding[]      // 默认 CN/EQUITY
  
  // 可选标准方法
  realtime?(code: string): Promise<unknown[] | null>
  kline?(code: string, period?: string, start?: string, end?: string): Promise<unknown[] | null>
  profile?(code: string): Promise<unknown[] | null>
  financials?(code: string, reportDate?: string): Promise<unknown[] | null>
  news?(code: string, page?: number, pageSize?: number): Promise<unknown[] | null>
  // ... 更多标准方法
}
```

### 5.4 Binding 模板

```typescript
// CN 个股 + ETF + 指数
bindingsFor: (p, mc) => cnEquityEtfIndex(EQUITY_CAPS, INDEX_CAPS, p, ETF_CAPS, mc)

// 跨市场（StockIndex / TickFlow）
bindingsFor: (p, mc) => [
  ...usEquityBindings(CAPS, p, mc),
  ...cnEquityEtfIndex(...),
  ...regionalEquityBindings('HK', CAPS, p, mc),
]

// 纯 Crypto
bindingsFor: (p, mc) => cryptoSpotBindings(CAPS, p, mc)

// 纯自定义（AkShare）
capabilities: []
bindingsFor: () => []
```

### 5.5 内置 Provider 审计

| Provider | 多市场 | ETF 分拆 | 标准 API | 自定义 | 结论 |
|----------|--------|----------|----------|--------|------|
| stockindex | ✅ | 仅 ETF_LIST | ✅ | 板块/行业扩展 | 合规 |
| tickflow | ✅ | ✅ | ✅ | 少量 custom | 标杆 |
| baostock | CN | ✅ | ✅ | custom | 合规 |
| sinafinance | CN | ✅ | ✅ | F10 深度 custom | 合规 |
| tencent | ✅ | ✅ | ✅ | HK/US 深度 custom | 合规 |
| tushare | CN | 弱 | ✅ | 无 | 合规 |
| zzshare | CN | ✅ | ✅ | custom | 合规 |
| tonghuashun | CN | ❌ | ✅ | 无 | 合规 |
| binance / okx | CRYPTO | N/A | ✅ | 无 | 合规 |
| akshare | 另类数据 | N/A | 无 | 216+ custom | 自定义专用 |

### 5.6 自定义方法文档标准

**三层文档（缺一不可）**：

| 层级 | 文件 | 要求 |
|------|------|------|
| 注册表 | `{provider}/custom-method-docs.ts` | 每个方法一条 `CustomMethodApiDoc` |
| 挂载层 | `{provider}/markets/*/ext.ts` | 每个 `p.method = …` 前有完整 JSDoc |
| Fetch 层 | `{provider}/api/*.ts` | 每个对外 `fetch*` 含 `@sourceUrl`、入参、返回结构 |

**必填字段**：

```typescript
/**
 * 功能摘要
 * @sourceUrl https://proxy.example.com/path?code={symbol}
 * @pageUrl https://product.example.com/page
 * @param code 6 位 A 股代码（必填）
 * @returns FooRow[]；无数据时 null
 * @usage engine.invokeCustomMethod("tencent", "tencentFoo", ["600519"])
 * @remarks Referer 要求、分页、延迟等维护要点
 * @example {"provider":"tencent","method":"tencentFoo","args":["600519"]}
 */
```

---

## 6. 模块化开发规范

### 6.1 新增 Provider 流程

1. **创建 Provider 目录**：`packages/a-stock-layer/src/providers/{name}/`
2. **编写 manifest.ts**：声明 capabilities、bindings、settings
3. **实现 BaseDriver**：继承 `BaseDriver`，实现标准方法
4. **注册到 register.ts**：`registerAllDrivers` 中添加
5. **添加测试连接**：`loader.ts` 中注册 `testConnection` hook
6. **编写自定义方法文档**（如有）：`custom-method-docs.ts`
7. **更新 AGENTS.md**：在 Provider 列表中添加

### 6.2 新增 Hub Feature 流程

1. **在 hub.ts 增加 case**：`research-hub/src/hub.ts`
2. **映射到 InstrumentDataCapability**：或登记自定义方法
3. **暴露 REST**（如需）：`apps/server/src/`
4. **注册 Agent tool**（如需）：`packages/agent/src/tools.ts`
5. **更新文档**：`docs/API.md`

### 6.3 新增因子流程

1. **在 factors/ 添加实现**：`packages/stock-eval/src/factors/`
2. **注册到因子表**：`packages/stock-eval/src/factor-registry.ts`
3. **添加测试**：`packages/stock-eval/tests/`
4. **更新评分卡**（如需）：`packages/stock-eval/src/scorecards/`

### 6.4 新增 UI 组件流程

1. **设计前必读**：`docs/UI-DESIGN-SYSTEM.md`、`docs/UI-LAYOUT.md`
2. **沿用设计语言**：React + Fluent UI v9 + 项目 tokens
3. **优先组合现有组件**：`OpptrixButton`、`OpptrixField`、`OpptrixDialogAlert` 等
4. **运行 `npm run check:ui`**：三项全 0 才算完成

### 6.5 代码风格

- **TypeScript**：与邻近文件保持一致；优先 `async/await`
- **React**：函数组件 + hooks；样式用 Fluent `makeStyles` 或项目 mixins
- **命名**：现有代码中英混用（用户文案中文、标识符英文）
- **注释**：只解释非显而易见的业务逻辑，避免复述代码

---

## 7. UI 规范与设计系统

### 7.1 设计原则

| 原则 | 说明 |
|------|------|
| **Calm Canvas** | 大面积暖灰背景，减少视觉噪音 |
| **Card-First** | 信息以圆角卡片分组，轻阴影分层 |
| **Accent Sparingly** | 陶土橙仅用于品牌、选中态、关键 CTA |
| **Compact Clarity** | 紧凑间距，但保持 12px+ 正文可读性 |
| **Plain Language** | 按钮、提示、空状态等文案面向最终用户 |
| **Icon Consistency** | 统一 `@fluentui/react-icons` Regular 20px |

### 7.2 Color Tokens

**品牌色（Terracotta）**：

| Token | Hex | 用途 |
|-------|-----|------|
| `accent` | `#D17A5D` | Logo、主按钮、选中指示条 |
| `accentHover` | `#C4694F` | Hover |
| `accentSoft` | `#F5E8E3` | 浅底标签、AI 按钮背景 |

**中性色**：

| Token | Hex | 用途 |
|-------|-----|------|
| `canvas` | `#F5F4F0` | 页面背景 |
| `surface` | `#FFFFFF` | 卡片、侧栏内嵌块 |
| `surfaceMuted` | `#EFEEEA` | 侧栏底、Hover 底 |
| `border` | `#E8E6E1` | 分割线、卡片描边 |

**语义色**：

| Token | Hex | 用途 |
|-------|-----|------|
| `success` | `#5A9A6E` | 涨、在线 |
| `warning` | `#D4A054` | 警告 |
| `error` | `#C75B5B` | 跌、离线 |

### 7.3 Typography

字体栈：`"Segoe UI Variable", "Segoe UI", -apple-system, BlinkMacSystemFont, sans-serif`

| Level | Size | Weight | 用途 |
|-------|------|--------|------|
| Kicker | 11px | 600 | 英文/拼音分组标签 |
| H1 | 22px | 600 | 页面主标题 |
| H2 | 16px | 600 | 卡片标题 |
| Body | 13px | 400 | 正文 |
| Caption | 12px | 400 | 辅助说明 |
| Stat | 24px | 600 | 统计数字 |

### 7.4 Spacing & Radius

| Token | Value |
|-------|-------|
| `space-xs` | 4px |
| `space-sm` | 8px |
| `space-md` | 12px |
| `space-lg` | 16px |
| `space-xl` | 24px |
| `radius-sm` | 6px |
| `radius-md` | 10px |
| `radius-lg` | 14px |

### 7.5 浮层与反馈组件

**禁止**：
- `window.confirm` / `window.alert` / `window.prompt` — 一律用封装组件
- 裸 `DialogSurface` 无项目类名
- 自写 shadow / blur / 圆角

**组件选型**：

| 场景 | 用法 |
|------|------|
| 二次确认 | `OpptrixDialogAlert` 或 `useOpptrixDialogAlert().confirm()` |
| 复杂表单 Dialog | Fluent `Dialog` + `OpptrixField` / `OpptrixInput` |
| 下拉 / 锚定浮层 | `OpptrixDropdownPanel` |
| Transient 通知 | `useSettingsToast()` |
| 分段切换 | `OpptrixSegmentedControl` |

### 7.6 桌面布局

- Electron **始终 desktop 布局**（不因窗口变窄切 MobileTopBar）
- 小窗口侧栏：宽 < 侧栏 × 2.5 时**全高浮层**，白底轻毛玻璃，**无全屏遮罩**
- 最小宽度 `DESKTOP_CHAT_MIN_WIDTH`（510px）

---

## 8. 发布打包要求

### 8.1 发布模型

| 项目 | 说明 |
|------|------|
| 更新方式 | `electron-updater` 全量更新 |
| 更新源 | **Cloudflare R2**（`generic` provider） |
| 版本真源 | `apps/desktop/package.json` 的 `version` 字段 |
| Git 标签 | `desktop-v{version}`（如 `desktop-v0.6.1`） |
| CI 工作流 | `.github/workflows/release-desktop.yml` |

### 8.2 版本号规则

1. 采用语义化版本：`主版本.次版本.修订号`（如 `0.6.1`）
2. 只改 `apps/desktop/package.json` 中的 `version`
3. 标签名必须为 `desktop-v{version}`

### 8.3 各平台产物格式

**macOS**（分架构：Intel x64 与 Apple Silicon arm64）：

| 用途 | 格式 | 典型文件名 |
|------|------|------------|
| 首次安装 | `.dmg` | `Opptrix-0.6.1-MacOS-x64-Intel-CPU.dmg` |
| 自动更新 | `.zip` | `Opptrix-0.6.1-MacOS-x64-Intel-CPU.zip` |
| 更新元数据 | `.yml` | `latest-mac.yml` |

**Windows**：

| 用途 | 格式 | 典型文件名 |
|------|------|------------|
| 安装包 | NSIS `.exe` | `Opptrix-0.6.1-Windows.exe` |
| 更新元数据 | `.yml` | `latest.yml` |

**Linux**：

| 用途 | 格式 | 典型文件名 |
|------|------|------------|
| 便携运行 | AppImage | `Opptrix-0.6.1-Linux.AppImage` |
| 包管理器安装 | `.deb` | `opptrix_0.6.1_amd64.deb` |
| 更新元数据 | `.yml` | `latest-linux.yml` |

### 8.4 打包不变量

| 不变量 | 做错的症状 | 门禁 |
|--------|------------|------|
| Updater 路径不得含 `node_modules` | 「更新组件不可用」 | `stage-updater-deps` |
| 嵌套依赖须从父包目录解析 | `electron-updater dependency missing` | `audit:desktop-pack` |
| Sidecar 依赖目录为 `runtime-stage/deps/` | 安装后 sidecar 起不来 | `stage-runtime` |
| afterPack 须 `deps` → `node_modules` | `API sidecar not ready` | `after-pack-adhoc.cjs` |
| Windows 更新须自签 Authenticode | 「not signed by the application owner」 | secrets + `update-signature` |

---

## 9. 发布前打包测试

### 9.1 打包预检命令

```bash
OPPTRIX_AUDIT_STAGE_UPDATER=1 npm run audit:desktop-pack -w @opptrix/desktop
```

**检查内容**：

1. Updater 依赖可解析
2. sidecar `deps/` 改名正确
3. 内置更新根证书存在
4. workflow 校验脚本齐全
5. Windows 签名 secrets 配置

### 9.2 完整测试流程

```bash
# 1. 构建 packages
npm run build:packages

# 2. 构建前端
npm run build -w opptrix-client

# 3. 类型检查 + lint + 模式审查
npm run check:ui

# 4. 打包预检
OPPTRIX_AUDIT_STAGE_UPDATER=1 npm run audit:desktop-pack -w @opptrix/desktop

# 5. 本地冒烟（可选）
npm run build:desktop
```

### 9.3 CI 验证

CI 在 `ci.yml` / `release-desktop.yml` 中会：

1. `npm ci` → `npm run build`
2. `npm run test:ci`
3. `npm run check:ui`（如有 client-ui 改动）
4. `audit:desktop-pack`
5. 构建三端安装包
6. 上传到 Cloudflare R2 + GitHub Releases

---

## 10. 发布前完全可用审计流程

### 10.1 Phase A — 代码就绪

| # | 检查项 | 验证方式 |
|---|--------|----------|
| A1 | 待发布代码已在目标分支 | `git status` |
| A2 | client-ui 改动已通过 `check:ui` | `npm run check:ui` 退出码 0 |
| A3 | packages 改动已构建 | `npm run build:packages` 无错误 |
| A4 | 前端构建冒烟 | `npm run build -w opptrix-client` 无错误 |
| A5 | **桌面打包预检** | `OPPTRIX_AUDIT_STAGE_UPDATER=1 npm run audit:desktop-pack` 退出码 0 |

### 10.2 Phase B — 版本与文档

| # | 检查项 | 验证方式 |
|---|--------|----------|
| B1 | `apps/desktop/package.json` version 已更新 | 读文件确认 |
| B2 | `docs/releases/{version}.md` 已撰写 | 读文件确认，含 `## 新功能` + `## 修复` |
| B3 | `ONBOARDING_RELEASE_BY_VERSION` 已更新 | 读 `client-ui/src/onboarding/manifest.ts` |
| B4 | 引导激活参数正确 | 对照 `onboarding.mdc` 决策表 |

### 10.3 Phase C — 兼容性

| # | 检查项 | 验证方式 |
|---|--------|----------|
| C1 | Schema 迁移已注册（如适用） | `SCHEMA_VERSION` 与步数一致 |
| C2 | 旧数据可读 | 迁移测试通过 |
| C3 | 旧客户端可升级 | Release Notes 说明最低兼容版本 |
| C4 | 更新源不断链 | `app-update.yml` 旧版可达 |

### 10.4 Phase D — 发布

| # | 检查项 | 验证方式 |
|---|--------|----------|
| D1 | Windows 签名 secrets 已配置 | `OPPTRIX_CODE_SIGNING_P12` 存在 |
| D2 | Release Notes 预览通过 | `node scripts/assemble-release-notes.mjs {version}` |
| D3 | 用户确认后打标签 | `git tag desktop-v{version}` + `git push origin desktop-v{version}` |

### 10.5 审计自检清单

- [ ] 是否动到 DB schema、本地文件格式、API 响应或更新元数据？
- [ ] 是否有幂等迁移 + 版本/标记记录？
- [ ] 旧数据是否能在不手动干预下被新版本读取并转换？
- [ ] 旧客户端（低 1～2 个小版本）是否仍可启动或收到可理解的升级提示？
- [ ] 是否更新 `docs/` 或 Release Notes 中的最低兼容版本/手动步骤？
- [ ] Provider manifest binding 与 capabilities 一致？
- [ ] 未在 Hub/Agent 主路径绕过 `queryInstrumentData`？
- [ ] `npm run build` 通过？
- [ ] `npm run check:ui` 通过（如有 client-ui 改动）？

---

## 11. 开发工作流速查

### 11.1 日常开发

```bash
npm run dev              # API + Vite → http://127.0.0.1:5173
npm run dev:api          # 仅 API :8711
npm run dev:web          # 仅 Vite
npm run dev:desktop      # Electron + HMR
```

### 11.2 构建

```bash
npm run build            # 全量构建
npm run build:packages   # 仅 packages
npm run build:desktop    # 桌面发行包
npm run clean            # 清理各包 dist
```

### 11.3 测试

```bash
npm run test             # 编译 + 测试
npm run test:ci          # 仅测试
npm run check:ui         # typecheck + lint + audit
```

### 11.4 调试

```bash
curl http://127.0.0.1:8711/api/health
curl -X POST http://127.0.0.1:8711/api/research \
  -H 'Content-Type: application/json' \
  -d '{"feature":"stock_diagnosis","params":{"code":"600519"}}'
ELECTRON_OPEN_DEVTOOLS=1 npm run dev:desktop
```

### 11.5 常见问题

| 问题 | 解决方案 |
|------|----------|
| API 未连接 | 确认 `npm run dev` 已运行 |
| 修改 package 后行为未变 | `npm run build:packages` 并重启 server |
| 数据源限流 | Engine 会自动 Provider 回退；稍后重试 |
| 桌面 macOS「已损坏」 | `xattr -cr /Applications/Opptrix.app` 或右键打开 |

---

## 8. Electron 桌面架构与安全

### 8.1 进程模型

```
┌─────────────────────────────────────────────────────────┐
│  Electron Main Process                                  │
│  apps/desktop/electron/main.cjs                         │
│  ├─ BrowserWindow → client-ui (dev:5173 / prod: sidecar)│
│  ├─ spawn sidecar → @opptrix/server (ELECTRON_RUN_AS_NODE)│
│  ├─ Tray (系统托盘)                                      │
│  ├─ Updater (electron-updater)                          │
│  ├─ Protocol Handler (opptrix:// 深链)                   │
│  └─ Translation Service (本地 LLM)                       │
├─────────────────────────────────────────────────────────┤
│  Renderer Process (client-ui)                           │
│  ├─ preload.cjs (contextBridge)                         │
│  └─ electronAPI (IPC 通信)                               │
└─────────────────────────────────────────────────────────┘
```

### 8.2 安全加固

**位置**：`apps/desktop/electron/security.cjs`

```typescript
// 生产环境禁用 DevTools
function hardenWebContents(webContents, { isDev }) {
  if (isDev) return
  // 阻止 F12、Ctrl+Shift+I/J/C 等快捷键
  webContents.on('before-input-event', (event, input) => { ... })
  webContents.on('devtools-opened', () => webContents.closeDevTools())
}

// 安全的 WebPreferences
function mainWindowWebPreferences({ isDev, preloadPath }) {
  return {
    preload: preloadPath,
    nodeIntegration: false,      // 禁止 Node.js 集成
    contextIsolation: true,      // 启用上下文隔离
    sandbox: true,               // 启用沙箱
    devTools: isDev,
    webSecurity: true,
    allowRunningInsecureContent: false,
    enableWebSQL: false,
  }
}
```

### 8.3 IPC 通信模式

**位置**：`apps/desktop/electron/preload.cjs`

```typescript
// 通过 contextBridge 暴露安全 API
contextBridge.exposeInMainWorld('electronAPI', {
  isElectron: true,
  platform: process.platform,
  // 窗口控制
  windowMinimize: () => ipcRenderer.send('window-minimize'),
  windowMaximize: () => ipcRenderer.send('window-maximize'),
  windowClose: () => ipcRenderer.send('window-close'),
  // 文件操作
  pickExportDirectory: () => ipcRenderer.invoke('pick-export-directory'),
  writeBinaryFile: (payload) => ipcRenderer.invoke('write-binary-file', payload),
  // 更新
  appUpdateCheck: () => ipcRenderer.invoke('app-update-check'),
  appUpdateInstall: () => ipcRenderer.invoke('app-update-install'),
  // 翻译
  translationTranslateArticle: (payload) => ipcRenderer.invoke('translation-translate-article', payload),
  // 通知
  showLocalNotification: (payload) => ipcRenderer.invoke('notification-show', payload),
})
```

### 8.4 协议处理器（Deep Link）

**位置**：`apps/desktop/electron/protocol.cjs`

- 注册 `opptrix://` 协议
- 支持 macOS `open-url` 事件
- 支持 Windows/Linux `second-instance` 事件
- URL 格式：`opptrix://host/path?params`

### 8.5 系统托盘

**位置**：`apps/desktop/electron/tray.cjs`

- macOS：22px 图标，非 template image
- Windows/Linux：32px 图标
- 关闭窗口时最小化到托盘（可配置）
- 双击托盘图标显示主窗口

### 8.6 通知系统

**位置**：`apps/desktop/electron/notifications.cjs`

- 使用 Electron 原生 `Notification` API
- 支持权限请求与缓存
- Windows 设置 `appUserModelId` 以正确显示通知
- 支持点击通知聚焦主窗口

---

## 9. 弹性模式（Resilience Patterns）

### 9.1 熔断器（Circuit Breaker）

**位置**：`packages/a-stock-layer/src/core/provider-health.ts`

```
状态机：CLOSED → OPEN → HALF_OPEN → CLOSED

CLOSED（正常）：
  - 请求正常通过
  - 连续失败 ≥ 3 次 → 跳闸

OPEN（熔断）：
  - 请求短路，直接失败
  - 冷却期：min(30s × 2^连续失败次数, 最大值)
  - 冷却期结束 → HALF_OPEN

HALF_OPEN（探测）：
  - 允许 1 个探测请求
  - 成功 → CLOSED
  - 失败 → OPEN
```

**关键参数**：

| 参数 | 值 | 说明 |
|------|-----|------|
| `FAILURE_THRESHOLD` | 3 | 连续失败次数触发熔断 |
| `BASE_COOLDOWN_MS` | 30,000 | 最小冷却期 30s |
| `MAX_COOLDOWN_MS` | 300,000 | 最大冷却期 5min |
| `HALF_OPEN_MAX_ATTEMPTS` | 1 | HALF_OPEN 状态允许的探测数 |

### 9.2 速度排名器（Speed Ranker）

**位置**：`packages/a-stock-layer/src/core/speed-ranker.ts`

无启动探测。仅用真实请求样本做同优先级破平局；无样本时 Registry 按 manifest/配置优先级排序。扩展 Provider 经 UI/Hub 显式 `rescan` / `reload`，不监听目录。

```
运行时 EMA：
  - α = 0.3（新样本权重 30%）
  - avgResponseTimeMs = α × newSample + (1-α) × oldAvg

黑名单：
  - 连续失败 ≥ 3 次 → 冷却 30s
  - 冷却结束后自动解除

缓存 TTL：
  - 正常：30min
  - 全部失败：60s
```

### 9.3 负载均衡器（Load Balancer）

**位置**：`packages/a-stock-layer/src/core/load-balancer.ts`

```
路由策略：
  1. 未满负载的 provider 中，选在途最少的
  2. 全部满载时，选预计最先释放的（lastReleasedAt + avgResponseMs）
  3. 负载相同时，用测速排名做 tie-breaker
  4. 冷启动时（请求数 < 5），按测速排名轮询
```

### 9.4 免费源限流（Free Provider Throttle）

**位置**：`packages/a-stock-layer/src/core/free-provider-throttle.ts`

- 持久化冷却状态到 SQLite
- 按 provider 独立限流
- 支持分级冷却（level 0/1/2/...）
- 查询守卫：引擎和 QueryPlan 共用

### 9.5 数据校验器（Data Validator）

**位置**：`packages/a-stock-layer/src/core/data-validator.ts`

- 按 Capability 分发到专用校验器
- 字段级最低校验（非深度 Schema 校验）
- 区分"有真实数据"与"碰巧是非空数组的垃圾数据"
- 校验结果：`{ valid: boolean, reason?: string }`

---

## 10. 端口管理与进程生命周期

### 10.1 端口解析策略

**位置**：`apps/desktop/electron/resolve-ports.cjs`

```
API 端口解析：
  1. 探测首选端口（默认 8711）的 health
  2. 若 health 通 → 复用（mode: 'reuse'）
  3. 若端口占用但 health 不通 → 僵尸 sidecar → 清理
  4. 若清理后仍占用 → 自动 bump（最多 +20）
  5. 全部占用 → 抛错

Web 端口解析：
  1. 探测首选端口（默认 5173）
  2. 复用已有 Vite 开发服务器
  3. 清理残留进程
  4. 自动 bump（最大 5189）
```

### 10.2 僵尸进程清理

```typescript
// 识别 Opptrix 相关进程
function isOpptrixServerCommand(command) {
  return /apps[\\\/]+server[\\\/]+dist[\\\/]+index\.js|@opptrix[\\\/]+server/i.test(command)
}

// 清理策略：SIGTERM → 等待 4s → SIGKILL
async function tryCleanupStaleListeners(port, { aggressive }) {
  // 1. SIGTERM 优雅关闭
  // 2. 等待端口释放
  // 3. 若仍占用 → SIGKILL 强制终止
}
```

---

## 11. 本地翻译服务

### 11.1 架构

**位置**：`apps/desktop/electron/translation-service.cjs`

```
┌─────────────────────────────────────────┐
│  Translation Service (Electron Main)    │
│  ├─ Model Manager (node-llama-cpp)      │
│  ├─ Download Manager                    │
│  ├─ Cache (内存 + 磁盘)                 │
│  └─ Text Processor (分块/清洗)          │
└─────────────────────────────────────────┘
```

### 11.2 模型管理

- 支持多模型目录（`TRANSLATION_MODEL_CATALOG`）
- 按平台检测模型族（`detectModelFamily`）
- 自动下载与缓存
- 预加载机制（`preloadTranslationModel`）

### 11.3 翻译流程

1. 检测文章是否需要中文翻译
2. 分块（`splitIntoChunks`）避免超长
3. 构建翻译 prompt
4. 调用本地 LLM 生成
5. 清洗输出（`cleanTranslationOutput`）
6. 缓存结果（内存 LRU + 磁盘）

---

## 12. 测试基础设施

### 12.1 测试文件清单

**位置**：`tests/`（47 个测试文件）

| 类别 | 测试文件 | 覆盖内容 |
|------|----------|----------|
| **集成** | `integration.test.mjs` | 端到端 API 流程 |
| **冒烟** | `smoke.test.mjs` | 基础功能验证 |
| **包** | `package.test.mjs` | 包导出完整性 |
| **行情** | `instrument-*.test.mjs` | 标的路由、标准化、批量 |
| **Provider** | `provider-*.test.mjs` | 优先级、目录、排序 |
| **新闻** | `news-*.test.mjs` | 去重、分组、订阅迁移 |
| **市场** | `multi-market-*.test.mjs` | 多市场架构 |
| **加密** | `crypto-provider.test.mjs` | 加密货币 Provider |
| **限流** | `free-provider-throttle*.test.mjs` | 免费源限流 |
| **Agent** | `agent-*.test.mjs` | Agent 工具集成 |
| **组合** | `portfolio-*.test.mjs` | 组合管理 |

### 12.2 测试运行

```bash
npm run test             # 编译 + 测试
npm run test:ci          # 仅测试（CI 等价）
```

### 12.3 测试模式

- 使用临时 `OPPTRIX_DATA_DIR` 隔离测试数据
- 集成测试模拟真实 Provider 调用
- Schema 迁移测试验证跨版本兼容

---

## 13. CI/CD 流水线

### 13.1 CI 工作流

**位置**：`.github/workflows/ci.yml`

```yaml
触发条件：
  - push to main
  - pull_request to main

并发控制：
  - group: ci-${{ github.workflow }}-${{ github.ref }}
  - cancel-in-progress: true

步骤：
  1. Checkout
  2. Setup Node.js 24
  3. npm ci
  4. OPPTRIX_AUDIT_STAGE_UPDATER=1 audit:desktop-pack
  5. npm run build
  6. npm run test:ci
```

### 13.2 发布工作流

**位置**：`.github/workflows/release-desktop.yml`

- 触发：`desktop-v*` 标签推送
- 三端并行构建（macOS x64/arm64、Windows、Linux）
- 打包预检（`audit:desktop-pack`）
- 上传到 Cloudflare R2 + GitHub Releases
- Windows 签名（secrets）

### 13.3 打包审计脚本

**位置**：`apps/desktop/scripts/audit-desktop-pack.mjs`

检查内容：
- Updater 依赖可解析
- sidecar `deps/` 改名正确
- 内置更新根证书存在
- workflow 校验脚本齐全
- Windows 签名 secrets 配置

---

## 14. 配置管理与环境变量

### 14.1 核心环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `STOCK_RESEARCH_PORT` | `8711` | API 服务端口 |
| `STOCK_RESEARCH_HOST` | `127.0.0.1` | API 服务主机 |
| `WEB_PORT` | `5173` | Vite 开发服务器端口 |
| `OPPTRIX_DATA_DIR` | `~/.opptrix` | 用户数据根目录 |
| `OPPTRIX_DESKTOP` | - | 桌面模式标记 |
| `OPPTRIX_APP_VERSION` | `0.6.0` | 应用版本 |
| `TUSHARE_TOKEN` | - | Tushare API Key |
| `TICKFLOW_API_KEY` | - | TickFlow API Key |
| `ZZSHARE_API_KEY` | - | 自在量化 API Key |
| `FUYAO_TOKEN` | - | 同花顺扶摇 API Key |

### 14.2 配置文件

| 文件 | 用途 |
|------|------|
| `~/.opptrix/opptrix.db` | 主数据库（配置、会话、Provider 设置） |
| `~/.opptrix/market-data/` | 历史行情缓存与控制面（本地因子选股已停用） |
| `apps/desktop/package.json` | 桌面版本号（发版真源） |
| `client-ui/package.json` | 前端版本号 |
| `example/config/app-config.example.json` | 示例配置 |

### 14.3 Provider 配置存储

```sql
-- provider_settings 表
CREATE TABLE provider_settings (
  provider_id TEXT PRIMARY KEY,
  enabled INTEGER NOT NULL DEFAULT 1,
  priority INTEGER,
  settings TEXT,  -- JSON: API keys, 自定义配置
  updated_at TEXT NOT NULL
);
```

访问方式：
```typescript
const configStore = getProviderConfigStore()
configStore.save('tushare', { enabled: true, extra: { token: '...' } })
configStore.getRuntime('tushare')
```

---

## 附录 A：关键文件索引

### 数据层

| 文件 | 用途 |
|------|------|
| `packages/a-stock-layer/src/engine.ts` | MarketDataEngine 核心 |
| `packages/a-stock-layer/src/core/instrument-query.ts` | 标的查询计划路由 |
| `packages/a-stock-layer/src/core/query-plan.ts` | 查询执行策略 |
| `packages/a-stock-layer/src/core/schema.ts` | 数据 Schema 定义 |
| `packages/a-stock-layer/src/core/provider-health.ts` | 熔断器实现 |
| `packages/a-stock-layer/src/core/load-balancer.ts` | 负载均衡器 |
| `packages/a-stock-layer/src/core/speed-ranker.ts` | 速度排名器 |
| `packages/a-stock-layer/src/core/free-provider-throttle.ts` | 免费源限流 |
| `packages/a-stock-layer/src/core/data-validator.ts` | 数据校验器 |
| `packages/a-stock-layer/src/core/custom-methods.ts` | 自定义方法注册表 |
| `packages/a-stock-layer/src/providers/common/base.ts` | BaseDriver 抽象 |
| `packages/a-stock-layer/src/providers/loader.ts` | Provider 加载器 |
| `packages/market-data-core/src/core/registry.ts` | DriverRegistry |
| `packages/market-data-core/src/core/capabilities.ts` | Capability 枚举 |
| `packages/market-data-core/src/core/bindings.ts` | Binding 定义 |
| `packages/user-store/src/store.ts` | 用户数据存储 |
| `packages/provider-sdk/src/define-provider.ts` | Provider 定义辅助 |

### Electron 桌面

| 文件 | 用途 |
|------|------|
| `apps/desktop/electron/main.cjs` | Electron 主进程 |
| `apps/desktop/electron/security.cjs` | 安全加固 |
| `apps/desktop/electron/preload.cjs` | IPC 桥接 |
| `apps/desktop/electron/updater.cjs` | 自动更新 |
| `apps/desktop/electron/update-guard.cjs` | 更新防循环 |
| `apps/desktop/electron/protocol.cjs` | 深链协议 |
| `apps/desktop/electron/tray.cjs` | 系统托盘 |
| `apps/desktop/electron/notifications.cjs` | 通知系统 |
| `apps/desktop/electron/resolve-ports.cjs` | 端口管理 |
| `apps/desktop/electron/translation-service.cjs` | 本地翻译 |

### 前端与服务

| 文件 | 用途 |
|------|------|
| `client-ui/src/main.tsx` | 前端入口 |
| `apps/server/src/index.ts` | API 服务入口 |
| `apps/server/src/config.ts` | 服务端配置 |

## 附录 B：相关文档链接

| 文档 | 路径 |
|------|------|
| 架构说明 | `docs/ARCHITECTURE.md` |
| 数据层架构 | `docs/DATA-LAYER.md` |
| Provider 标准 API | `docs/PROVIDER-STANDARD-API.md` |
| 多市场架构 | `docs/MULTI-MARKET-ARCHITECTURE.md` |
| UI 设计系统 | `docs/UI-DESIGN-SYSTEM.md` |
| UI 布局 | `docs/UI-LAYOUT.md` |
| 桌面发布指南 | `docs/DESKTOP-RELEASE.md` |
| 开发指南 | `docs/DEVELOPMENT.md` |
| 贡献指南 | `docs/CONTRIBUTING.md` |
| Agent 指南 | `docs/AGENT-GUIDE.md` |
| API 文档 | `docs/API.md` |
