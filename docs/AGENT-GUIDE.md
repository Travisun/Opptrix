# Opptrix Agent 协作指南

> **面向对象**：使用 Cursor、Codex、Claude Code 等 AI 编程助手参与本仓库开发的协作者。  
> **用法**：在 Agent 会话开头附加一句：「请先阅读 `docs/AGENT-GUIDE.md`，再按其中规范修改代码。」  
> 人类贡献者请同时阅读 [CONTRIBUTING.md](./CONTRIBUTING.md) 与 [README.md](../README.md)。

---

## 1. 项目是什么

**Opptrix** 是一款 **全球多市场投研数据查询与信息整理工具**（非券商、非投顾、非交易终端）：

- 用户通过自然语言提问，LLM 调用 **MCP 投研工具** 拉取 **A 股、美股、港股、日股、韩股、加密货币** 等市场的行情、因子、新闻与结构化数据，再生成中文分析。
- 提供 **Web** 与 **Desktop**（Electron + 本地 API sidecar），**共用同一套 React UI 与 Fastify API**。
- 核心能力：跨市场标的搜索与筛选、个股/ETF 诊断、本地 A 股因子库、新闻订阅、行情动态、机构评级（A 股）、策略回测、关注列表与组合账本等。

**面向用户的完整说明与醒目风险提示**见根目录 [README.md](../README.md) 顶部「重要风险提示与用户须知」。

<p align="center">
  <img src="../screenshot.jpg" alt="Opptrix 主界面示意" width="880" />
</p>

<p align="center"><sub>三栏布局：左侧会话、中间 Agent 分析与工具过程、右侧个股行情与 K 线</sub></p>

### 1.1 项目边界（必须遵守）

| 允许 | 禁止 |
|------|------|
| 投研信息整理、因子计算、策略回测、学习研究 | 冒充持牌投顾、承诺收益、代客下单 |
| 调用公开/授权数据源 | 绕过付费接口、爬取违反 ToS 的数据 |
| 在 UI 中面向投资者写易懂文案 | 在界面裸露技术词（MCP、hydrate、F10）而不解释 |
| 小步增量 PR | 未经讨论的大范围重构、擅自改导航/布局模式 |
| 数据层走 `queryInstrumentData` 标准 API | Hub/UI 直连 Provider |

**免责声明**：本软件输出仅供参考与学习，**不构成投资建议**；协作者不得在文案或逻辑中暗示「保证盈利」。详见 [README.md](../README.md) 风险提示。

---

## 2. 技术栈与运行形态

| 层级 | 技术 |
|------|------|
| 语言 | TypeScript（Node.js ≥ 20） |
| 后端 | Fastify（`apps/server`） |
| 前端 | React 18 + Fluent UI v9 + Vite（`client-ui`） |
| 桌面 | Electron（`apps/desktop`），生产环境捆绑 Node sidecar |
| 包管理 | npm workspaces（**仅在仓库根目录** `npm install`） |
| Agent | OpenAI 兼容 Function Calling + 进程内 MCP Broker（`packages/agent`） |
| 本地库 | SQLite + better-sqlite3（`packages/market-data`） |

### 2.1 端口与代理

| 端口 | 用途 |
|------|------|
| `5173` | 用户访问的 Web UI（开发：Vite HMR；生产：preview） |
| `8711` | API 后台（`STOCK_RESEARCH_PORT`），开发时由 Vite 代理 `/api` |

桌面版同样加载 `http://127.0.0.1:8711`（生产）或开发时 `5173`（HMR）。

---

## 3. 仓库目录地图

