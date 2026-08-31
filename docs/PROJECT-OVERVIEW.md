# Opptrix 项目纵览（架构 / 开发 / 参考）

> 面向贡献者与深度了解仓库结构的读者。最终用户请先看根目录 [README.md](../README.md) 与 [SELF-HOSTING.md](./SELF-HOSTING.md)。

## 目录

- [架构一览](#架构一览)
- [仓库目录树](#仓库目录树)
- [数据源说明](#数据源说明)
- [工作流技能（摘要）](#工作流技能摘要)
- [快速开始（开发者）](#快速开始开发者)
- [配置](#配置)
- [API 入口](#api-入口)
- [技术栈](#技术栈)
- [参考项目](#参考项目)
- [延伸阅读](#延伸阅读)

---

## 架构一览

跨市场行情与档案统一经 **标的 + 能力** 标准查询，多数据源按市场自动回退；Agent 侧为 **工具包路由 + 工作流技能 + 工作区脚本**，Hub 负责投研 feature 调度。

```
┌──────────────────────────────────────────────────────────────────┐
│  client-ui (React + Fluent UI + Vite)                             │
│  聊天 · 技能 · 新闻 · 行情动态 · 右侧面板 · 设置 · Web SPA        │
└────────────────────────────┬─────────────────────────────────────┘
                             │ /api/*  (dev: Vite proxy → :8711)
┌────────────────────────────▼─────────────────────────────────────┐
│  apps/server (Fastify)                                            │
│  REST · Chat SSE · 配置 · 会话 · 静态 SPA                          │
└────────────────────────────┬─────────────────────────────────────┘
                             │
     ┌───────────────────────┼───────────────────────┐
     ▼                       ▼                       ▼
 packages/agent      research-hub / search-hub   user-store
 LLM + 150+ 工具      dispatch / instrument_*     SQLite 用户数据
 Tool Pack 路由              │                       │
 agent-skills 激活           │                       │
 agent-workspace             │                       │
     └───────────────────────┼───────────────────────┘
                             ▼
              a-stock-layer (MarketDataEngine)
              queryInstrumentData · Provider Registry · 多市场
                             │
        ┌────────────────────┼────────────────────┐
        ▼                    ▼                    ▼
  market-data/          stock-eval · institutions   news-feed
  多市场数据包同步        t-strategy                  article-enrichment
```

更完整的分层与请求流见 [ARCHITECTURE.md](./ARCHITECTURE.md)、[ARCHITECTURE-COMPREHENSIVE.md](./ARCHITECTURE-COMPREHENSIVE.md)。

---

## 仓库目录树

```
Opptrix/
├── apps/
│   ├── server/                 # Fastify API（:8711）
│   └── desktop/                # 仓库内 Electron（维护用，非用户安装路径）
├── client-ui/                  # React SPA（:5173）
└── packages/
    ├── shared/                 # InstrumentRef、市场注册表、类型
    ├── a-stock-layer/          # 在线数据 Engine、Provider、TDX
    ├── market-data-core/       # 数据层核心抽象
    ├── market-data/            # 多市场本地数据包（.opmd）与同步
    ├── market-data-providers-{cn,us,crypto}/
    ├── provider-sdk/           # Provider 开发 SDK
    ├── stock-eval/             # 因子 · 评分卡 · 回测
    ├── institutions/           # 机构综合评级
    ├── t-strategy/             # 策略信号与验证
    ├── agent-skills/           # 工作流技能（builtin 170+）
    ├── research-hub/           # Hub feature 调度
    ├── search-hub/             # 标的搜索
    ├── news-feed/              # RSS 新闻
    ├── article-enrichment/     # 文章抓取与增强
    ├── canvas-kit/ · doc-library/
    ├── local-inference/        # 本地翻译/推理
    ├── schedule/               # 计划任务（应用内 + OS tick）
    ├── agent-workspace/        # 文件 / Shell / Python / 密钥保险箱
    ├── agent-browser/          # 网页浏览后端
    ├── user-store/             # 用户配置与会话持久化
    ├── agent/                  # LLM · 工具 · Tool Pack · 子 Agent
    └── selfhost/               # 自托管 CLI（npm: @opptrix/selfhost → 命令 opptrix）
```

各包职责摘要见 [packages/README.md](../packages/README.md)。

---

## 数据源说明

数据经 **MarketDataEngine** 按 **InstrumentRef（市场 + 标的类型 + 代码）+ Capability** 在多个 Provider 间 **按市场优先级回退**。

| 类型 | 来源 | 备注 |
|------|------|------|
| 实时/历史行情 | 分市场多 Provider | 免费接口可能延迟或限流；各市场覆盖度不同 |
| 基本面 / 档案 | 多源聚合 | 字段与深度因市场、数据源而异 |
| 机构观点 | institutions + 在线数据 | 以 **A 股** 为主；规则化评分，非研报全文 |
| 本地基础数据包 | `market-data` 同步（`.opmd`） | **A 股** 全市场 + 多市场本地列表；支持截面筛选与离线浏览 |
| 新闻 | RSS + 可选抓取 | 可按 CN / US / MACRO 等分组；支持 RSSHub 与本地/远程翻译 |

**请勿** 将本软件作为生产交易决策的 **唯一** 依据。标准查询入口见 [PROVIDER-STANDARD-API.md](./PROVIDER-STANDARD-API.md)、[DATA-LAYER.md](./DATA-LAYER.md)。

---

## 工作流技能（摘要）

界面称 **工作流技能**：可发现、可激活的投研步骤说明 + 附件。与「专家人设」「工具包」正交。

| 能力面 | 作用 |
|--------|------|
| **激活与执行** | 对话中按需激活 → 取数 / 工作区 / 脚本 → 默认可生成可预览投研页 |
| **本地扩展** | 内置技能在仓库；也可导入个人技能 |
| **数据纪律** | 走 Opptrix 本地取数与工作区；数据不足时如实标注 |

### 内置技能家族（约 170+）

| 家族 | 大致规模 | 做什么 |
|------|----------|--------|
| **核心投研** | 数十个 | 个股深潜、多角色研讨、报告审计、网页/画布交付等 |
| **Lean 量化** | 约 27（`lean-*`） | 组合、风险、执行与研究等工作流参照 Lean 方法论 |
| **量化方法库** | 约 60+ | 因子、择时、行业轮动、情绪与微观结构等 |
| **价值投资** | 约 20+ | 财务检查、报告审计、论点跟踪；总入口 **`ai-berkshire`** |

规范与映射：[AGENT-SKILLS.md](./AGENT-SKILLS.md)、[quants-playbook-skill-map.md](./quants-playbook-skill-map.md)、[ai-berkshire-skill-map.md](./ai-berkshire-skill-map.md)。

---

## 快速开始（开发者）

### 环境要求

- **Node.js** ≥ 24（Active LTS）
- **npm**（workspaces，仅在仓库根目录 `npm install`）
- 可选：**Docker**（自托管见 [SELF-HOSTING.md](./SELF-HOSTING.md)）

### 安装与编译

```bash
git clone https://github.com/Travisun/Opptrix.git
cd Opptrix
npm install
cp example/startup/env.example .env   # 填入 LLM_API_KEY
npm run build            # 编译 packages + client-ui
```

更多示例见 **[example/](../example/)**。

### 开发模式

```bash
npm run dev
# → 浏览器 http://127.0.0.1:5173（API 在 :8711，由 Vite 代理 /api）
```

### 生产预览

```bash
npm run build
npm run serve            # API :8711 + Vite preview :5173
```

### 测试

```bash
npm run test             # build:packages + 冒烟/集成测试
npm run test:ci          # 仅跑测试（CI 在 build 之后）
```

### 数据目录

| 路径 | 内容 |
|------|------|
| `~/.opptrix/` | 默认用户数据根（可用 `OPPTRIX_DATA_DIR` 覆盖） |
| `~/.opptrix/opptrix.db` | 配置、会话、关注列表等（SQLite） |
| `~/.opptrix/agent-skills/` | 用户导入的工作流技能 |
| `~/.opptrix/portfolio.json` | 模拟组合账本（A 股） |
| `.env` | 环境变量（优先于部分配置项） |

日常命令与排错见 [DEVELOPMENT.md](./DEVELOPMENT.md)。AI 协作者请先读 [AGENT-GUIDE.md](./AGENT-GUIDE.md)。

---

## 配置

| 位置 | 用途 |
|------|------|
| [example/](../example/) | 启动环境、LLM、数据源、新闻、关注列表示例 |
| `.env` / `.env.example` | `LLM_API_KEY`、`STOCK_RESEARCH_PORT` 等 |
| 应用内 **设置** | LLM、数据源、市场数据同步、新闻、翻译、自进化 |
| `~/.opptrix/tushare-config.json` | Tushare Token（也可在设置页配置） |

---

## API 入口

| 端点 | 说明 |
|------|------|
| `GET /api/health` | 健康检查与版本；自托管完整响应可含 `channel` / `releaseTag` |
| `POST /api/chat` | Agent 对话（支持流式） |
| `POST /api/research` | `{ "feature": "...", "params": {} }` Hub 调度 |
| `POST /api/instrument/*` | InstrumentRef 标准能力 |

完整列表：[API.md](./API.md)

---

## 技术栈

Node.js · TypeScript · Fastify · React · Fluent UI v9 · Vite · Docker · SQLite (better-sqlite3) · OpenAI 兼容 LLM API · Agent Skills

---

## 参考项目

Opptrix 的 Agent 工作流、投研协作与量化/价值投资技能设计，受益于下列开源项目（排名不分先后）：

| 项目 | 与 Opptrix 的关系 |
|------|-------------------|
| [deepseek-ai/deepseek-harness](https://github.com/deepseek-ai/deepseek-harness) | 自进化 / harness 思路的外部参照之一 |
| [anthropics/claude-code](https://github.com/anthropics/claude-code) | Agent 工作区、工具编排与工程化 Agent 体验的参照 |
| [tauricresearch/tradingagents](https://github.com/tauricresearch/tradingagents) | 多角色投研协作与 Agent 分工的参照 |
| [hugo2046/QuantsPlaybook](https://github.com/hugo2046/QuantsPlaybook) | 量化因子 / 择时等方法映射为内置工作流技能的来源之一 |
| [xbtlin/ai-berkshire](https://github.com/xbtlin/ai-berkshire) | 价值投资流程（含 `ai-berkshire` 技能）的灵感来源 |
| [QuantConnect/Lean](https://github.com/QuantConnect/Lean) | Lean 风格量化方法论在 `lean-*` 技能中的参照 |
| [anomalyco/opencode](https://github.com/anomalyco/opencode) | 开放式编码型 Agent / 工具工作流的参照 |

---

## 延伸阅读

| 文档 | 内容 |
|------|------|
| [README.md](../README.md) | 产品介绍、风险提示、自托管入口 |
| [SELF-HOSTING.md](./SELF-HOSTING.md) | Docker 自托管与 `opptrix` CLI |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | 分层、请求流、持久化 |
| [DATA-LAYER.md](./DATA-LAYER.md) | Provider、InstrumentRef、本地库 |
| [MULTI-MARKET-ARCHITECTURE.md](./MULTI-MARKET-ARCHITECTURE.md) | 多市场能力与边界 |
| [PROVIDER-STANDARD-API.md](./PROVIDER-STANDARD-API.md) | `queryInstrumentData` 标准 API |
| [AGENT-SKILLS.md](./AGENT-SKILLS.md) | 工作流技能规范与目录 |
| [SELF-HARNESS-PRODUCT.md](./SELF-HARNESS-PRODUCT.md) | 自进化产品设计 |
| [docs/README.md](./README.md) | **文档总索引** |
