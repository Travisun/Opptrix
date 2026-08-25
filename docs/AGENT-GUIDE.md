# Opptrix Agent 协作指南

> **面向对象**：使用 Cursor、Codex、Claude Code 等 AI 编程助手参与本仓库开发的协作者。  
> **用法**：在 Agent 会话开头附加一句：「请先阅读 `docs/AGENT-GUIDE.md`，再按其中规范修改代码。」  
> 人类贡献者请同时阅读 [CONTRIBUTING.md](./CONTRIBUTING.md) 与 [README.md](../README.md)。

---

## 1. 项目是什么

**Opptrix** 是一款 **全球多市场投研数据查询与信息整理工具**（非券商、非投顾、非交易终端）：

- 用户通过自然语言提问，LLM 调用 **127 个 MCP 投研工具** 拉取 **A 股、美股、港股、日股、韩股、加密货币** 等市场的行情、评估、新闻与结构化数据，再生成中文分析。
- 提供 **Web** 与 **Desktop**（Electron + 本地 API sidecar），**共用同一套 React UI 与 Fastify API**。
- 核心能力：跨市场标的搜索、个股/ETF 诊断、行业透视、新闻订阅、行情动态、机构评级（A 股）、策略回测、关注列表与组合账本、发现策略、计划任务、Agent 工作区与专家体系等（多市场本地数据包同步：A 股全市场 + 美股/加密货币/港股/日股/韩股本地列表）。

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
| **向后兼容与迁移**（硬性，禁止断代） | 无迁移改 DB/schema/API/更新源导致旧客户端不可用或丢数据 |

**免责声明**：本软件输出仅供参考与学习，**不构成投资建议**；协作者不得在文案或逻辑中暗示「保证盈利」。详见 [README.md](../README.md) 风险提示。

### 1.2 向后兼容与迁移（硬性）

任何 **SQLite schema**、**本地/用户数据格式**、**Hub/API 契约**、**自动更新源/安装包**、**Provider/数据层路由** 变更，必须先设计 **旧版兼容 + 幂等迁移**，**禁止断代**（旧客户端无法打开、丢数据、或永久无法更新）。

| 必须 | 禁止 |
|------|------|
| 启动时自动检测旧格式并幂等迁移（`meta` / `SCHEMA_VERSION`） | 无迁移 `DROP`/重命名导致旧数据不可读 |
| 过渡期双读旧格式；更新 URL 变更须保证旧包至少能升一次 | 让用户删 `opptrix.db` 或重装作为唯一方案 |
| 迁移失败可诊断、尽量保留原数据 | 旧安装包永久无法自动更新且无说明 |

**参考实现**：`packages/user-store`（`migrateFromLegacyFiles`）、`packages/market-data-store`（`SCHEMA_VERSION`）、`packages/news-feed`（`ensureMigrated`）、桌面更新见 [DESKTOP-RELEASE.md](./DESKTOP-RELEASE.md)。

完整规则：`.cursor/rules/backward-compatibility.mdc`。

---

## 2. 技术栈与运行形态

| 层级 | 技术 |
|------|------|
| 语言 | TypeScript（Node.js ≥ 24） |
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
│   ├── market-data-core/ · market-data/
│   ├── market-data-providers-{cn,us,crypto,jp,kr,hk}/
│   ├── provider-sdk/
│   ├── stock-eval/ · institutions/ · t-strategy/ · skills/
│   ├── research-hub/ · search-hub/
│   ├── news-feed/ · article-enrichment/
│   ├── local-inference/
│   ├── schedule/            # 计划任务服务（sidecar 进程内 timer；托盘存活时执行）
│   ├── user-store/          # SQLite 用户数据
│   ├── agent/               # LLM + 127 MCP 工具 + Tool Pack 路由
│   ├── agent-workspace/     # Agent 工作区：文件/Shell/Python/密钥保险箱
│   └── agent-browser/       # Playwright 网页浏览工具后端
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

> **Self-Harness Phase 0–3（研发）**：`@opptrix/agent` 导出 `buildWeaknessReport`、`runHarnessLab`（`promote: true|'manual'|'auto'`）、`promoteHarnessProposal` / `rollbackHarnessForModel` / `rollbackHarnessToDefault`、`getActiveHarnessVersionForModel`、`buildHarnessRouteHintAppendix` 等。弱点挖掘与实验室**不阻塞** `engine.chat`。**用户侧可用：主会话回合成功后异步离线进化（默认开、可关）**；仍可用离线 lab / `npm run harness:lab`。本地跑法仓 `formatVersion=2`（`activeByModel` 按模型分桶，跨应用升级保留）；有 active 时冷启动叠层技能正文，`route_hint_append` 挂入本轮选型卡尾注；`OPPTRIX_HARNESS_AUTO_PROMOTE=0` 或 store 关停可禁用自动晋升。设置页「自进化」走 `/api/settings/harness/*`（`auto-promote` 返回有效状态 + 可选 `envForcedOff`）。详见 [SELF-HARNESS-PRODUCT.md](./SELF-HARNESS-PRODUCT.md) §16。**禁止**对终端用户 UI 暴露 Self-Harness / Harness 等技术词。

```
用户消息 → AgentEngine → ensureFrozenSessionTools（全业务 pack + always-on，会话级一次）
                ↓
         冻结 openAiTools（稳定序）→ AggregatingToolBroker → LLM
                ↓
         resolveToolRoutePlan → 仅 turn-tail 选型卡（不改 tools 字节）
                ↓
         activate_tool_pack → already_loaded no-op（不刷新 Broker）
                ↓
         ToolRegistry / External MCP Client → ResearchHub / MarketDataService
```

  - 工具定义：`packages/agent/src/tools.ts`（MCP 投研工具）+ `document-tools.ts`（会话研报库：`list_session_documents` / `search_document` / `read_document` / `search_library`，属 `core`；支持 PDF / 文本 / Word / PPT / 图片 OCR 文本；**跨会话/全库**检索主路径 `search_library`（研报 FTS⊕向量；资讯 `source_type=news` 走 user-store 资讯 FTS，与统一搜索同源）→ 研报再 `read_document` 多跳精读——意图 `library_search`：跨研报/全库问句首选 `search_library`，勿与本会话 `search_document` 混淆）+ `canvas-tools.ts`（画布/脑图制品，属 `artifacts` pack）+ `mcp/workspace-tools.ts`（工作区）+ `mcp/browser-tools.ts`（网页）+ 内置 `ask_user` / **会话 Subagents**（`run_subagent` 等，属 `core`）/ 工具包元工具 / 外部 MCP 运维工具
- **会话 Subagents（父委派子任务）**：
  - **产品**：仅父会话创建/管理/回收；子无独立侧栏入口（`SessionStore.listActive` 过滤 `kind=subagent`）。父每次传入可定制 `role`（name/instructions/model?/…）+ `task` + `result_schema`（object），可选 `context` / `label` / `mode`。
  - **高可用创建**：`result_schema` 必须可校验（`type:"object"` + `properties` + `required`），**建议强制 `summary:string`**；`instructions` 写清禁止编造/荐股/再委派；并行用 `mode=background`，强依赖用 `foreground`；`context` 只传摘要，`label` 用短中文展示名。**创建前可 `list_subagents` 一次**核对；同 `label`/`role.name` 且 `queued|running` 时 `run_subagent` **硬 dedupe**（返回 `deduped:true`，复用 `run_id`）。失败优先 `restart_run_id`（仅 `failed|cancelled|needs_parent_action`，复用 `run_id` + `child_session_id`）。终态等自动续跑，禁止 list/get **忙等** poll；成功后 `reclaim_subagent`。系统在可用 `run_subagent` 时注入 `buildCollaborationSubagentPlaybook`。
  - **研讨编排范例**：内置技能 `multi-role-research-council`（展示名 **投资研讨团**）用父会话串联 `run_subagent`（分析师并行 → Bull/Bear 辩论 → research_chair → 风险三人）并阶段 `reclaim_subagent`，最终 `create_web`；报告署名 **Opptrix投资研讨团流程**；不引入外部图编排引擎。
  - **同权与禁区**：子与父同权使用已加载工具，但**禁止**委派工具（`run_subagent` / `list_subagents` / `cancel_subagent` / `get_subagent` / `reclaim_subagent`）与人机确认类（`ask_user` / `request_secret` / `request_session_lan_access` / `grant_session_secret`）。子缺权时经契约错误或 `needs_parent_action` 交父处理（工具结果含 `needs_parent_action`，对应 run 标为 `needs_parent_action`；background 经 ResumeBus 提醒父）；**禁止嵌套委派**。外部 REST 不可对协作任务会话 `chat` / `steer` / `user-prompt`（403）；父 Stop 会取消仍在跑的 background 子。
  - **共享 root**：父已授 LAN/密钥/工作区 grant 挂在 **root**；子 ALS 仍用 childId（spin-guard 隔离），workspace/secret/lan **lookup 用 `resolveAuthSessionId` → root**。删父先 cancel 再级联删子 runs 与 child session。
  - **终态契约**：子输出须通过 `result_schema`；失败自动再要一轮 JSON，仍失败 → `failed`。
  - **进度**：父 SSE 映射 `subagent_started` / `subagent_progress` / `subagent_done`（含 `run_id` / `label` / `status` / `child_session_id` / `mode`），以及 **`subagent_child_progress`**（子会话 `thinking` / `tool_start` / `tool_done` / `reply` 增量，带同一 `run_id` + `child_session_id`；UI 可按 run 存 `collaborationTraces`）。UI 过程条展示「协作任务」阶段与步骤；Composer 上方有协作任务条（可取消 / 终态「知道了」）。REST：`GET /api/sessions/:id/subagents`（DTO 含 `mode`、`child_session_id`）、`POST /api/sessions/:id/subagents/:runId/cancel`（`AgentEngine.listSubagents` / `cancelSubagent`）。
  - **后台终态续跑**：`mode=background` 且 `completed`/`failed`/`needs_parent_action` 时经 `SessionResumeBus`（`cause: subagent_terminal`）在父会话空闲时自动续跑通知父决定如何处理结果（可用 `get_subagent`；勿 poll）；`cancelled` 与 `foreground`（工具结果已回父）不 enqueue。父忙则沿用 bus 的 busy-defer。
  - **实现**：`packages/agent/src/subagents/`；单测 `tests/subagent-*.test.mjs`
