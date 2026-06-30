<p align="center">
  <img src="icons/logo@256.png" alt="Opptrix" width="128" height="128" />
</p>

# Opptrix — 你的A股投研助手

[![Node.js](https://img.shields.io/badge/node-%3E%3D20-brightgreen)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.7-blue)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/License-Apache%202.0-blue.svg)](LICENSE)

**Opptrix** 是一款开源的 **你的A股投研助手**：用自然语言提问，由大模型调用 **40+ MCP 投研工具** 获取行情、因子、机构观点与策略信号，再生成结构化中文分析。支持 **浏览器 Web** 与 **Electron 桌面端**，共用同一套 React 界面与 Fastify API。

> 🤖 **协作者 / Vibe Coding**：请先阅读 **[docs/AGENT-GUIDE.md](docs/AGENT-GUIDE.md)** — 单文件说明项目用途、目录地图、架构约束与设计规范，供 Cursor / Codex 等 Agent 直接加载。

---

## 项目定位与学习用途

| 维度 | 说明 |
|------|------|
| **是什么** | 本地/自托管的投研助手：多会话聊天、右侧关注/发现/行业面板、设置里配置 LLM |
| **不是什么** | 券商交易软件、持牌投顾、自动下单或荐股系统 |
| **适合学习** | TypeScript 全栈 monorepo、LLM Function Calling + MCP、多数据源聚合、因子与回测、Fluent UI 产品设计 |
| **适合实践** | 扩展数据源 driver、新增 MCP 工具、改进聊天 UX、本地 SQLite 因子库同步策略 |

---

## 功能概览

| 能力 | 说明 |
|------|------|
| **Chat Agent** | 流式对话，自动调用投研工具，展示执行过程 |
| **多会话** | 历史对话持久化，侧栏新建/切换/删除 |
| **MCP 投研工具** | 个股诊断、选股、本地因子筛选、行业透视、机构评级、策略/回测、市场报告、组合账本等（见 `packages/agent/src/tools.ts`） |
| **右侧投研面板** | 关注列表、发现策略、行业、个股决策卡、组合 |
| **本地因子库** | `market-data` 包：SQLite 同步、全市场筛选、决策雷达 |
| **快捷任务 & @ 引用** | 输入框快捷任务目录、`@` 关注列表股票标签 |
| **设置** | LLM 提供商/模型/API Key、市场数据同步、发现策略等 |

---

## 架构一览

```
┌─────────────────────────────────────────────────────────────┐
│  client-ui (React + Fluent UI + Vite)                       │
│  Chat · 右侧面板 · 设置 · Electron 桌面 chrome               │
└──────────────────────────┬──────────────────────────────────┘
                           │ /api/*  (dev: Vite proxy → :8711)
┌──────────────────────────▼──────────────────────────────────┐
│  apps/server (Fastify)                                      │
│  REST · Chat SSE · 配置 · 静态 SPA                           │
└──────────────────────────┬──────────────────────────────────┘
                           │
        ┌──────────────────┼──────────────────┐
        ▼                  ▼                  ▼
  packages/agent    research-hub      market-data
  LLM + MCP tools   dispatch()        SQLite 本地库
        │                  │                  │
        └──────────────────┼──────────────────┘
                           ▼
              a-stock-layer (AshareEngine)
              14 drivers · TDX · 东财/efinance …
                           │
              stock-eval · institutions · t-strategy · skills
```

```
Opptrix/
├── apps/server/          # Fastify API（:8711）
├── apps/desktop/         # Electron 桌面壳 + 打包
├── client-ui/            # React Chat UI（:5173）
└── packages/
    ├── shared/
    ├── a-stock-layer/    # 在线数据源与账本
    ├── market-data/      # 本地 SQLite 因子库
    ├── stock-eval/       # 因子 · 评分卡 · 回测
    ├── institutions/     # 机构综合评级
    ├── t-strategy/       # 策略信号与验证
    ├── skills/           # 市场报告 · 产业透视
    ├── research-hub/     # 统一 feature 调度
    └── agent/            # LLM + MCP 工具注册
```

详细分层与数据流：[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)  
桌面端说明：[docs/DESKTOP.md](docs/DESKTOP.md)

---

## 数据源说明

数据经 **`AshareEngine`** 按能力在多个 driver 间 **自动回退**（东财、efinance、TDX、腾讯、新浪、同花顺、Tushare 等，见 `packages/a-stock-layer/src/drivers/`）。

| 类型 | 来源 | 备注 |
|------|------|------|
| 实时/历史行情 | 东财、TDX、腾讯等 | 免费接口可能延迟或限流 |
| 基本面/F10 | 东财、efinance | 字段因源而异 |
| 机构研报观点 | institutions 包 + 在线数据 | 规则化评分，非原始研报全文 |
| 本地因子库 | `market-data` 同步入库 | 适合全市场筛选与雷达，需先同步 |

**请勿**将本软件数据用于生产交易决策的唯一依据；接入 Tushare 等需自行配置 Token 并遵守其许可。

---

## 快速开始

### 环境要求

- **Node.js** ≥ 20  
- **npm**（workspaces）  
- 可选：macOS/Windows/Linux（桌面打包见 DESKTOP.md）

### 安装与编译

```bash
git clone https://github.com/Travisun/Opptrix.git
cd Opptrix
npm install              # 仅在仓库根目录执行
cp .env.example .env     # 填入 LLM_API_KEY（对话功能需要）
npm run build            # 编译 packages + client-ui
```

### 开发模式（Web）

```bash
npm run dev              # 同时启动 API + Vite
# → 浏览器打开 http://127.0.0.1:5173
# API 在 :8711，由 Vite 代理 /api，无需直接访问
```

### 开发模式（桌面）

```bash
npm run dev:desktop      # Electron + API + Vite HMR
```

### 生产预览

```bash
npm run build
npm run serve            # API + Vite preview → http://127.0.0.1:5173
```

数据目录：`apps/server/data`（配置）、`~/.opptrix`（账本与本地市场数据）。

### 测试

```bash
npm run test             # build:packages + smoke tests
```

---

## 配置

| 位置 | 用途 |
|------|------|
| `.env` | `LLM_API_KEY`、`LLM_MODEL`、`STOCK_RESEARCH_PORT` 等（见 `.env.example`） |
| `apps/server/data/config.json` | UI 设置页持久化的 LLM 与默认值 |
| `~/.opptrix/portfolio.json` | 模拟交易账本 |
| 设置 → 市场数据 | 本地因子库同步与状态 |

环境变量通常 **覆盖** 本地 json 中的同名字段。

---

## API 入口

| 端点 | 说明 |
|------|------|
| `GET /api/health` | 健康检查、模型与工具数量 |
| `POST /api/chat` | Agent 对话（支持流式） |
| `POST /api/research` | `{ "feature": "...", "params": {} }` 统一调度 |

完整列表：[docs/API.md](docs/API.md)

---

## 文档索引

| 文档 | 读者 | 内容 |
|------|------|------|
| **[docs/AGENT-GUIDE.md](docs/AGENT-GUIDE.md)** | **AI Agent / 协作者** | **单文件协作手册：用途、目录、规范、禁忌** |
| [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md) | 人类贡献者 | 分支、PR、review 约定 |
| [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) | 开发者 | 分层、Hub、持久化 |
| [docs/DEVELOPMENT.md](docs/DEVELOPMENT.md) | 开发者 | 日常命令、调试、FAQ |
| [docs/API.md](docs/API.md) | 集成方 | REST 与 Hub features |
| [docs/DESKTOP.md](docs/DESKTOP.md) | 桌面开发者 | Electron 构建与发布 |
| [docs/UI-DESIGN-SYSTEM.md](docs/UI-DESIGN-SYSTEM.md) | 前端 | Token、组件、Markdown |
| [docs/UI-LAYOUT.md](docs/UI-LAYOUT.md) | 前端 | 布局与页面模板 |
| [packages/README.md](packages/README.md) | 开发者 | 各 workspace 包职责 |

---

## 参与贡献

1. Fork 仓库，从 `main` 创建分支（`feat/`、`fix/`、`docs/` …）  
2. 让 AI 助手先读 [AGENT-GUIDE.md](docs/AGENT-GUIDE.md)  
3. `npm run build && npm run test`  
4. 提交 PR，说明动机与测试方式  

细则：[docs/CONTRIBUTING.md](docs/CONTRIBUTING.md)

---

## 风险声明与免责声明

本软件及文档仅供 **学习、研究与信息整理**，不构成任何形式的投资建议或要约。

- **行情与数据**可能延迟、缺失或错误；多源回退不保证准确性与实时性。  
- **大模型输出**可能存在幻觉；请始终以工具返回的结构化数据为准。  
- **策略与因子回测**基于历史数据，过往表现不代表未来收益。  
- **合规**：使用者须自行遵守所在司法辖区的证券法规；开发者不对因使用本软件产生的任何损失负责。  
- **第三方服务**：东财、Tushare、LLM 提供商等均有独立服务条款与费用政策。

使用本软件即表示你已理解并接受上述限制。

---

## 技术栈

Node.js · TypeScript · Fastify · React · Fluent UI v9 · Vite · Electron · SQLite (better-sqlite3) · OpenAI 兼容 LLM API

---

## 许可证

本仓库采用 **[Apache License 2.0](LICENSE)** 发布（Copyright © 2025 Opptrix contributors）。  
在遵守许可证条款的前提下，可自由使用、修改与分发本软件（含商业用途）；再分发时请保留版权声明与许可证全文。

---

## 相关链接

- GitHub：[Travisun/Opptrix](https://github.com/Travisun/Opptrix)  
- Issues：[报告问题或提议功能](https://github.com/Travisun/Opptrix/issues)