```
Opptrix/
├── apps/
│   ├── server/              # Fastify API、静态 SPA、配置与会话持久化
│   └── desktop/             # Electron main/preload、打包脚本
├── client-ui/               # React 单页应用（主入口 ChatApp）
│   └── src/
│       ├── chat/            # 聊天、Composer、Markdown、侧栏会话
│       ├── market/          # 右侧投研面板：关注/发现/行业/个股/组合
│       ├── desktop/         # 窗口 chrome、浮层侧栏、Electron 布局
│       ├── pages/           # 设置页等
│       ├── components/opptrix/ # OpptrixButton、OpptrixField 等封装
│       ├── theme/           # tokens、mixins、Fluent 主题
│       ├── api/             # 前端 API 客户端
│       └── platform/        # isElectron 等运行时检测
├── packages/
│   ├── shared/
│   ├── a-stock-layer/       # MarketDataEngine、Provider、TDX
│   ├── market-data-core/ · market-data-store/
│   ├── market-data-providers-{cn,us,crypto}/
│   ├── provider-sdk/
│   ├── stock-eval/ · institutions/ · t-strategy/ · skills/
│   ├── research-hub/ · search-hub/
│   ├── news-feed/ · article-enrichment/
│   ├── local-inference/
│   ├── user-store/          # SQLite 用户数据
│   └── agent/
├── docs/                    # 架构、API、UI；入口 docs/README.md
├── tests/                   # smoke + integration tests (*.test.mjs)
├── .cursor/rules/           # Cursor 工程规则（UI 与改动原则）
├── package.json             # 根脚本：dev / build / test / dev:desktop
```

---

## 4. 架构要点

### 4.1 单一调度入口

所有投研能力经 **`ResearchHub.dispatch(feature, params)`** 路由：

- HTTP：`POST /api/research` → hub
- Agent：MCP 工具 handler 内部调用 hub 或 `MarketDataService`

新增业务能力时，**优先**在 hub 增加 `case`，再暴露 REST / 注册 MCP tool，避免三套重复实现。

### 4.2 Agent 与 MCP

```
用户消息 → AgentEngine → LLM (function calling)
                ↓
         McpToolBroker (进程内 MCP 客户端)
                ↓
         ToolRegistry (packages/agent/src/tools.ts)
                ↓
    ResearchHub / MarketDataService / AshareEngine
```

- 工具定义：`packages/agent/src/tools.ts`（MCP 投研工具 + 内置 `ask_user` 交互确认）
- 工具元数据（何时使用、调用规范）：`packages/agent/src/tool-meta.ts`
- 系统提示与引擎：`packages/agent/src/engine.ts`；用户确认规则见 `packages/shared/src/agent-prompt-guide.ts` 中 `buildUserInteractionPlaybook`
- **`ask_user`**：Agent 需用户确认分析方向/范围时调用；SSE 推送 `user_prompt` 事件，客户端在输入框上方展示选择题（末项可自由输入），用户作答经 `POST /api/sessions/:id/chat/user-prompt` 回传后继续工具链
- **行业分析**：`list_local_industries` → `get_industry_stats` / `get_local_industry_stocks` → `industry_mining`
- **市场宏观**：`get_market_regime` / `get_market_dynamics` / `get_watchlist_radar` / `get_trend_brief`
- **跨市场初选**：`screen_us_universe` / `screen_hk_universe` / `screen_crypto_universe` 或 `search_instruments`
- 本地因子筛选（`screen_local_universe` 等）与 legacy 单市场工具（`evaluate_stock` 等）已从 Agent 移除，统一用 `get_instrument_*` / `evaluate_instrument`

### 4.3 数据层

完整架构与多市场演进见 **[DATA-LAYER.md](./DATA-LAYER.md)**。

**在线层** `@opptrix/a-stock-layer`（规划更名为 `MarketDataEngine` + `DataProvider`）：

- `AshareEngine`：按 capability 在多个 Provider（现名 driver）间自动回退
- 内置 Provider：东财、efinance、TDX（mootdx/pytdx）、腾讯、新浪、同花顺、网易、雪球、股吧、巨潮、中证指数、统计局、Tushare 等（见 `drivers/register.ts`）
- 组合账本：`~/.opptrix/portfolio.json`
- **扩展方向**：A 股 ETF 行情/挖掘（Phase 1）→ 美股 → 虚拟货币；新增源 = 一个 Provider module（`providers/<id>/`）+ `bindings()` + 可选 `settings()` 自描述；配置在设置页 **基础数据 → 数据源** 按市场分组自动出现

**本地挖掘层** `@opptrix/market-data`：

- SQLite 存储 A 股行业映射、截面快照等（ETF / 多市场 schema 见 DATA-LAYER §8）
- 本地因子筛选与全量同步已停用；`market_db_status` 返回名录/截面规模（`get_local_data_status` 工具）
- 行业列表、决策雷达等只读能力仍可走本地库；选股用 `screen_stocks` 在线筛选

### 4.4 前端主界面

当前产品主入口为 **`client-ui/src/chat/ChatApp.tsx`**（非旧版多页面 Dashboard 导航为主流程）：