- 工具元数据（何时使用、调用规范、`packId`）：`packages/agent/src/tool-meta.ts`
- **工具包路由（Tool Pack Router — 会话级冻结）**：
  - 包定义：`packages/shared/src/tool-packs.ts`（`TOOL_PACK_DEFS` / `TOOL_PACK_MEMBERSHIP`）
  - **会话首次进入 chat**（含 subagent child）：激活**全部**业务 pack + always-on，经 `ensureFrozenSessionTools` 构建一次 `openAiTools` 并缓存；同会话后续轮 **字节不变**
  - 意图播种 / `resolveToolRoutePlan`：仍每轮运行，但**只**影响 turn-tail「本轮工具选型卡」与档位提示，**不**裁剪或重排 tools
  - `list_tool_packs` / `activate_tool_pack`：`activate` 为 **no-op**（`already_loaded`），仅记录/文案；勿指望 mid-loop 刷新 schema
  - 稳定排序：`orderToolsStable`（remoteFirst + 名字典序）；**禁止** `preferredTools` 改变发给 LLM 的 tools 顺序
  - MCP 运维（enable/disable/install…）若必须改 schema：冷启动重建冻结集 + `prompt_cache_key` generation 后缀
  - **工作流技能（Agent Skills）**：`@opptrix/agent-skills`（meta pack）；与专家「技能专长」persona、Tool Pack **正交**。规范见 [AGENT-SKILLS.md](./AGENT-SKILLS.md)
    - **Meta 工具**：`list_agent_skills` / `activate_agent_skill` / `get_agent_skill` / `get_agent_skill_file`；写操作 `create_agent_skill` / `import_agent_skill` / `delete_agent_skill`（须 `ask_user` + `confirmed=true`）
    - **激活**：同会话最多 3 个；技能正文注入 **turn-tail**（非 stable system）；`allowed-tools` / `required-packs` 仅 bookkeeping，**不**触发 tools schema rebuild
    - **内置**（技能名用连字符，对齐工具下划线，如 `create-web` ↔ `create_web`）：`equity-deep-dive`；`multi-role-research-council`（投资研讨团 / 多空辩论，→ `fundamentals`/`market`/`news`/`instrument_analytics` + `artifacts`）；制品类 `create-canvas` / `create-web` / `create-mindmap`（→ `artifacts`）；策略 `run-backtest` / `strategy-report`（→ `strategy_extra`）；`etf-research`（→ `etf`）、`portfolio-review`（→ `portfolio`）、`news-digest`（→ `news`）、`browser-browse`（→ `browser`）、`scheduled-jobs`（→ `automation`）、`instrument-signals`（→ `instrument_analytics`）；`morning-market-brief`（v2 JSON）、`closing-market-brief`、`industry-chain`（`references/chain-knowledge.json`）、`earnings-quick-read`、`create-skill`（新建技能引导）。完整表见 [AGENT-SKILLS.md](./AGENT-SKILLS.md)
    - **意图**：早报 / 收盘 / 产业链 → 激活对应工作流技能，再用 `market` / `fundamentals` 等 pack 取数；**投资研讨团 / 多角色研讨 / 多空辩论 / 研究委员会 / TradingAgents（触发别名）** → `activate_agent_skill(multi-role-research-council)` 再 `run_subagent`；画布/网页/导图 → `create-canvas` / `create-web` / `create-mindmap`；**新建/定制技能** → 先 `activate_agent_skill(create-skill)` 再 `create_agent_skill`；**勿**再调用已删除的 `get_morning_brief` / `get_closing_report` / `industry_mining` / `industry_mermaid`；**勿**再用已更名的 `visual-report` / `web-page`
  - 引擎会话级 `AggregatingToolBroker`：**首次 chat 全量工具子集并冻结**；subagent 继承父冻结快照再 `filterToolNamesForSubagent`
  - **外部 MCP（优先级故障转移）**：
    - 配置：`packages/shared/src/mcp-servers.ts`；持久化 user-store `mcp_servers`；设置页 **MCP 服务器** / REST `/api/mcp-servers*`
    - **内置预设**：扶摇（HTTP）、东方财富妙想（HTTP）、**问财**（本机 stdio，`IWENCAI_API_KEY` → secrets；入口 `packages/agent/src/mcp/builtin/iwencai/`，工具 `query2data` / `news_search` / `announcement_search` / `report_search`（能力边界：`query2data`=问数/选股；三个 search=资讯/公告/研报），经 `ExternalMcpRegistry` 以 `iwencai__*` 命名空间注入；**不是**行情 Provider）、**网页搜索**（本机 stdio，**无密钥**，`secrets: {}`；入口 `packages/agent/src/mcp/builtin/websearch/`，工具 `web_search`，经命名空间 `websearch__web_search` 注入；**产品边界：广域公开网页检索，不是行情/公告/研报主路径**；专用工具失败后才可兜底且须声明内容可能不真实或过期；不映射问数/资讯能力；**hydrate 时无记录则默认启用**，设置里关掉后下次启动保持关闭）
    - 运行时：`packages/agent/src/mcp/external/`（`ExternalMcpRegistry` / Health / AggregatingToolBroker / **Capability Orchestrator**）；hydrate 跨 server 有界并发（默认 2，`OPPTRIX_MCP_HYDRATE_CONCURRENCY` 可调、上限 3），工具 schema 在 hydrate 时缓存，catalog 优先读缓存避免每轮 `listTools` RPC
    - **能力编排（L1→L2）**：稳定能力清单（单一事实源 `EXTERNAL_MCP_CAPABILITY_GUIDE`）：问数/选股、搜码、行情/资金流向、快照/ETF净值持仓、K线、概况、财务/股东/分红、新闻、公告、研报、宏观、成分/板块目录、指标、龙虎榜/涨跌停/连板热榜/市场全景/日历开盘/情绪市况、**筹码**。均为外部优先。L1 **先精确能力**（各家 MCP 按 `sortOrder` 轮询），再 **问数互备**（`relatedCapabilities`，同样按 `sortOrder`，不含已试过的 server+tool），最后 L2 本地。问数↔搜码、行情↔快照仍互备；除 `search_nl` 外取数能力（含筹码/榜单/日历/情绪/板块目录）均可走到问数。参数 `query`↔`keyword`/`instrument.symbol`；榜单/日历等无 query 时合成中文问句；筹码转到问数时 query 须带「筹码/获利盘」语义（裸代码不够）。catalog 除缓存工具名启发式外，合并 `capabilityBindings`（localTool → remoteTool），去重 `serverId::remoteTool`。不充分则继续下一外部，全部失败或不充分后再 L2 本地。无能力映射或 fake 未实现 `listCapabilityCandidates` 时降级旧绑定链 / `callNamespaced`。**评分/策略/回测/风格评级与关注列表/持仓本地独有**（不映射 evaluate / strategy_* / backtest / institution_rating|report / watchlist / portfolio_*）。
    - **会话隔离 `disabled_list`**：同一 `currentToolSessionId` 下硬错误（401/403/缺钥/握手失败等）追加 serverId；引擎 **hard-skip** 该 server；**仅**写入 turn-tail（`buildDisabledMcpTurnTail`），**不**从冻结 `tools[]` / `openAiTools()` 删除 namespaced 名（熔断 `health.shouldSkip` 同样只在**调用**时 skip，不从 catalog 摘工具）。429/限流短重试（可注入 wait，须尊重 AbortSignal）**不**进隔离、**不**立刻熔断。密钥或 enabled/paused 变更时 `health.reset` + 清该 server 会话隔离；`deleteSession` / 归档经 `clearLoopSessionState` 清会话隔离；删除 MCP Server 时 `clearSessionQuarantineServer`
    - 传输：stdio + Streamable HTTP；LLM 仍见稳定本地工具名；有 `capabilityBindings` 时按 `sortOrder` 试外部再本地兜底
    - **Client 与 failover 判定**（`packages/agent/src/mcp/external/connection.ts`、`packages/shared/src/mcp-servers.ts`）：
      - SDK Client 注入 permissive `jsonSchemaValidator`，不强制校验远程 `outputSchema`，避免上游 schema 漂移导致 `callTool` 直接失败
      - `parseToolResult` 优先取 `structuredContent`；若载荷为鉴权/业务错误形态（如 `{ data: null, message }`、`{ error: ... }`）则抛错，由绑定链换源或降级本地
      - `classifyMcpServerError`：429/quota → `rate_limited`；401/403/缺钥/`handshake failed`/`握手失败` → `hard_unavailable`（会话隔离）；超时/5xx/ECONN/`无法连接 MCP Server`/`Connection refused`/`ECONNRESET`/`socket hang up`/`connect failed` → `transient`（换下一外部 + L2，不得当 business 停链）；`invalid argument` → `business`。`isMcpServerFailoverError` ≡ `classify !== 'business'`（429/401 仍为 true）
      - `callExternal`：`callTool` / `parseToolResult` 失败会 `health.recordFailure` 再抛（`ensureConnected` 失败已 record，不重复）；429 走 classify 不立刻 open，需连续 transient（如 3 次 timeout）才 process 熔断
      - 降级本地时 `_mcp.degraded=true`；若 `extractMcpConfigHint` 识别出缺 Key/鉴权问题，附带 `_mcp.configHint` 供 LLM 提示用户检查设置
    - 外部独有工具：`serverId__toolName` 命名空间注入 catalog
    - **远程优先排序**：`AggregatingToolBroker.openAiTools()` 远程排前；`orderToolsStable` 保证会话内稳定序（**不用** preferred 重排）
    - **聊天提示词**：外部 MCP 按优先级轮询；精确工具优先于问数；不足再本地。行情/快照/财务/公告/研报/问数/榜单全景/日历开盘/情绪市况/板块目录/筹码等优先 namespaced MCP；本地 `search_instruments` / `get_instrument_snapshot` / 其它 `get_instrument_*` / `list_news_*` 为不足或消歧时的补充；`evaluate_instrument` / 策略 / 回测 / 风格评级与关注列表/持仓仅本地（见 `dataSourcingPolicy` + 动态已启用 MCP 目录）
    - meta 运维：`list_mcp_servers` / `enable_mcp_server` / … — 变更外部 schema 时冷启动重建冻结 tools
    - 单测：`tests/external-mcp-failover.test.mjs`、`tests/mcp-capability-orchestrator.test.mjs`、`tests/iwencai-mcp-preset.test.mjs`、`tests/websearch-mcp-preset.test.mjs`
  - **分层精排**：`resolveToolRoutePlan` 映射首选工具与研究档位；**选型卡 + 档位骨架**注入 turn-tail；tools 数组会话级冻结
  - **投研完备性闭环**：L2/L3 注入 **turn-tail**（`buildResearchTierTurnTail`），非 stable system
  - **投研 Agent Loop 增强**（`packages/agent/src/loop/`，engine 仅编排）：
    1. **只读同轮并行**：连续只读工具可 `Promise.all`；`ask_user` / workspace 写删 / shell / secret / schedule 变更 / `activate_*` / MCP 变更 / browser 会话态 / 外部 `serverId__tool` **必须串行**；tool 消息写回仍按原 `tool_calls` 顺序；每 call 各自 `runInToolSession`
    2. **Checklist + 反空转**：会话内存 checklist（`update_research_checklist`，meta pack）；Skill 激活写入占位步骤；turn-tail 注入未完成项。同 fingerprint（工具名+规范化 args）成功重复 ≥3 或失败 ≥2 → 短路返回 `spin_guard`；`ensure_python` / `prepare_fuyao_dump` 对 `preparing`/`installing`/`running`/`pending` 轮询豁免（不计入 success/failure，有硬上限防死循环；终态 ready 重复仍拦）；`list_jobs` / `list_subagents` / `get_subagent` 对进行中结果只计 pollInFlight（协作硬限 24；`list_subagents` 无参 36）；`run_subagent` / `cancel_subagent` / `reclaim_subagent` 及 `cancel_job` / 会话密钥与 LAN 控制面工具不参与 success/failure 重复拦截；连续多轮无新指纹且无 checklist/轮询进展 → 强制收口提示。`deleteSession` / 归档旁路清理
    3. **证据核对 + 分段 `tool_choice`**：`LlmChatOpts.toolChoice` 可配置，上游 400/422 对该字段 fallback（改 `auto` 或省略）。有效档位（`expert.defaultResearchTier ?? route.researchTier`，与 system 一致）为 L3 或已激活 skill，且本 turn 用过 ≥1 业务工具时，纯文本终答前追加核对轮（`tool_choice:'none'` + 核对说明）；L1/无 skill 不强制。SSE thinking 文案：「正在核对关键依据…」
    4. **Soft steer**：`POST /api/sessions/:id/chat/steer`；仅有进行中 chat 时接受；不 abort；下一 `runLlmRound` 前写入可见 user「（补充）…」；cancel 清 pending；无人值守忽略
  - 默认角色为**投研研究员**：事实与推断分层、标注时效、工具失败不编造、L3 声明数据缺口；配合 MCP 取证后按档位写结论
  - **消息正文插图（无需 pack，日常默认）**：L2/L3 有对比/趋势/占比/强弱矩阵等定量数据时，助手回复 Markdown 可用 ` ```chart ` / ` ```opptrix-chart ` 围栏（内容为 JSON，非 TSX）直接渲染 `@opptrix/canvas` 的 `Chart`（与画布同源），无需授权、无需 `artifacts`。「画个图」用围栏，勿误当成完整报告；**禁止**用 `opptrix_run` + Python（matplotlib/seaborn/plotly 等）出图再当聊天插图（用户明确要求导出图像文件到工作区时除外）。多折线/分组柱须 `data[].series`；单折线勿用每点不同 `color` 冒充多指标；类目密时建议 `showValues:false`、`showTooltip:true`。见 `buildResearchEpistemicPlaybook`。
  - **画布、脑图与网页（`artifacts` pack）**：实现 `packages/agent/src/canvas-tools.ts` / `web-tools.ts`；会话级全量冻结后已含本 pack；意图播种只影响选型卡优先提示，无需再 `activate_tool_pack`
    - **工具**：`create_canvas` / `update_canvas` / `read_canvas` / `create_mindmap` / `update_mindmap` / `read_mindmap` / `create_web` / `update_web` / `read_web` / `list_web_vendor`
    - **何时用**：投研合适时机（对比表、走势图、结构化表、一页式结论 → `create_canvas` / 正文 chart；产业链/股东/主题关系梳理、流程示意 → `create_mindmap`，**禁止**虚构独立 knowledge-graph 工具；可交互 HTML/离线图表页 → `create_web`）。完整可视化报告仅当用户明确点名报告/画布，或 Agent 自感应值得交付完整多章节图文报告时以 `create_canvas` 为主交付；**禁止**先 `ask_user` 询问是否出报告。简单一句问答不必开 canvas/mindmap/web。日常定量表达优先正文 `chart` 围栏。更新先 `read_*` 再 `update_*`。插图 ≠ 报告：「画个图」用围栏，不必 `create_canvas`
    - **画布源码约束**：`source` 为 TSX 字符串。**UI**：使用 `@opptrix/canvas` curated 组件（`Surface` / `Stack` / `H1`–`H3` / `Text` / `Stat` / `Table` / `Chart` / `Callout` / `Quote` 等）；颜色用 `useCanvasTheme` 或组件默认；禁止渐变、大阴影、装饰 emoji。**语义配色**：文字层级用 `Text` tone（primary/secondary/tertiary）；涨跌默认红涨绿跌（`danger`/`success`）；tips/风险用 `Callout`（tone + 可选 variant）；原文/口径摘录用 `Quote`（`cite` 写来源），勿用 Callout 冒充引用；行内 `Pill` / `Code` / `Link`。**版面**：默认流体宽度 `Surface`；**默认机构调研报告版式**（H1→导语→H2 分章 + 正文与图表穿插；定量对比/变化/构成/强弱矩阵优先 `Chart`（`bar`/`line`/`pie`/`heatmap`）+ 主题配色，heatmap 用 `{ label, row, col, value }`，多折线/分组柱用 `{ label, value, series }`；`Table`/`Stat` 作明细与 KPI；**Chart 勿拉满全宽**（随内容宽自适应：稀疏≈紧凑 320/230/380，密集可增至父容器上限；勿写 `width:'100%'`；图注用 `Chart caption` 与图居中对齐；Chart 已含轴/网格/数值标注，勿手写假坐标）；章节靠标题与 Stack 间距，**避免 Divider**（勿用手写 hr/边框冒充），仅用户明确要求时例外；须含介绍/说明文字；勿用 Card 墙做面板分割；仅用户明确要面板/仪表盘时例外）。**仅允许** `import … from 'react'` 与 `import { … } from '@opptrix/canvas'`（公开导出）；禁止其它依赖（含 echarts）。返回 `attachment`（`kind=canvas`）供消息内点击预览。playbook：`buildArtifactsPlaybook()`
    - **脑图**：`rootId` + `nodes[{id,parentId,label,note?}]`；返回 `kind=mindmap` 附件
    - **网页制品（`create_web`）**：单文件 `index.html` + 可选同目录相对 css/js（`files=[{path,content}]`）；脚本/样式**只许**引用 `/opptrix-vendor/<lib>/...`（可用 `list_web_vendor` 看钉版本清单），**禁止**外网 CDN。预览走右侧文件面板 iframe；相对资源 `GET /api/sessions/:id/attachments/:aid/web/*`；库静态 `GET /api/opptrix-vendor/*`（与 `/opptrix-vendor/*` 等价）。与 canvas 并存：报告型 TSX 用 canvas，浏览器 HTML+本地库用 web。
    - **意图精排**：`create_canvas` → 首选 `create_canvas`；`create_mindmap` → 首选 `create_mindmap`；`create_web` → 首选 `create_web`；勿用 `workspace_write` 代替制品工具
    - **REST**：列表/下载见会话附件 API；预览写回见 `PUT /api/sessions/:id/attachments/:attachmentId`（仅 canvas/mindmap）；网页相对资源见 `/web/*`；离线库见 `/api/opptrix-vendor`
  - **基本面事实表（`fundamentals` pack）**：`get_instrument_profile` / `get_instrument_financials` / `get_instrument_income_statement` / `get_instrument_balance_sheet` / `get_instrument_cash_flow` / `get_instrument_financial_indicators` / `get_instrument_shareholders` / `get_instrument_institution_holdings` / `get_instrument_dividend`
  - **市场（`market` pack）**：`get_market_dynamics`（全景）；`get_macro_series`（中国/国外/行业/油价宏观序列，可翻页）；专项 `get_dragon_tiger` / `get_limit_updown` / `get_market_sentiment`；同花顺独有 `get_cn_market_special`；`get_trade_calendar` / `get_market_session`；`get_instrument_money_flow`。榜单/全景/日历开盘/情绪市况与筹码均为外部 MCP 优先（L1 精确 → L1 问数互备 → L2 本地）；评分/策略/回测/风格评级与关注列表/持仓本地独有
  - **资讯与订阅（`news` pack）**：
    - **只读浏览**：`get_news_center_status` → `list_news_groups` / `list_news_sources` → `list_news_articles` → `get_news_article`；标的公告 `get_instrument_notices` → `get_notice_content`
    - **RSS 路由目录（内置 curated schema v3，三级漏斗）**：`list_rsshub_categories` → `list_rsshub_domains` → `get_rsshub_domain_routes`（返回路由+频道**拉平**后的可订阅叶子，`ask_user(allow_multiple=true)` 直接多选；禁止再先选路由再选频道；叶子过多用 `q` 缩小）→ 拼短名单基址 + `add_news_source`；`search_rsshub_routes` 仅用户已点名媒体时捷径；不依赖 GitHub docs / 全量 radar
    - **订阅 CRUD**：`validate_news_source`（添加前探测，不写入）→ `add_news_source`（`url` 必填，可选 `title`/`group_id`）；`create_news_group` / `update_news_group` / `move_news_source` 可直接执行
    - **确认纪律（与 MCP 安装同类）**：`delete_news_source`、`import_news_sources`、`delete_news_group` **须先 `ask_user`，再以相同参数 + `confirmed=true` 重试**；未 confirmed 只返回摘要、不落库。删订阅不可恢复；删分组仅把组内订阅改为未分组，不删订阅本身。导入入参：`schema_version=1` + `subscriptions`，或仅 `subscriptions` 数组（已存在 url 跳过）
    - Hub feature 映射：`news_center_status` / `news_groups_list` / `news_sources_list` / `news_articles_list` / `news_article_detail` / `news_source_add|delete|validate` / `news_sources_import` / `news_group_create|update|delete` / `news_source_move_group`（见 [API.md](./API.md) Hub Features）
  - **网页浏览（`browser` pack）**：`browser_navigate` / `browser_snapshot` / `browser_click` / `browser_type` / `browser_screenshot` / `browser_close`（Playwright 完整 Chromium，headless，无需单独 headless-shell；开发环境 `npm install` 会自动安装 Chromium，可用 `OPPTRIX_SKIP_PLAYWRIGHT_BROWSER=1` 跳过；桌面安装包已内置）
  - **计划任务（`automation` pack）**：实现 `packages/agent/src/mcp/schedule-tools.ts`，底层 `@opptrix/schedule` / user-store；REST 见 [API.md · 计划任务](./API.md#计划任务--schedule)；桌面调度（进程内 timer；reconcile 仅注销遗留 OS 注册）见 [DESKTOP.md · 计划任务与后台常驻](./DESKTOP.md#计划任务与后台常驻)
    - **工具**：`list_scheduled_jobs` / `get_scheduled_job` / `create_scheduled_job` / `update_scheduled_job` / `enable_scheduled_job` / `disable_scheduled_job` / `delete_scheduled_job` / `run_scheduled_job_now` / `list_scheduled_job_runs`
    - **激活**：非 always-on；关键词播种（`tool-pack-resolver.ts`：`计划任务|定时任务|定时分析|自动执行` 等）或 `activate_tool_pack({ pack_ids: ["automation"] })`
    - **何时用**：用户要**定时重复**跑智能体分析、提醒或受控脚本；一次性命令仍用 `opptrix_run`，勿用计划任务代替
    - **意图精排**（`tool-route-plan.ts`）：`schedule_create` → 首选 `create_scheduled_job`；`schedule_manage` → `list_scheduled_jobs` / CRUD；`schedule_run_now` → `run_scheduled_job_now`；混淆对：计划任务优先于 `opptrix_run`
    - **`create_scheduled_job` / `update_scheduled_job` 参数**：
      - `title`（必填）、`kind`：`agent_prompt` | `shell_script`
      - `schedule_kind`：`once` | `interval` | `cron`；`schedule`：`run_at` / `every_sec` / `expression`
      - `payload`：`agent_prompt` → `{ prompt, session_id? }`；`shell_script` → `{ argv, cwd? }`
      - `enabled`（可选，默认 true）
    - **安全与纪律**：
      - `kind=shell_script` **须**用户在设置中开启 `allow_shell_scripts`（`PATCH /api/schedule/settings`）；未开启时 create/update 返回错误，Agent 应引导用户先开开关，**禁止**用 `opptrix_run` 绕过定时登记
      - **无人值守执行**：`agent_prompt` 后台跑时 `chat({ unattended: true })` — 剔除 `ask_user` / `request_secret`，禁止 `waitForAnswer` 挂起；工作区覆盖/删除确认自动放行，保险箱密钥立即取消不可用；若仍命中 `ask_user` 则立即返回失败结果让模型继续
      - `delete_scheduled_job` **须** `ask_user` 后以 `confirmed=true` 重试；未确认只返回 `needs_confirmation`
      - `run_scheduled_job_now` 写入执行记录（`trigger: 'agent'`）；同一任务勿连续多次触发
      - `list_scheduled_job_runs`：`job_id` 必填，`limit` 默认 20、最大 50
    - **与调度关系**：Sidecar 进程内 timer（20s）在应用运行或托盘常驻时扫描并执行；**完全退出应用后不执行**。不再注册系统级 OS tick——Agent 只读写任务定义，不负责 OS 注册（桌面 `reconcileOsSchedule` 仅注销遗留任务）
  - **工作区与文件（`workspace` pack）**：实现 `@opptrix/agent-workspace` + `packages/agent/src/mcp/workspace-tools.ts`
    - **工具**：`workspace_glob` / `workspace_grep` / `workspace_read` / `workspace_write` / `workspace_replace_lines`（行号 edits **或** `old_string`/`new_string`/`replace_all` 精确替换）/ `workspace_apply_patch`（OpenCode `*** Begin Patch` Add/Update/Delete）/ `workspace_delete` / `download_file` / `http_fetch` / `request_folder_access` / `list_workspace_grants` / `resolve_workspace_path_uri` / `shell_platform_status` / `opptrix_run` / `code_preflight` / `python_env_status` / `ensure_python` / `list_local_data_apis` / `get_local_data_catalog` / `prepare_fuyao_dump` / `request_session_lan_access` / `request_secret` / `list_vault_secrets` / `grant_session_secret` / `revoke_session_secret` / `delete_vault_secret`
    - **消息内文件引用**：聊天 Markdown 展示工作区图片/音视频/文件时，使用协议 `opptrix-ws://{root_id}/{相对路径}`（例：`opptrix-ws://shared/charts/a.png`）。可先调 `resolve_workspace_path_uri({ root_id, path })` 得到规范 `uri` 与 `exists` / `kind_hint`（合法且已授权即返回 uri，不返回本机绝对路径）。UI 将 URI 解析为 `GET /api/sessions/:id/workspace/file` 流。**禁止**消息中写 `file://` 或绝对路径。
    - **激活**：`workspace` 为 always-on（与 core/meta 同级，每轮默认加载）；意图播种或 `activate_tool_pack` 仍可用于显式强调，但非必需。须在聊天会话中调用（依赖 session bridge）。**能力不足兜底**：内置/已匹配工具无法完成或无匹配 pack 时 → 直接用 `workspace_glob` / `workspace_grep` → `workspace_read` → `workspace_replace_lines` / `workspace_write` → `code_preflight` → `opptrix_run` 沙盒编程实现（`ensure_python` **仅失败兜底**；可先标准工具取数再沙盒计算）；标准 API 能做的禁止先上沙盒；首选已加载时勿仪式化重复 activate
    - **Python 就绪（`ensure_python` / Job 续跑）**：**非编程第一步**。编程默认把 `python`/`pip` 写进 `opptrix_run.command`（运行时解析）；仅当命令因未就绪失败、或用户明确要装/修 Python 时再 `ensure_python`。本工具**不阻塞**整轮对话。已就绪时同步返回 `status: "ready"`。未就绪时启动托管安装并**立即**返回 `status: "preparing"|"installing"`、`job_id`、`eta_seconds` / `suggested_wake_seconds`、`async_hint` / `poll_hint`。**系统通常自动挂起**（`OPPTRIX_JOB_WATCH=0` 可关），完成后同会话自动通知续跑；无任务事件时可用 `schedule_turn_wake`（禁止传 `job_id`）。**禁止 poll / sleep 查进度**。成功后写入 `prefer_opptrix_python=true`。失败不假 ready。`opptrix_run` 解析 `python`/`pip` 时若尚未就绪会快速失败并提示再 `ensure_python`，**不会**在 tool 内死等。设置页仍用 `/api/settings/python/install` 的 job+poll（行为不变）。**桌面安装包**默认内置托管 Python（`resources/python` → 用户目录种子）；解析优先序为显式路径 → 用户托管 → 包内 → 本机，托管/包内均标 `active_source=opptrix`。详见 [DESKTOP.md · 托管 Python](./DESKTOP.md)。
    - **可访问目录（唯一清单）**：不知 `root_id`、或 Agent 问「能访问哪些目录」时用 `list_workspace_grants`（**至多一次**；属 `workspace` pack，默认已加载；返回 `summary` + 脱敏后的 `grants[]`：`root_id` / `label` / `mode` / `path_hint`）。已知 root 后直接 `workspace_glob` / `workspace_grep` / `opptrix_run`，勿反复 list。探树顺序：`list_workspace_grants`（至多一次）→ `workspace_glob`，或相对 cwd 的 `opptrix_run(ls/find)`；**禁止**绝对路径 / `abs_path` 探树。读写文件内容必须用 `workspace_*`。默认项**不**返回 `~/.opptrix` 绝对路径；落在用户数据根下的额外 grant 亦脱敏为 basename +「应用内部路径」提示。用户侧界面与 Agent 摘要均称「**本对话工作区**」，**不**把 `~/.opptrix` 根目录或跨会话全局目录标为默认可写区。
    - **`get_project_info`（已脱敏，非授权清单）**：经 `buildAgentSafeProjectInfo` 剥离 `paths` / `project_root` / `agent_package`，仅保留版本/运行时等元数据 + `user_data_configured`；**勿**当作目录清单，亦**勿**向用户复述内部数据根路径。
    - **根目录布局**：容器根 `{userData}/agent-workspace/`（quota / 清理统计）；每会话默认 `root_id=default` → `agent-workspace/sessions/<sessionId>/`（读写，**会话隔离**）；**公共复用区** `root_id=shared` → `agent-workspace/shared/`（`packages/` / `data/dumps|exports|cache` / `docs/` + README；会话自动 grant rw；**`clearSession` 不删 shared**）；旧版全局根下散落文件幂等迁入 `_legacy/`。额外目录由用户在界面「授权文件夹」或 REST grant 写入本会话（`ro`/`rw`）
    - **本地数据目录**：`list_local_data_apis` → `get_local_data_catalog({ api_id })`。分类：`instrument_standard` / `agent_tools` / `hub_features`（如 Hub `search_local_instruments`，`access: hub_feature`）/ `shared_packages` / `fuyao_dump` / `workspace_fs`。system 仅挂索引句 + 编程协议短段。
    - **工具收敛（方案 1 / Cursor·OpenCode 式）**：主身份为投研 Agent（默认 core+meta+workspace always-on + 意图播种行情/财务等）；Coding 为能力层——编程意图强制补种 `workspace`（已 always-on 时幂等）；**读/改/写文本优先专用 `workspace_*`，禁止用 `opptrix_run` 的 cat/sed/echo>/heredoc 等读或改文件内容**；跑命令/装依赖走 `opptrix_run`；找搜优先 `workspace_glob` / `workspace_grep`（shell 仅后备）+ 可选 `code_preflight`。**禁止**因 coding 意图剔除行情 pack 或全面 avoid 行情工具；**禁止**用行情/财务/评估代替读写文件（可先取数再沙盒）。领域工具与文件工具勿互相替代。
    - **编程协议**：找文件/看树 → 优先 `workspace_glob`（shell ls/find 仅后备，且 cwd 相对 root）→ 扫 `shared/packages` → 缺依赖直接 `opptrix_run({ command: "pip/npm install …" })`（包源默认已放行；**勿先** `ensure_python`）→ **改已有文件** `workspace_glob` / `workspace_grep` → `workspace_read(numbered)` → `workspace_replace_lines`（行号 **或** `old_string`/`new_string`）/ `workspace_apply_patch` → `code_preflight` → `opptrix_run`；**新建**才 `workspace_write`；**建目录**用 `opptrix_run({ command: "mkdir -p …" })` 或写出文件时隐式建父目录；**禁止**小改动却整文件 `workspace_write`；**禁止**用 shell 改文件内容；文本 **UTF-8 无 BOM**，编辑保留原换行，新建默认 LF；**编程前估内存，大数据分块/流式**（大文件 `workspace_read` 行区间；重任务 `background: true`）；`path`/`cwd` 与**脚本/command 内路径**必须相对 root（禁止绝对/`abs_path`）；一次性命令仍直接 `opptrix_run`；**预计较长（下载/安装/重计算）必须 `background: true`**，依赖终态自动续跑，**禁止 poll/sleep/反复等进度**。离线大数据用 `prepare_fuyao_dump`（服务端持 Key 落盘 `shared/data/dumps` 或短时效 URL）；**禁止** Key 进沙盒；**禁止**引导 `market sync` / `dailyDump`。**禁止**用 `ask_user`「允许联网」冒充沙盒联网授权。
    - **循环预算（OpenCode 对标）**：安全轮次末步 `tool_choice: none`（或空 tools）+ 收束 turn-tail；超大工具结果（约 >2000 行 / 50KB）落盘至 **shared grant** 下 `tool-output/`（`root_id=shared`），回传 preview + 相对路径，用 `workspace_read({ root_id:"shared", path:"tool-output/…" })` 续读；**禁止**引导读取 userData 根下被 deny 的路径；启动时清理超过 7 天的落盘文件。
    - **workspace_glob / workspace_grep（限 session grant）**：
      - `workspace_glob({ glob_pattern, root_id?, path?, max_results? })` → `{ files, count, truncated? }`；默认最多 200（上限 500）
      - `workspace_grep`：`keywords`（空格分词 + `match_mode: and|or`，默认 and）**或** `pattern`（正则，可选 `case_insensitive`）；可选 `glob` / `path` / `max_hits`（默认 50，上限 100）/ `context_lines`（0–2）；跳过 NUL/二进制扩展与过大文件（约 2MB）；返回 `{ hits[{ path, line, content, match? }], count, truncated? }`
      - 意图：`workspace_grep` / `workspace_glob` / `opptrix_run` 优先于宽泛 `workspace_files`；列目录用 glob 或 `opptrix_run`(ls/find)，勿虚构已移除的 `workspace_list` / `workspace_mkdir`
    - **会话局域网（P1）**：`SessionLanAccessStore`（内存）；有效 LAN = 全局 `allow_lan_access` **\|\|** 本对话授权。`ask_user` 选 `allow_lan_session` 或 `request_session_lan_access`；`clearSession` 清除。`http_fetch` / egress 读有效 LAN。
    - **密钥保险箱**：用户级 AES-GCM（`agent_vault` + `vault.key`）；会话 allowlist。`request_secret` → `user_prompt.kind=secret`（密码框）；服务端写 vault + grant 后再 resolve；工具结果无明文。`opptrix_run.secret_refs` → SRT sentinel + stdout 脱敏。意图 `secret_vault` 首选 `request_secret`。
    - **安全边界摘要**：
      - 路径闸门：相对路径，禁止 `..` 穿越；Global Deny 优先于 grant（如 `agent-privileges`、用户库 `opptrix.db*`、`providers/`、`sessions/`、`tushare-config.json`、`watchlist.json`、`portfolio.json`、`market-data/` 等）；用户数据根本身不可作为 grant 目标暴露给 Agent
      - 写/删/覆盖：`rw` 授权；覆盖与删除需用户确认（可本对话 sticky）；默认工作区总配额约 20GB
      - `http_fetch` / `download_file`：仅 `http`/`https`；DNS 解析后禁止 localhost / 私网 / 链路本地 / 云元数据地址（SSRF）；**会话/全局已允许局域网时**可访问私网 host（具体域名仍可能需出站确认）；响应进上下文默认截断约 1.5MB；请求体 ≤32MB
      - `request_folder_access` 仅提示用户去界面授权，不直接弹系统选目录；授权 API 见 [API.md · Workspace grants](./API.md#workspace-grants会话文件夹授权)
      - **命令隔离（`opptrix_run`）**：实现 `packages/agent-workspace/src/shell/`（`SessionShellRuntime` + `ShellRunner` + `@anthropic-ai/sandbox-runtime`）。主参数为 **`command` 字符串**（真 shell）。围栏内**任意命令**，安全边界为 grant + SRT FS/网络（非二进制白名单）。Posix 下 shell 经 `resolvePosixShellPath()`（`SHELL` → darwin zsh → bash → `/bin/sh`），**不**硬编码裸 `/bin/bash`（避免 ENOENT）。`python`/`pip`/`node`/`npm`/`npx` 经能力增强改写到 active / Electron-as-node（**真 shell 亦同步到 `command_string`**，含 `--target` / `--cert`）。子进程 **`HOME`=grant 根**，**cwd=`cwdRel`**（`~` ≠ cwd；结果可含 `home_is_grant_root`）。cwd 须为已存在目录，否则结构化错误（可先 `mkdir`）。同 `configHash` **复用 SRT**；仅 `initialize`/`reset` 全局串行；`clearSession` dispose 句柄。结果含 `isolation: full|basic`；`escalate=unsandboxed` 每次人批。会话默认 `allowedDomains` 含包安装源；其它 host 仍审批。聊天 tools **仅**暴露 `opptrix_run`（勿调用已移除工具）。测网站延迟优先 `http_fetch`。**预计较长（下载/安装/重计算）必须 `background: true`**（Job 续跑，依赖终态自动续跑；禁止 poll/sleep）。意图：`workspace_shell` / `workspace_shell_install` / `workspace_shell_network` → 首选 `opptrix_run`；找文件/搜内容优先 `workspace_glob`/`workspace_grep`（shell ls/find/rg 仅后备）；**硬禁**用 shell 读/改文本文件内容；**硬禁**把绝对路径/`abs_path`/宿主绝对路径填进 path/cwd/脚本；**硬禁**用 `~/` 当相对 cwd
      - **命令运行确认**：围栏内**无**「首次运行命令」总确认。出站新域名 / `unsandboxed` 才确认；`unsandboxed` 仅 once。`shell_platform_status` 无需确认
      - **包安装与网络**：包源默认已并入会话 allowlist；直接 `opptrix_run({ command: "pip install …" })`。其它域名经 `sandboxAskCallback` / egress 确认或 `suggested_escalate`。pip 默认 `--target .opptrix-packages`；npm 禁止 `-g` 等。CA **仅**物化到工作区 `.opptrix/cacert.pem` 后注入子进程（materialize 失败不回退包内路径，避免沙盒 `CERTIFICATE_VERIFY_FAILED`）；`python`/`pip` 一律托管/包内优先于本机（有 Opptrix 托管或安装包内置则 `active_source=opptrix`）
      - **出站授权（SessionNetworkEgressStore + sandboxAskCallback）**：默认已含包源集合；永久白名单 = `OPPTRIX_SHELL_ALLOWED_DOMAINS` ∪ 设置页。未授权目标会确认。出站被拒返回 `needs_network_egress` / `suggested_escalate=network`。grant 经 SSRF（`assertEgressHostGrantable`）
      - **设置页白名单（用户可见）**：**设置 → 沙盒环境** — 「访问白名单」、「允许局域网访问」、Windows「完整隔离 / 基础隔离」
      - **DNS 策略**：系统解析可用；沙盒内自打 UDP/53 的 dig 等受围栏限制；授权对象是连接目标
      - **平台依赖（`shell_platform_status`）**：返回 `platform` / `ready` / `windows_isolation_mode` / `network_isolation_level` 等。**Windows 基础隔离**：RestrictedToken，结果 `isolation=basic`，网络限制更弱，不支持 `secret_refs`。**完整隔离**：SRT；凭据失效最多自动刷新再执行一次

#### 工作区编程、本地数据目录与扶摇 Dump

以下能力均属 **`workspace` pack**（always-on；亦可播种或 `activate_tool_pack`）；实现：`packages/agent/src/local-data-catalog.ts`、`packages/agent/src/mcp/workspace-tools.ts`、`packages/market-data/src/sync/dump-import.ts`（`prepareFuyaoDumpForAgent`）、`packages/agent-workspace/src/shared-workspace.ts`。

**渐进加载（本地数据目录）**

| 步骤 | 工具 | 说明 |
|------|------|------|
| 1 | `list_local_data_apis({ category? })` | 轻量索引：`api_id` / `category` / `title` / `summary` / `access`；可按分类过滤 |
| 2 | `get_local_data_catalog({ api_id, include_examples? })` | 按 `api_id` 取调用方式、参数、`how_to_call`、示例（默认含示例） |

- system 提示仅挂**索引句** + 编程协议短段（`buildLocalDataCatalogIndexHint` / `buildLocalProgrammingPlaybook`），**勿臆造**未通过 catalog 加载的 API 细节。
- 分类：`instrument_standard`（标准 capability / `queryInstrumentData`）/ `agent_tools` / `hub_features`（如 `hub.search_local_instruments`，`access: hub_feature`）/ `shared_packages` / `fuyao_dump` / `workspace_fs`。
- 常用 `api_id`：`cap.realtime`、`fuyao.dump`、`shared.packages`、`workspace.shared`、`workspace.default`、`hub.search_local_instruments`。

**公共资产（`root_id=shared`；用户界面称「公共资产」，路径概念仍为 shared）**

| 路径 | 用途 |
|------|------|
| `packages/<name>/` | 可复用脚本/包（须含 README） |
| `data/dumps/` | 扶摇 Parquet 等离线大数据（经 `prepare_fuyao_dump`） |
| `data/exports/` | 导出 CSV/JSON 等结果 |
| `data/cache/` | 可删中间缓存 |
| `docs/` | 公共约定；含 `package-readme-template.md` |

- 容器：`{userData}/agent-workspace/shared/`；首次访问幂等初始化目录树与根 `README.md`（文案见 `shared-workspace.ts`）。
- 会话自动 grant `rw`；**`clearSession` 不删 shared**（仅删 `sessions/<sessionId>/`）。

**编程协议（摘要）— 方案 1 / OpenCode 式：专用文件工具优先 + 真 Shell**

1. `list_local_data_apis` → `get_local_data_catalog({ api_id })` 了解能力
2. 优先 `workspace_glob` 扫 `shared/packages` → `workspace_read` 读 `packages/<name>/README.md`，能复用则复用
3. 缺依赖 / 一次性命令 → 直接 `opptrix_run({ command: "pip/npm install …" })`（包源默认已放行；`python`/`pip` 写进 command，运行时解析）；禁止先申请联网；**禁止先** `ensure_python`（仅失败或用户明确要装/修 Python 时兜底）；禁止 `ask_user` 冒充联网授权
4. **改已有文件** → `workspace_glob` / `workspace_grep` → `workspace_read(numbered)` → `workspace_replace_lines`（`edits` 或 `old_string`/`new_string`/`replace_all`）或 `workspace_apply_patch` → `code_preflight` → `opptrix_run`；**新建**用 `workspace_write`；**建目录**用 `opptrix_run({ command: "mkdir -p …" })`；**禁止**小改动却整文件 `workspace_write`；**禁止**用 shell（cat/sed/echo>/heredoc 等）读或改文件内容；可复用产物写入 `shared/packages/<name>/` + README（目的/入口/入参出参/依赖/示例/勿存密钥）；文本 **UTF-8 无 BOM**，编辑**保留原换行**（CRLF/LF），新建默认 LF，`.bat`/`.cmd`/`.ps1` 用平台换行；`path`/`cwd` 与脚本/command 内路径相对 root（禁绝对/`abs_path`）；探树：`list_workspace_grants` 至多一次 → `workspace_glob` 或相对 cwd 的 `opptrix_run(ls/find)`；一次性命令仍直接 `opptrix_run`；**预计较长（下载/安装/重计算）必须 `background: true`**，依赖终态自动续跑，**禁止 poll/sleep**
4c. **内存与大数据**：编程前先估内存；大数据优先分块/流式（逐行、生成器、`chunksize`），中间结果写工作区；大文件用 `workspace_read(start_line/end_line)`；重任务 `background: true`；**禁止**整 dump/整表一次载入或灌进对话/stdout
5. 离线大数据 → `prepare_fuyao_dump`；在线行情优先标准 Agent 工具，勿平行造数据源；第三方密钥经 `request_secret` + `opptrix_run.secret_refs`（禁止明文进沙盒）
6. 其它外网域名在 `opptrix_run` 时确认或看 `suggested_escalate`；局域网 → `request_session_lan_access` 或 `ask_user`（选项见下）

> **分工**：读/改/写文件 = 专用 `workspace_*`（优先于 shell；**禁止**用 `opptrix_run` 改文件内容）；跑命令 = `opptrix_run`；领域工具只做行情/财务/资讯/画布等特色，禁止代替文件/脚本操作。

**`prepare_fuyao_dump` — 用法与安全**

- **用途**：服务端持扶摇 Key 鉴权下载 Parquet，**不把 Key 返回给 Agent/沙盒**；Agent 侧取 dump 的**唯一主路径**（见下方废弃说明）。
- **参数**：
  - `dump_kind`（启动时必填）：`full` | `incremental` | `adjustment_factors`
  - `mode`（可选，默认 `local_path`）：`local_path`（落盘 `shared/data/dumps`）| `presigned_url`（返回短时效预签名 URL）
  - `force_refresh`（可选）：忽略缓存强制重下
  - `job_id`（可选）：轮询用；上次返回 `status: "preparing"` 时带上，可省略 `dump_kind`
- **返回（兼容说明）**：
  - **快速路径**（`presigned_url`，或 `local_path` 缓存命中）：`status: "ready"` + 原有字段（`url` 或 `relative_path` / `bytes` / `from_cache`）
  - **冷下载**（`local_path` 且需联网下载）：**立即**返回 `ok: true`、`status: "preparing"`、`job_id`、`eta_seconds` / `suggested_wake_seconds`、`async_hint` / `poll_hint`（不再阻塞 5–25 分钟）；**系统通常自动挂起**，完成后同会话自动通知续跑；必要时再调 `prepare_fuyao_dump({ job_id })`。**禁止 poll / sleep 查进度**、勿重复 `force_refresh` 另起任务
  - 就绪后 `full` / `incremental` + `local_path`：**额外**自动写 `shared/data/cache/offline-k-meta.json`（`meta_written` / `meta_warning`）
  - `adjustment_factors` / `presigned_url`：**不**写 offline-k-meta
- **沙盒侧**：用 `workspace_read` / `workspace_glob` / `opptrix_run`（`root_id=shared` + `relative_path`）或下载 `url`；**禁止**向 shell 环境注入 `API_KEY` / `TOKEN` / 扶摇凭证。
- **失败**：返回 `ok: false` + `status: "failed"` + `error` + `sandbox_hint`；勿改用 sync/dailyDump 兜底。
- **旧 Agent**：若只认同步 `ok`+`path`/`url`、忽略 `status`，冷下载时看不到路径——须按 `poll_hint` / `suggested_wake_seconds` 唤醒或用 `job_id` 再查。

**Job 驱动续跑（自动挂起 / `list_jobs` / `cancel_job`）与 `schedule_turn_wake`**

- **主路径（OpenCode 对齐）**：业务工具返回 `preparing`/`accepted`/`installing` + `job_id`，或 `opptrix_run({ background: true })` 时，Engine 在 `tool_done` 后**自动挂 watch**（仅登记，session×job 去重）；Composer 上方显示「N 个任务进行中」并可展开任务面板。Job **终态** → `SessionResumeBus` → 同会话 `resumeSessionChat`；**无 soft timer**，长任务仅依赖终态事件。**预计较长（下载/安装/重计算）必须 `background: true`**。
- **Job `title`**：面板/列表展示标题。shell-command：工具入参 `title`/`name`，缺省回退 `command_summary`；python-install：「准备 Python 环境」；fuyao-dump：「准备离线数据包」。
- **Composer 任务面板**（`ComposerBackgroundJobsBar`）：展开后可看各任务 `title`、进度文案、`stdout_tail`（等宽输出尾部，运行中随 `job_progress` 节流刷新）；`cancelable===true` 时可点「结束任务」（`POST /api/sessions/:id/jobs/:jobId/cancel`）。不可取消时禁用按钮并提示「此任务暂不支持手动结束」。终态后条立即消失。
- **禁止**：`watch_job` / `wait_job` 工具已移除（勿回潮）；禁止短同步等待 / poll / watch / sleep / 短间隔反复查进度；有 Job 时禁止对 `schedule_turn_wake` 传 `job_id`。
- **`list_jobs`**（`core`）：列出本对话相关后台任务（`title`、状态、进度、`cancelable`、可选 `stdout_tail`）；可选 `states` / `kind`（`shell-command` \| `python-install` \| `fuyao-dump`）/ `limit`（默认 20，上限 50）；只读，勿 tight-poll。筛选范围：本会话 `meta.session_id` 或本会话已挂 watch 的 Job。
- **`cancel_job`**（`core`）：仅 `cancelable===true` 时取消全局 Job；python-install / fuyao-dump 默认不可取消。用户新消息 / Stop / 删会话只清该会话 watches/timer，**不** cancel 全局 Job。REST 等价见 [API.md · Sessions](./API.md#sessions会话)。
- **工具步骤人读摘要**：过程轨迹（`ChatProcessTrace`）经 `formatToolLabel` + `formatArgsPreview`（`packages/agent/src/chat-progress.ts`）展示中文标签与参数短摘要（非裸 JSON）；含 `list_jobs` / `cancel_job` / `opptrix_run` 等。
- **Feature flag**：`OPPTRIX_JOB_WATCH=0` 关闭自动 watch（默认 on）。循环预算默认 `MAX_SAFETY_ROUNDS=550`（≥400 轮软提醒一次 turn-tail；停机中性文案；对齐 Cursor maxSteps≈512）；`OPPTRIX_AGENT_CURSOR_SMOOTH=0` 回退旧阈值（50 轮等）。

**`schedule_turn_wake`（core always-on，纯延时）**

- **用途**：无可靠 Job 事件时的纯延时续跑——登记 timer 后**结束本轮**；到期在**同会话**自动注入 callback `prompt` + 时间元数据并 `agent.chat` 续跑（`unattended: false`；**不用** steer）。
- **参数**：`seconds`∈[5, 1800]（软顶 1800，超出钳制）；`prompt` 必填；可选 `reason`。**禁止** `job_id`（传入返回明确错误）。每会话最多 8 个挂起 timer。
- **返回**：`wake_id` / `fire_at` / `seconds` / `scheduled_at` 等。
- **行为**：若到期时该会话仍有活跃 chat → **延期**再试，禁止打断当前轮；用户新消息开聊或 Stop/删会话会取消 pending wake。
- **限制**：timer 仅存**进程内存**；关闭应用/进程后丢失，需文档与 `note` 说明。
- **与异步任务**：有 `job_id` 时依赖自动挂起 + 终态续跑；勿用本工具盯进度。

**已废弃：Agent 侧 `market sync` / `dailyDump` 作为主取 dump 路径**

- App 主库 **不再** 导入扶摇静态日 K；`prepare_fuyao_dump` 只落盘 shared / 缓存，不写 `market.db`。
- `packages/market-data` 的 `sync()` 仍供 **UI 与后台**维护名录/行业等，**不是** Agent 获取扶摇 Parquet 的入口。
- Agent / 文档 / 系统提示：**禁止**引导用户或自行在沙盒跑 `market sync`、`dailyDump`、或把 Key 注入环境变量来拉 dump；统一 `prepare_fuyao_dump`。

**会话局域网与全局设置**

| 层级 | 存储 | 作用 |
|------|------|------|
| 全局 | 用户 SQLite `preference/sandbox_settings.allow_lan_access`（设置 → 沙盒环境；REST `GET/PUT /api/settings/sandbox`） | 所有对话允许私网/localhost 连接判定 |
| 本对话 | `SessionLanAccessStore`（**内存**） | 仅当前 session；**可覆盖**全局 `false`；**不写回** preference |

- **有效 LAN** = 全局 `allow_lan_access` **OR** 本会话已授权（`isEffectiveLanAllowed(sessionId)`）。
- **申请方式**：`request_session_lan_access({ reason? })`（内部 `ask_user`）或 Agent 直接 `ask_user`，选项 `allow_lan_session` | `deny`。
- **生命周期**：`clearSession` 清除本对话 LAN 授权；全局开关不受单会话授权影响。
- **与出站关系**：LAN 仅放宽私网/localhost **连接判定**；具体域名仍可能需 `network_egress` 确认（`http_fetch` / `opptrix_run` ping 等读有效 LAN）。

  - **板块 / 指数成分**：`get_sector_list` / `get_sector_constituents`；`get_index_constituents`；`get_etf_profile`
  - **公募基金（CN:PF）**：`get_fund_list` / `get_fund_profile` / `get_fund_nav` / `get_fund_holdings`；须 `assetClass=FUND` 命名空间（兼容 `CN:OF`），勿与 ETF 行情工具混用。桌面详情页另经 Hub `fund_detail` 聚合区间收益/回撤/配置/持有人/分红/经理/诊断/资讯/财务指标（非 MCP 工具）
  - **对话调试 JSONL**（`preference/chat_debug_logging`，默认 `enabled=false`）：开启后按会话写入 `logs/chat-debug/*.jsonl`；单文件超限 rotate 为 `.1`（截断更旧），目录有会话数/总字节软顶并 prune 最旧会话，避免无限 append。
  - **会话时钟 / 前缀缓存**：Engine 每轮将 `getCurrentTime()`（Asia/Shanghai）写入**本轮 turn-tail**（messages 末尾 ephemeral user），**不**写入稳定 system，以免破坏 DeepSeek 等前缀缓存；选型卡同理。有 `sessionId` 时请求体带稳定 `prompt_cache_key=opptrix-session:{id}`，chat-debug 仅记录 key / `cacheWarmth`（warm|cold|unknown），**不**因命中与否改写上下文。`get_current_time` 仅在用户明确问时刻时调用。未显式定制时输出额度 ladder：普模 32k、推理 32k、`reasoningEffort=high` 为 64k（显式可选 64k / 128k / 384k；显式等于历史默认 4096 或旧 16k 会抬升；更低显式值仍尊重）。上游 `reasoning_content` 会累积；工具轮写入会话并在下一请求 wire 回传（含空串占位）；**整轮思考时间线**以 `turns.reasoningSegments` 结构化分段持久化，并派生 `reasoningContent`（`---` 拼接）兼容旧读；live 推送 segments（末段流式）；UI 竖轴展示「第 N 段思路」，旧仅字符串会话可降级分段；messages 终轮仍仅写本轮 reasoning（wire 不变）；重开会话可在气泡内折叠查看「思考过程」；空正文时提示思考占用输出上限。
  - 调用未在本轮 tools 列表中的工具 → fail-closed，返回与冻结语义一致的提示（核对 tools / 选型卡，勿仪式 activate）
  - 准确率测试：`tests/mcp-tool-route-accuracy.test.mjs`（首推精确率 / 可见性召回 / 易混消歧 / 选型卡 / 过播种抑制）
- **系统提示词分层（`assembleSystemPrompt`）**：实现 `packages/agent/src/experts/prompt-assembler.ts`；每轮由 `AgentEngine.buildRoundSystemPrompt` → `ToolRegistry.systemPrompt` 组装，结构固定为三层（空行分隔）：
  - **Layer 0 — 系统底线（不可覆盖）**：`buildLayer0Baseline()`。禁止具体买卖建议、禁止编造数据、须先调工具取数、区分事实与推断等。专家 `persona` 或用户消息若要求违反上述底线，Agent 须拒绝并说明原因；**Layer 0 优先级高于 Layer 1 角色设定**。
  - **Layer 1 — 角色 persona**：`buildRolePersona({ sessionRolePersona, roleLabel })`。正文唯一来源是会话字段 `rolePersona`（创建时从专家 `persona` 或 `DEFAULT_RESEARCHER_PERSONA` 快照；可经 `PUT /api/sessions/:id/role-persona` 编辑）。抬头可用专家 `title`（仅展示）。目录改 `persona` **不影响**已有会话。消毒：空/超长 >4000 字/命中注入模式则创建时回退默认角色；PATCH 会话失败则 400。专家目录列表 API 不返回 `persona`。**写法与快照语义**见 [EXPERT-GUIDE.md](./EXPERT-GUIDE.md)。
  - **Layer 2 — 工具与投研纪律**：`ask_user` 用法、已加载 tools、`buildDataSourcingPolicy`（远程 MCP 优先）、`buildAgentSystemRules`（含 `researchTier` 档位 playbook 等）。本轮选型卡与【会话时钟】在 Layer2 之外经 `buildTurnTailPrompt` 追加（见上「会话前缀缓存」）。
- **专家会话 vs 默认研究员**：
  - **默认研究员**：`POST /api/sessions` 不传 `expertId` → `expertId` / `expertIcon` 为 `null`，`rolePersona` 初始为默认投研研究员文案（可编辑）。
  - **专家会话**：传 `expertId`（须存在于目录）→ 持久化 `expertId` + `expertIcon` + `rolePersona` 快照；标题默认 `defaultSessionTitle` 或专家 `title`；首聊天轮前 `seedExpertDefaultPacks` 按专家 `defaultPacks` 激活工具包（每会话每专家仅播种一次）；`defaultResearchTier` 仍可从目录按 `expertId` 读取（未冻结）；空会话欢迎可用专家 `starterPrompts`（最多 6 条，见 [API.md §Experts](./API.md#experts专家目录)）。
  - **专家目录**：`ExpertCatalogService` 优先 `StaticHttpExpertProvider`（默认 `https://update.opptrix.org/experts/` 的 `catalog.json` / `{id}.json`），失败降级包内 `LocalJsonExpertProvider`（`catalog.mock.json`）；再合并用户自建（user-store `local_experts`）。REST：`GET/POST/PATCH/DELETE /api/experts*`；UI 见 `client-ui/src/pages/experts/ExpertMarketPage.tsx`。部署与契约：[EXPERT-GUIDE.md](./EXPERT-GUIDE.md)、[`experts/README.md`](../experts/README.md)。官方内置含「新闻订阅管家」（`news` pack + RSSHub 三级漏斗）与「离线数据专家」（`workspace` + `prepare_fuyao_dump` / `cn-offline-daily-k`，不写主库）；详见 [EXPERT-GUIDE 官方内置专家一览](./EXPERT-GUIDE.md#官方内置专家一览)。
- **会话上下文管理（长对话压缩）**：实现 `packages/agent/src/context/*` + `llm/model-context.ts`。
  - **双视图**：UI 仍渲染完整 `turns`；喂给模型的是 `sessionMemory`（结构化工作记忆）+ 可选 `contextProjection` sidecar + 近端 messages（`assembleModelView`）。落盘另有软顶：仅当 turns>500 或 messages+turns JSON≳8MB 时截断最旧 tool 大字段并保留最近约 200 轮 UI turns（`sessionMemory` 保留），避免超长会话撑爆 SQLite 且不默认抹掉近期可见历史。
  - **投影 sidecar**：soft/micro 只写入 `contextProjection`（截断 tool 副本），**不改** canonical `messages`；structured 写 `sessionMemory` + 投影水位（`coveredCount`），不删 tool 正文。有效投影优先 splice；无效或缺省回退旧逻辑。**落盘**：`~/.opptrix/session-state/<sessionId>/context-projection.json`（与 `agent-workspace` 平级私有平面，Deny）；SQLite 仅存 `ContextProjectionRef` 指针（旧全文读路径幂等回填），不下发全文。聊天附件目录 `~/.opptrix/chat-attachments/<sessionId>/` 在 `deleteSession` 时级联删除；启动时 `pruneOrphanChatAttachments` 清理无对应会话的孤儿目录。
  - **窗长**：`resolveModelContextTokensAsync` 优先 models.dev（精确/大小写/去品牌前缀/规范化/子串/跨 provider），失败降级 `resolveModelContextTokens` 启发式（未知默认 128k）；`AvailableModel.contextTokens` 只读派生。预算预留输出与 system/tools；**soft/hard 85%** → 先 microcompact 投影，仍超则 structuredCompact（独立一轮 LLM 写 `SessionMemory`，目标/约束神圣不可丢）。
  - **多媒体 / 研报库（无图 Agentic Hybrid RAG）**：`resolveModelMediaCapabilitiesAsync` 从 models.dev 读取 `modalities` / `attachment`；`resolveAttachmentLimits` 按模型族分档限额（PDF / 文档 / 图片限额始终保留，供本地整理）。用户附件经 `POST .../attachments` 落盘；**PDF、文本（`.txt`/`.md` 等）、Word（`.docx` / `.doc`）、演示文稿（`.pptx` / `.ppt`）、图片**上传后经 Parse Router 异步入库：`text-l0` / `office-l0` / `pdf-extract-l0`，PDF 弱文本或深度整理时升 `ocr-l2`（Node ONNX，复用 PP-OCRv4 mobile 模型）。**图片一律本地 OCR 入库**；docx/pptx 与 PDF 基础整理路径会**顺带识别容器内嵌图中的文字**并并入对应页/幻灯片（`【图片文字】`）；OCR 未就绪时仍可入库正文。`extract` ready 后聊天侧 **必须注入 OCR 目录文本**；**仅当**模型 `modalities.input` 含 `image` 时才额外附带 `image_url`（text-only 模型不发图，出站前还会剥离历史里的 `image_url`/`file`/`input_audio`）；OCR 未就绪/失败时友好提示。`.doc` 由 `word-extractor` **仅抽正文**（不认图）；`.ppt` 由 `ppt-to-text` **仅抽正文**（不认图）；上传前 UI 会对旧格式确认。`.pptx` 仍按幻灯片分 chunk（`page`=slide）。→ 本地文档库（`@opptrix/doc-library`）+ legacy extract 双写，`meta.extract.documentId` 镜像库内状态。聊天侧对 PDF/文档 `extract.status=ready` **注入短目录文本**。**检索主路径**（system 注入「文档 RAG — 多跳检索」）：① 本会话：`list_session_documents` → `search_document` → `read_document`；② 跨会话/全库：`search_library`（研报 `searchHybrid` FTS⊕向量；资讯 `source_type=news` 走 **user-store 资讯 FTS**（与 SearchHub 统一搜索同源），**不**再双写 doc-library 切块、不进 Lance；语义未就绪时研报亦降级 FTS）→ 研报再 `read_document(document_id)` 精读，资讯以摘录为准，**可换关键词多跳**直至信息足够——**无需先建图**。意图路由：`library_search`（跨研报/全库）首选 `search_library`；本会话附件走 `session_documents`。桌面默认内置 e5 与 OCR 模型（`resources/llms/`；未就绪则 FTS 降级）。**关联图已硬删**：不再提供 `scheduleGraph` / `graph_jobs` / 关联设置 API / `GET /api/doc-library/graph/search`；schema **v5** DROP 图表；**v6** 删除列 `documents.llm_graph_at`；设置页无关联 UI。资讯入库仅 `syncNewsSearchIndex` → user-store FTS（Agent 查资讯应用多关键词）；研报/附件仍走 doc-library。设置 API：`GET/POST /api/settings/semantic-model*`、`GET/POST /api/settings/parse-engines*`（深度整理=OCR；版面增强已移除）。许可见 [THIRD-PARTY-NOTICES.md](./THIRD-PARTY-NOTICES.md)。
  - **触发**：每轮 `llm.chat` 前检查；上游 `context_length_exceeded` 等 → 强制 aggressive compact 后**重试 1 次**；`setSessionModel` 换模型后按新窗再检查。
  - **会话 LLM 参数**：`SessionRecord.llmParams`（`temperature` / `maxTokens` / `reasoningEffort`）经 `PATCH /api/sessions/:id` 持久化；聊天请求体优先会话覆盖，缺省温度 1、回复长度上限 32k；`max_tokens` 未设或仍为历史默认 4096 / 旧 16k 时按 ladder 抬升（普模 32k），用户可显式选 64k / 128k / 384k；未设则不发 `reasoning_effort`。
  - **SSE**：`context_compact`（`level`: micro/structured/overflow_retry）；会话内轻提示「已整理较早对话要点…」。`done` 可含 `turn_usage`（本轮 LLM 累计用量，含 tool 循环与 structured 压缩）与 `context_usage`（Composer：`usagePercent` / `compacted`，文案「上下文约 N%」+ 可选「已整理」；不下发 projection 全文）。测试：`tests/session-context-compact.test.mjs`、`tests/chat-token-usage.test.mjs`、`tests/session-projection-disk.test.mjs`。
- 系统提示与引擎：`packages/agent/src/engine.ts`；用户确认规则见 `packages/shared/src/agent-prompt-guide.ts` 中 `buildUserInteractionPlaybook`
- **`ask_user`**：Agent 需用户确认/选择/填空时调用；SSE 推送 `user_prompt`。**confirm**：省略 `options`（或 `[]`）且未设 `mode=text`/`allow_custom=true` → 底部「拒绝/确认」（可用 `reject_label`/`confirm_label`；回传 id 固定 `reject`/`confirm`）。**choice**：预置选项 2–50。**text**：`mode:"text"` 或空 options + `allow_custom=true` → 仅开放填空，无授权双钮。禁止用 confirm 收集开放答案。`allow_custom`：confirm 默认关、choice 默认开。多选支持全选；prompt/label 勿用 emoji。作答经 `POST /api/sessions/:id/chat/user-prompt` 回传后继续工具链
- **`schedule_turn_wake`**（`core`）：无 Job 事件时的纯延时续跑；见上文。异步 preparing+job_id 通常自动挂起并终态续跑；禁止传 `job_id`；勿 poll/sleep。
- **`list_jobs`**（`core`）：查看本对话后台任务（标题/进度/是否可取消）；见上文。
- **`cancel_job`**（`core`）：显式取消（仅 cancelable）；见上文。勿使用已移除的 `wait_job`。
- **行业 / 产业链**：激活工作流技能 `industry-chain`（读 `references/chain-knowledge.json`）→ 代表公司优先 namespaced MCP 搜码/问数，不足再用 `search_instruments` + `get_instrument_*`
- **早报 / 收盘**：激活 `morning-market-brief` / `closing-market-brief` → 用 `get_market_dynamics`、`get_limit_updown`、`get_watchlist` 等取数后按技能 Schema 输出 JSON
- **市场宏观**：`get_market_regime` / `get_market_dynamics` / `get_trend_brief` 等属 `market` pack（提供事实表；开闭市叙事走工作流技能，非独立报告工具）
- **跨市场搜索**：优先已启用 namespaced MCP；快照/行情/财务本地工具均 MCP 优先；本地补充 `search_instruments`（`core` pack，始终可用；`markets` 可过滤 CN/US/HK/CRYPTO；仅歧义或 MCP 未启用/失败）
- 勿再调用已移除工具：`get_morning_brief` / `get_closing_report` / `industry_mining` / `industry_mermaid` / `search_etfs` / `screen_*_universe` / `get_etf_scorecard` / `get_etf_snapshot` / `get_watchlist_radar` / `institution_rating` 等；统一用工作流技能 + namespaced MCP（优先）/ `search_instruments` / `get_instrument_*` / `evaluate_instrument`（本地补充）
- **A 股股票 Discover 自动选股策略已移除**；可用 A 股 ETF / 美港股 / Crypto 等在线初选策略，或直接指定代码研究
- Discover 挖掘仍按 profile 固定工具子集（`discoverMiningToolNamesForProfile`）；与聊天 Tool Pack 共享 `TOOL_PACK_*` 常量，一期不强改 Discover 主路径

### 4.3 数据层

完整架构与多市场演进见 **[DATA-LAYER.md](./DATA-LAYER.md)**。

**在线层** `@opptrix/a-stock-layer`（规划更名为 `MarketDataEngine` + `DataProvider`）：

- `AshareEngine`：按 capability 在多个 Provider（现名 driver）间自动回退
- 内置 Provider：东财、efinance、TDX（mootdx/pytdx）、腾讯、新浪、同花顺、网易、雪球、股吧、巨潮、中证指数、统计局、Tushare 等（见 `drivers/register.ts`）
- 组合账本：`~/.opptrix/portfolio.json`
- **扩展方向**：A 股 ETF 行情/挖掘（Phase 1）→ 美股 → 虚拟货币；新增源 = 一个 Provider module（`providers/<id>/`）+ `bindings()` + 可选 `settings()` 自描述；配置在设置页 **数据源** 按市场分组自动出现

**本地层** `@opptrix/market-data`（缓存/兼容，非选股主路径）：

- Schema / 历史数据可保留（向后兼容）；本地因子选股管道已移除
- 请优先已启用 namespaced MCP；本地补充用 `search_instruments` / `evaluate_instrument` / `get_instrument_chart`

### 4.4 前端主界面

当前产品主入口为 **`client-ui/src/chat/ChatApp.tsx`**（非旧版多页面 Dashboard 导航为主流程）：

| 区域 | 关键文件 |
|------|----------|
| 会话侧栏 | `chat/SessionSidebar.tsx` |
| 消息列表与流式 | `chat/ChatView.tsx`, `chat/ChatMessageItem.tsx` |
| 输入框 | `chat/ChatComposer.tsx`（工具栏：左 `+` 菜单附件/授权文件夹/引用技能；右空态麦克风 / 有内容发送 / 生成中停止） |
| 后台任务面板 | `chat/ComposerBackgroundJobsBar.tsx` + `chat/jobWatchProgress.ts`（进行中条数；展开可看 stdout 尾部 / 「结束任务」） |
| 快捷任务 | `chat/quickTaskCatalog.ts`, `chat/ComposerQuickTasks.tsx`（**已弃用入口**：组件与存储仍保留，Composer 默认不再挂载；加号菜单见 `ComposerPlusMenu`） |
| 选模与参数 | `chat/ModelSelector.tsx`（Composer `showParams`：列表可滚 + footer 固定参数区；设置页 `showParams={false}`） |
| @ 股票引用 | `chat/useStockMention.ts`, `chat/ComposerStockRefTag.tsx` |
| 工具执行轨迹 | `chat/ChatProcessTrace.tsx`（人读标签 + 参数短摘要，非裸 JSON） |
| Markdown 渲染 | `chat/MarkdownMessage.tsx`, `chat/markdownSanitize.ts` |
| 右侧投研面板 | `chat/RightPanel.tsx` → `market/*Tab.tsx` |
| 设置 | `pages/SettingsPage.tsx` |

旧版页面（`pages/Dashboard.tsx` 等）可能仍存在，**以 Chat 工作区为准**，改动前先确认是否仍被路由引用。

---

## 5. 开发流程（Agent 执行清单）

### 5.1 开始任务前

1. 阅读本文件与 `.cursor/rules/rules-index.mdc`、`.cursor/rules/backward-compatibility.mdc`
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
| 新增 REST 端点 | `apps/server/src/index.ts`（计划任务：`apps/server/src/schedule-routes.ts`） |
| 计划任务 / 调度引擎 | `packages/schedule/` + `packages/user-store/src/schedule.ts`；Agent 工具：`packages/agent/src/mcp/schedule-tools.ts`；桌面 reconcile（仅注销遗留）：`apps/desktop/electron/schedule-bridge.cjs`、`os-schedule/` |
| 新增 Agent/MCP 工具 | `packages/agent/src/tools.ts` + `tool-meta.ts` + `packages/shared/src/tool-packs.ts`（挂 pack）+ `tool-route-plan.ts`（意图精排）；遵循 `.cursor/rules/mcp-tool-pack-routing.mdc` |
| 工作区 / http_fetch / 文件夹授权 | `packages/agent-workspace/` + `packages/agent/src/mcp/workspace-tools.ts`；grant REST：`apps/server/src/index.ts`（`/api/sessions/:id/workspace/grants`） |
| 调整聊天工具包播种 | `packages/agent/src/mcp/tool-pack-resolver.ts` |
| 新增数据源 | `packages/a-stock-layer/src/drivers/` + `register.ts`（规范见 [DATA-LAYER.md §12](./DATA-LAYER.md#12-新增-provider-检查清单)） |
| 新增因子 | `packages/stock-eval/src/factors/` |
| 本地库查询/同步 | `packages/market-data/src/` |
| 聊天 UI | `client-ui/src/chat/` |
| 专家目录 / persona 组装 | `packages/agent/src/experts/`（`static-http-provider.ts`、`catalog.mock.json` fallback、`schemas/`、`prompt-assembler.ts`、`catalog-service.ts`）；仓库根 [`experts/`](../experts/)；REST `/api/experts*`；[EXPERT-GUIDE.md](./EXPERT-GUIDE.md)（含 [远程 §7](./EXPERT-GUIDE.md#7-远程专家-datasource)） |
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
- [ ] 若改 DB/本地存储/API/更新元数据：已做兼容与迁移，旧客户端可升级（见 §1.2）
- [ ] 若改 API/feature，已更新 `docs/API.md`（如适用）

---

## 6. UI / UX 硬性规范（摘要）

完整规范见 `docs/UI-DESIGN-SYSTEM.md` 与 `.cursor/rules/client-ui-guidelines.mdc`。

### 6.1 视觉

- **Fluent UI v9** + 项目 tokens（`client-ui/src/theme/tokens.ts`）
- 暖色画布、陶土橙 `#D17A5D` 强调、卡片式 surface
- 复用 `OpptrixButton`、`OpptrixField`、`OpptrixSurface` 等封装
- 浮层菜单：毛玻璃样式，参考 `ComposerTooltipMenu.tsx` / `global.css` 中 `.opptrix-composer-tooltip-menu`

### 6.2 桌面 / Electron

- **始终 desktop 布局**，窗口变窄也不切换 `MobileTopBar`
- 窄窗：侧栏变为 **全高浮层**（`top:0; bottom:0`），白底轻毛玻璃，**无全屏遮罩**
- z-index：标题 `1100` → 浮层侧栏 `1150` → 面板标题带 `1200` → 顶栏控件 `1300` → 可点击会话标题 `1310`（`DESKTOP_Z_*` in `client-ui/src/desktop/constants.ts`）
- 最小宽度 `DESKTOP_CHAT_MIN_WIDTH`（510px），与 `apps/desktop/electron/window-state.cjs` 同步

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
| `~/.opptrix/`（用户数据根） | 内部存储根；**不对** Agent/`list_workspace_grants`/用户界面暴露为可访问目录；默认可写平面仅为其中的 `agent-workspace/` |
| `~/.opptrix/market-data/` | 本地 SQLite 与市场数据（Deny；`get_project_info` 不返回内部路径） |
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
| `.cursor/rules/rules-index.mdc` | Cursor 常驻规则索引（薄层） |
| `.cursor/rules/client-ui-guidelines.mdc` | client-ui UI/UX 与文案规范（glob 挂载） |
| `.cursor/rules/backward-compatibility.mdc` | **硬性** — 数据库/数据架构/升级兼容与迁移 |

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

**Q：想全面了解项目架构怎么办？**
A：阅读 [`docs/ARCHITECTURE-COMPREHENSIVE.md`](./ARCHITECTURE-COMPREHENSIVE.md)，涵盖数据库层、数据层、Provider 机制、模块化开发、UI 规范、发布打包、发布前测试、审计流程。

---

*最后更新：与仓库 main 分支同步维护。重大架构变更时请一并更新本文件。*
