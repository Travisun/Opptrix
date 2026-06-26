# innoAStock — A股投研助手

纯 **Node.js** monorepo：多源行情数据、40 因子评估、28 机构群评、9 种 T 策略、市场报告、产业透视、组合分析与 Agent 对话。

> **Web 应用**：浏览器访问 React SPA，由 Fastify 统一提供 API 与静态资源。**不含 Electron 桌面壳**，也不依赖 Python 运行时。

## 功能概览

| 模块 | 能力 |
|------|------|
| 个股诊断 | 40 因子 · 8 评分卡 · 行业中性化 |
| 智能选股 | 多条件筛选 · 评分排序 |
| 机构群评 | 28 家机构 config-driven 综合评级 |
| 策略信号 | 9 策略 · 信号验证 · 回测报告 |
| 组合分析 | 持仓诊断 · 交易账本（买/卖记录） |
| 市场日报 | 收盘报告 · 早报 |
| 产业透视 | 产业链挖掘 · Mermaid 导图 |
| 投研写作 | 可选：数据采集 · Prompt · 微信排版 |
| Agent | LLM + 19 tools · slash 命令 |

## 架构

```
innoAStock/
├── apps/server/          Fastify API (:8711) + 生产环境静态 SPA
├── client-ui/            React + Fluent UI（Vite 开发 :5173）
└── packages/
    ├── shared/           共享类型与 Result
    ├── a-stock-layer/    13 数据源 driver + TDX + efinance
    ├── stock-eval/       因子 · 评分卡 · 筛选 · 回测
    ├── institutions/     28 机构综合评级
    ├── t-strategy/       9 策略 · verifyStrategy · 组合模型
    ├── skills/           收盘/早报 · 产业透视 · Mermaid
    ├── stock-writer/     可选：投研文章 Prompt + 微信排版
    ├── research-hub/     统一 feature dispatch
    └── agent/            LLM + 工具 + slash 命令
```

详见 [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)。

## 快速开始

**环境**：Node.js ≥ 20

```bash
git clone git@github.com:Travisun/innoAStock.git
cd innoAStock
npm install              # 仅在仓库根目录执行
npm run build            # 编译 packages + client-ui
```

### 开发模式

两个终端，或分别启动：

```bash
npm run dev              # API → http://127.0.0.1:8711
npm run dev:web          # Vite 热更新 → http://127.0.0.1:5173（/api 代理到 8711）
```

### 生产模式

```bash
npm run build
npm start                # 单端口 http://127.0.0.1:8711/（API + SPA）
```

端口可通过环境变量 `STOCK_RESEARCH_PORT` 修改（默认 `8711`）。

### Docker 部署

```bash
cp .env.example .env   # 填入 LLM_API_KEY
docker compose up -d --build
# → http://localhost:8711
```

数据持久化：`apps/server/data`（配置）、`~/.a_stock_layer`（账本/Writer）。

## 配置

| 位置 | 用途 |
|------|------|
| `apps/server/data/config.json` | LLM provider / model / API Key、默认评分卡（可被环境变量覆盖） |
| `~/.a_stock_layer/portfolio.json` | 交易账本持久化 |
| `~/.a_stock_layer/writer-config.yaml` | 微信写作配置（可选） |

在 Web UI **设置** 页或 `.env` / 环境变量中配置 LLM（`LLM_API_KEY` 优先于本地 json）。

## API 入口

| 方式 | 说明 |
|------|------|
| `POST /api/research` | `{ "feature": "...", "params": {} }` 统一调度 |
| `POST /api/chat` | Agent 对话 |
| `GET /api/health` | 健康检查 |

完整 REST 列表与 feature 枚举见 [docs/API.md](docs/API.md)。  
包级说明见 [packages/README.md](packages/README.md)。

## 文档

| 文档 | 内容 |
|------|------|
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | 分层设计、数据流、本地状态 |
| [docs/API.md](docs/API.md) | REST 端点与 Hub features |
| [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) | 开发、构建、调试、常见问题 |

## 技术栈

Node.js · TypeScript · Fastify · React · Fluent UI · Vite

## 许可证

Private — 见仓库设置。