| 区域 | 关键文件 |
|------|----------|
| 会话侧栏 | `chat/SessionSidebar.tsx` |
| 消息列表与流式 | `chat/ChatView.tsx`, `chat/ChatMessageItem.tsx` |
| 输入框 | `chat/ChatComposer.tsx` |
| 快捷任务 | `chat/quickTaskCatalog.ts`, `chat/ComposerQuickTasks.tsx` |
| @ 股票引用 | `chat/useStockMention.ts`, `chat/ComposerStockRefTag.tsx` |
| 工具执行轨迹 | `chat/ChatProcessTrace.tsx` |
| Markdown 渲染 | `chat/MarkdownMessage.tsx`, `chat/markdownSanitize.ts` |
| 右侧投研面板 | `chat/RightPanel.tsx` → `market/*Tab.tsx` |
| 设置 | `pages/SettingsPage.tsx` |

旧版页面（`pages/Dashboard.tsx` 等）可能仍存在，**以 Chat 工作区为准**，改动前先确认是否仍被路由引用。

---

## 5. 开发流程（Agent 执行清单）

### 5.1 开始任务前

1. 阅读本文件与 `.cursor/rules/engineering-guidelines.mdc`
2. 若涉及 UI：阅读 `docs/UI-DESIGN-SYSTEM.md`、`docs/UI-LAYOUT.md`；桌面行为见 `docs/DESKTOP.md`
3. 若涉及 API：阅读 `docs/API.md`
4. 用 `rg` / 语义搜索定位现有实现，**模仿邻近代码风格**

### 5.2 本地命令

```bash
npm install                 # 仅根目录
npm run build:packages      # 修改 packages/* 后常需执行
npm run dev                 # Web：API + Vite → http://127.0.0.1:5173
npm run dev:desktop         # Electron 开发（会先 build packages）
npm run build               # 全量编译
npm run test                # build:packages + 冒烟/集成测试
npm run test:ci             # 仅跑测试（CI 在 build 之后）
npm run serve               # 生产预览
```

### 5.3 修改定位表

