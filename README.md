# innoAStock — A股投研 Chat Agent

纯 **Node.js** monorepo：**对话式投研助手**，LLM + 21 个 Function Calling 工具，支持多会话、技能快捷入口与设置面板。

> **Web 应用**：浏览器访问 Vite 前端（`:5173`），API 在后台运行（`:8711`，仅内部/代理，无需直接打开）。

## 功能概览

| 能力 | 说明 |
|------|------|
| **Chat Agent** | 自然语言对话，自动调用投研工具 |
| **多会话** | 历史对话持久化，侧边栏切换/新建/删除 |
| **21 投研工具** | 个股诊断、选股、机构评级、策略信号、回测、市场报告、产业透视、组合账本等 |
| **技能面板** | 按分类展示工具与示例提问，一键填入输入框 |
| **设置** | LLM 提供商、模型、API Key、默认评分卡 |

## 架构

```
innoAStock/
├── apps/server/          Fastify API（后台 :8711，Vite 代理 /api）
├── client-ui/            React Chat UI（Vite :5173 · 多会话 · 技能面板）
└── packages/
    ├── shared/           共享类型与 Result
    ├── a-stock-layer/    13 数据源 driver + TDX + efinance
    ├── stock-eval/       因子 · 评分卡 · 筛选 · 回测
    ├── institutions/     28 机构综合评级
    ├── t-strategy/       9 策略 · verifyStrategy · 组合模型
    ├── skills/           收盘/早报 · 产业透视 · Mermaid
    ├── stock-writer/     可选：投研文章 Prompt + 微信排版
    ├── research-hub/     统一 feature dispatch
    └── agent/            LLM + 工具注册 + 多会话持久化
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

```bash
npm run dev              # 同时启动 API + Vite → 打开 http://127.0.0.1:5173
```

只需访问 **5173** 端口；`:8711` 为 API 后台，由 Vite 自动代理 `/api`。

### 生产 / 部署预览

```bash
npm run build
npm run serve            # API + Vite preview → http://127.0.0.1:5173
```

API 端口可通过 `STOCK_RESEARCH_PORT` 修改（默认 `8711`，一般无需暴露到外网）。

### Docker 部署

```bash
cp .env.example .env   # 填入 LLM_API_KEY
docker compose up -d --build
# → http://localhost:5173
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
| [docs/UI-DESIGN-SYSTEM.md](docs/UI-DESIGN-SYSTEM.md) | 设计 Token、组件规范 |
| [docs/UI-LAYOUT.md](docs/UI-LAYOUT.md) | 布局与页面模板 |
| [docs/API.md](docs/API.md) | REST 端点与 Hub features |
| [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) | 开发、构建、调试、常见问题 |

## 技术栈

Node.js · TypeScript · Fastify · React · Fluent UI · Vite

## 许可证

Private — 见仓库设置。
