# Packages

innoAStock monorepo 内部包说明。构建顺序由 workspace 依赖决定；根目录 `npm run build:packages` 一次编译全部。

## 投研核心（Core）

| Package | 职责 |
|---------|------|
| `@ni-k/shared` | 共享 schema、`ResearchResult`、K 线/因子类型 |
| `@ni-k/a-stock-layer` | `AshareEngine` — 13 driver、产业链 API、TDX、组合账本 |
| `@ni-k/stock-eval` | 40 因子、8 评分卡、筛选、回测、快照 |
| `@ni-k/institutions` | 28 机构 config-driven evaluators |
| `@ni-k/t-strategy` | 9 策略、`verifyStrategy`、报告、均值-方差权重 |
| `@ni-k/skills` | 收盘报告、早报、产业透视、Mermaid |
| `@ni-k/research-hub` | `dispatch(feature, params)` 统一入口 |
| `@ni-k/agent` | LLM provider、19 tools、slash 命令 |

## 应用层

| Package | 职责 |
|---------|------|
| `@ni-k/server` | Fastify HTTP、静态 SPA、配置持久化 |
| `inno-a-stock-client` | React + Fluent UI（`client-ui/`） |

## 可选扩展（Optional）

| Package | 职责 |
|---------|------|
| `@ni-k/stock-writer` | 文章数据采集、Prompt、合规、微信排版/草稿箱 |

## Hub Features

```
stock_diagnosis          institution_rating / institution_report
screening                strategy_signal / strategy_verify / strategy_report
portfolio_analysis       portfolio_trades / portfolio_summary
industry_mining          industry_mermaid
market_report            backtest / latest_evaluation / search_stocks
writer_*                 (optional, stock-writer)
```

参数与返回值见 [docs/API.md](../docs/API.md)。

## 单包开发

```bash
npm run build -w @ni-k/stock-eval
npm run build -w @ni-k/server
```

## 构建

```bash
npm run build:packages   # packages + server
npm run build            # 含 client-ui
npm run clean            # 清理 dist
```
