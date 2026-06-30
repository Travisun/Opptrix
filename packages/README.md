# Packages

Opptrix monorepo 内部包说明。构建顺序由 workspace 依赖决定；根目录 `npm run build:packages` 一次编译全部。

> Agent 协作请参阅 [docs/AGENT-GUIDE.md](../docs/AGENT-GUIDE.md)。

## 投研核心（Core）

| Package | 职责 |
|---------|------|
| `@opptrix/shared` | 共享 schema、`ResearchResult`、K 线/因子类型 |
| `@opptrix/a-stock-layer` | `AshareEngine` — 14 driver、产业链 API、TDX、组合账本 |
| `@opptrix/market-data` | 本地 SQLite 因子库、同步引擎、全市场/行业本地筛选 |
| `@opptrix/stock-eval` | 40 因子、8 评分卡、筛选、回测、快照 |
| `@opptrix/institutions` | 28 机构 config-driven evaluators |
| `@opptrix/t-strategy` | 9 策略、`verifyStrategy`、报告、均值-方差权重 |
| `@opptrix/skills` | 收盘报告、早报、产业透视、Mermaid |
| `@opptrix/research-hub` | `dispatch(feature, params)` 统一入口 |
| `@opptrix/agent` | LLM provider、MCP 工具（约 43 个）、多会话 |

## 应用层

| Package | 职责 |
|---------|------|
| `@opptrix/server` | Fastify HTTP、静态 SPA、配置持久化 |
| `@opptrix/desktop` | Electron 主进程、打包与 sidecar 生命周期 |
| `opptrix-client` | React + Fluent UI（`client-ui/`） |

## Hub Features

```
stock_diagnosis          institution_rating / institution_report
screening                strategy_signal / strategy_verify / strategy_report
portfolio_analysis       portfolio_trades / portfolio_summary
industry_mining          industry_mermaid
market_report            backtest / latest_evaluation / search_stocks
```

本地数据相关能力主要通过 **MCP 工具**（`screen_local_universe`、`list_local_industries` 等）暴露，而非全部列入 Hub feature 字符串。

参数与返回值见 [docs/API.md](../docs/API.md)。

## 单包开发

```bash
npm run build -w @opptrix/stock-eval
npm run build -w @opptrix/market-data
npm run build -w @opptrix/server
```

## 构建

```bash
npm run build:packages   # packages + server
npm run build            # 含 client-ui
npm run build:desktop    # 含 Electron 发行包
npm run clean            # 清理 dist
```
