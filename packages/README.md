# Packages

Opptrix monorepo 内部包说明。根目录 `npm run build:packages` 按 workspace 依赖顺序编译。

> Agent 协作：[docs/AGENT-GUIDE.md](../docs/AGENT-GUIDE.md) · 架构：[docs/ARCHITECTURE.md](../docs/ARCHITECTURE.md)

## 分层总览

```
shared ──► market-data-core / provider-sdk
              │
              ▼
         a-stock-layer ◄── market-data-providers-cn|us|crypto
              │
    ┌─────────┼─────────┬──────────────┐
    ▼         ▼         ▼              ▼
market-   stock-eval  institutions   news-feed
data-     t-strategy    skills         article-enrichment
store
              │
              ▼
    research-hub · search-hub · local-inference
              │
              ▼
         agent · user-store
              │
              ▼
         server (+ desktop 壳)
```

## 基础与数据

| Package | 职责 |
|---------|------|
| `@opptrix/shared` | InstrumentRef、市场注册表、Discover Profile、类型与工具函数 |
| `@opptrix/market-data-core` | 数据层核心类型与抽象 |
| `@opptrix/provider-sdk` | Provider 开发 SDK |
| `@opptrix/a-stock-layer` | **MarketDataEngine**、Provider Registry、TDX、`queryInstrumentData` |
| `@opptrix/market-data-providers-cn` | A 股等区域 Provider 实现 |
| `@opptrix/market-data-providers-us` | 美股 Provider |
| `@opptrix/market-data-providers-crypto` | 加密货币 Provider |
| `@opptrix/market-data-store` | 本地 SQLite、同步引擎、pack（`.opmd`） |
| `@opptrix/market-data` | 兼容层/门面（逐步收敛至 store + core） |

## 投研能力

| Package | 职责 |
|---------|------|
| `@opptrix/stock-eval` | 40 因子、8 评分卡、筛选、回测、快照 |
| `@opptrix/institutions` | 28 机构 config-driven evaluators |
| `@opptrix/t-strategy` | 9 策略、`verifyStrategy`、组合权重 |
| `@opptrix/skills` | 收盘报告、早报、产业透视、Mermaid |
| `@opptrix/research-hub` | `dispatch(feature, params)` 统一入口 |
| `@opptrix/search-hub` | 标的搜索 `searchInstruments` |

## 内容与推理

| Package | 职责 |
|---------|------|
| `@opptrix/news-feed` | RSS 订阅、文章列表与详情 API 支撑 |
| `@opptrix/article-enrichment` | 文章正文抓取、媒体处理 |
| `@opptrix/local-inference` | 桌面端本地翻译模型（llama.cpp 等） |

## 应用与 Agent

| Package | 职责 |
|---------|------|
| `@opptrix/agent` | LLM Provider、MCP ToolRegistry（40+ 工具）、多会话 |
| `@opptrix/user-store` | 用户 SQLite（配置、会话、关注、Provider 设置） |
| `@opptrix/server` | Fastify HTTP、Chat SSE、静态 SPA |
| `@opptrix/desktop` | Electron 主进程、sidecar 生命周期、打包 |
| `opptrix-client` | React + Fluent UI（`client-ui/`） |

## Hub Features（节选）

```
stock_diagnosis · institution_rating · screening · strategy_signal
portfolio_* · industry_mining · market_report · backtest
instrument_* · discover_* · market_regime · market_dynamics
```

本地库能力多经 **MCP 工具**（`screen_local_universe`、`get_local_data_status` 等）暴露。  
参数见 [docs/API.md](../docs/API.md)。

## 单包构建

```bash
npm run build -w @opptrix/a-stock-layer
npm run build -w @opptrix/agent
npm run build -w @opptrix/server
```

## 根脚本

```bash
npm run build:packages   # 所有 packages + server
npm run build            # + client-ui
npm run build:desktop    # Electron 发行包
npm run clean
```

## 扩展数据层

1. 读 [PROVIDER-STANDARD-API.md](../docs/PROVIDER-STANDARD-API.md)
2. 在 Provider 内实现标准方法 + `manifest.ts` binding
3. 非标能力登记 `custom-method-docs.ts`
4. **禁止** Hub/UI 直连 Provider HTTP