| 目标 | 首选文件 |
|------|----------|
| 新增 Hub feature | `packages/research-hub/src/hub.ts` |
| 新增 REST 端点 | `apps/server/src/index.ts` |
| 新增 Agent/MCP 工具 | `packages/agent/src/tools.ts` + `tool-meta.ts` |
| 新增数据源 | `packages/a-stock-layer/src/drivers/` + `register.ts`（规范见 [DATA-LAYER.md §12](./DATA-LAYER.md#12-新增-provider-检查清单)） |
| 新增因子 | `packages/stock-eval/src/factors/` |
| 本地库查询/同步 | `packages/market-data/src/` |
| 聊天 UI | `client-ui/src/chat/` |
| 右侧面板 | `client-ui/src/market/` |
| 设计 Token | `client-ui/src/theme/tokens.ts` |
| 全局样式 | `client-ui/src/styles/global.css` |
| 桌面窗口 | `apps/desktop/electron/main.cjs`, `client-ui/src/desktop/` |

### 5.4 提交前自检

- [ ] `npm run build` 通过
- [ ] `npm run test` 通过（如改动影响核心路径）
- [ ] 未提交密钥、`.env`、`apps/server/data/config.json` 中的 API Key
- [ ] UI 文案面向投资者、符合设计 Token
- [ ] 改动范围最小，无无关格式化或重构
- [ ] 若改 API/feature，已更新 `docs/API.md`（如适用）

---

## 6. UI / UX 硬性规范（摘要）

完整规范见 `docs/UI-DESIGN-SYSTEM.md` 与 `.cursor/rules/engineering-guidelines.mdc`。

### 6.1 视觉

- **Fluent UI v9** + 项目 tokens（`client-ui/src/theme/tokens.ts`）
- 暖色画布、陶土橙 `#D17A5D` 强调、卡片式 surface
- 复用 `OpptrixButton`、`OpptrixField`、`OpptrixSurface` 等封装
- 浮层菜单：毛玻璃样式，参考 `ComposerTooltipMenu.tsx` / `global.css` 中 `.opptrix-composer-tooltip-menu`

### 6.2 桌面 / Electron

- **始终 desktop 布局**，窗口变窄也不切换 `MobileTopBar`
- 窄窗：侧栏变为 **全高浮层**（`top:0; bottom:0`），白底轻毛玻璃，**无全屏遮罩**
- z-index：标题 `1100` → 浮层侧栏 `1150` → 顶栏控件 `1210`
- 最小宽度 `DESKTOP_CHAT_MIN_WIDTH`（510px），与 `apps/desktop/electron/main.cjs` 同步

### 6.3 文案

- 写给 **使用产品的投资者**，不是开发者
- 耗时操作说明等待预期；失败说明可执行动作（重试、检查网络）
- 统一术语：「关注列表」「投研分析」「多空倾向」等

### 6.4 禁止擅自做

- 引入移动版顶栏/抽屉替代桌面布局（除非 issue/PR 明确要求）
- 替换已确认的对齐、动画、侧栏宽度
- 批量改写 Agent 系统提示词（除非任务明确要求）
- 引入与设计体系冲突的 shadow、圆角、间距

---

## 7. 配置与本地数据路径

| 路径 / 变量 | 说明 |
|-------------|------|
| `apps/server/data/config.json` | LLM provider、model、API Key、默认评分卡 |
| `~/.opptrix/portfolio.json` | 交易账本 |
| `~/.opptrix/market-data/` | 本地 SQLite 与市场数据（路径以实现为准，可用 `get_project_info` 工具查询） |
| `.env` | 复制自 `.env.example`；`LLM_API_KEY` 等 |
| `STOCK_RESEARCH_PORT` | API 端口，默认 `8711` |
| `OPPTRIX_DESKTOP=1` | 桌面模式标记 |

环境变量 **优先于** `config.json` 中的同名字段（以 server 实现为准）。

---

## 8. 风险与合规提示（协作者须知）

| 风险 | 说明 |
|------|------|
| **行情延迟** | 免费数据源可能延迟、缺字段；driver 会回退但不保证实时 |
| **LLM 幻觉** | 模型可能编造数据；工具链设计为「先调工具、再回答」，勿移除校验 |
| **源站限流** | 频繁请求东财/TDX 等可能失败；本地库用于缓解 |
| **源码许可** | 本仓库采用 [Apache License 2.0](../LICENSE)；再分发或商用须遵守其条款 |
| **数据许可** | 行情等数据源各有服务条款；勿添加明显侵权的抓取逻辑 |
| **证券合规** | 界面与文档避免「荐股」「保本」等表述 |

---

## 9. 文档索引

| 文档 | 内容 |
|------|------|
| [README.md](../README.md) | 项目介绍、安装、免责、文档入口 |
| [CONTRIBUTING.md](./CONTRIBUTING.md) | 分支、PR、Code Review 约定 |
| [ARCHITECTURE.md](./ARCHITECTURE.md) | 分层、数据流、持久化 |
| [DEVELOPMENT.md](./DEVELOPMENT.md) | 日常开发、调试、常见问题 |
| [API.md](./API.md) | REST 与 Hub features |
| [DESKTOP.md](./DESKTOP.md) | Electron 开发与打包 |
| [UI-DESIGN-SYSTEM.md](./UI-DESIGN-SYSTEM.md) | 颜色、组件、Markdown |
| [UI-LAYOUT.md](./UI-LAYOUT.md) | 布局与页面模板 |
| [packages/README.md](../packages/README.md) | 各 npm 包职责 |
| `.cursor/rules/engineering-guidelines.mdc` | Cursor 自动应用的工程规则 |

---

## 10. 快速 FAQ（Agent）

**Q：改了 `packages/*` 但 API 行为没变？**  
A：运行 `npm run build:packages` 并重启 `dev:api`。

**Q：前端连不上 API？**  
A：确认根目录 `npm run dev`（同时起 API 与 Vite），不要只开 `dev:web`。

**Q：新增工具要不要改 MCP？**  
A：在 `tools.ts` 注册即可；`McpToolBroker` 会自动暴露。记得补充 `tool-meta.ts`。

**Q：健康检查里 `tools` 数量与代码不一致？**  
A：以 `tools.ts` 中注册名为准；`/api/health` 计数可能滞后，可在改工具时同步 server 健康检查逻辑。

**Q：stock-writer 包在哪？**  
A：当前 monorepo **未包含** `packages/stock-writer`；`docs/API.md` 中部分 `writer_*` feature 可能为历史文档，实现前请在 `research-hub` 中确认。

---

*最后更新：与仓库 main 分支同步维护。重大架构变更时请一并更新本文件。*
