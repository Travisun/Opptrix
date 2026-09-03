# Opptrix 扩展平台 — 实现规格 v1.3

> **⚠️ 请先读抽象架构（v2.0）**：[EXTENSION-PLATFORM-ARCHITECTURE.md](./EXTENSION-PLATFORM-ARCHITECTURE.md)  
> 本文档为 **实现细节与历史规格**（manifest、RPC、完整 API 表）。若与 v2.0 MVP 边界冲突，**以 v2.0 为准**。  
> **状态**：设计稿（未实现）  
> **分支建议**：`feat/extension-platform`  
> **运行形态**：**Web 优先**（浏览器 / PWA / Docker 自托管）；**不依赖 Electron Desktop**  
> **关联**：本设计中的 **Plugin Platform** 与仓库内 **Self-Evolution Harness**（`docs/SELF-HARNESS-PRODUCT.md`）是不同概念，勿混用。

### v2.0 相对 v1.3 的结构变化

| v1.3（本文） | v2.0（抽象架构） |
|--------------|------------------|
| 5 套并列总线 | **Hook + Event + Alert** 三元组 |
| P0–P7 七段里程碑 | **Phase A / B / C** 三阶段 |
| 20+ Capability 一次列出 | **MVP 9 项** + Phase 2/3 分层 |
| ConversationHub / NotificationBus 与 MVP 同级 | 推至 **Phase C / Phase 2** |

---

## 目录

1. [目标与原则](#1-目标与原则)
2. [已锁定决策（ADR）](#2-已锁定决策adr)
3. [总体架构](#3-总体架构)
4. [扩展包格式 `.opx`](#4-扩展包格式-opx)
5. [Module Federation UI 运行时](#5-module-federation-ui-运行时)
6. [Extension Host（独立子进程）](#6-extension-host独立子进程)
7. [依赖注入（DI）与服务目录](#7-依赖注入di与服务目录)
8. [Hook 总线（三分域）](#8-hook-总线三分域)
9. [能力面详表](#9-能力面详表)
10. [计划任务、脚本与常驻 Worker](#10-计划任务脚本与常驻-worker)
11. [会话监听与改写（P5）](#11-会话监听与改写p5)
12. [官方扩展商店与签名](#12-官方扩展商店与签名)
13. [CLI：`opptrix-ext`](#13-cliopptrix-ext)
14. [安全、隔离与审计](#14-安全隔离与审计)
15. [与现有子系统映射](#15-与现有子系统映射)
16. [对照 DeepSeek Harness 能力矩阵](#16-对照-deepseek-harness-能力矩阵)
17. [架构短板与演进](#17-架构短板与演进)
18. [分阶段交付](#18-分阶段交付)
19. [通知系统（Notification Channel）](#19-通知系统notification-channel)
20. [对话系统（Conversation Channel）](#20-对话系统conversation-channel)
21. [扩展 Host API 完整目录](#21-扩展-host-api-完整目录)
22. [部署兼容矩阵（Web / Docker / PWA）](#22-部署兼容矩阵web--docker--pwa)
23. [存储与数据库能力](#23-存储与数据库能力)
24. [多语言运行时](#24-多语言运行时)
25. [能力缺口审计（v1.1）](#25-能力缺口审计v11)
26. [事件总线 vs Hook 总线](#26-事件总线-vs-hook-总线)
27. [附录：流程图与脑图](#27-附录流程图与脑图)

---

## 1. 目标与原则

### 1.1 目标

构建 **可插拔扩展平台**，使第三方与官方扩展能够：

- 使用 **React 独立编译包** 贡献 UI（侧栏、独立页面、设置卡片）
- 通过 **标准 DI 接口** 调用系统能力（LLM、数据库、沙盒命令、Skills、关注/持仓、会话、计划任务等）
- 通过 **标准 Hook** 介入应用与 Agent 生命周期
- 注册 **常驻 Worker**、**Node/Python 脚本**、**计划任务类型**
- 从 **官方扩展商店** 安装 / 升级 / 卸载，或 **本地导入**（开发者模式）
- **不阻塞** 服务端事件循环（Fastify）与浏览器 UI 主线程

### 1.2 核心原则

| 原则 | 说明 |
|------|------|
| **Web 优先** | 默认部署为浏览器 SPA + `apps/server`；不假设 Electron / 原生壳 |
| **Host 唯一入口** | 扩展禁止 `import @opptrix/agent` 等内部包；仅 `@opptrix/extension-sdk` |
| **进程隔离** | 扩展逻辑在服务端 **独立子进程**；UI 在浏览器 MF 远程模块 |
| **Channel 抽象** | **通知**与**对话**均通过可插拔 Channel；默认 Web，扩展可注册新 Channel |
| **可撤销效应** | `activate()` 注册的一切 hook / worker / route / channel 必须可 `deactivate` 清理 |
| **权限先行** | manifest 声明权限；运行时 PolicyProxy 强制校验 |
| **官方商店 + 签名** | 商店包必须 Ed25519 验签；本地导入可走开发者模式 |
| **增量依赖** | 插件只打包私有依赖；React / UI Kit 由宿主 shared |

---

## 2. 已锁定决策（ADR）

| ID | 决策 | 选择 | 理由 |
|----|------|------|------|
| ADR-01 | UI 加载 | **Module Federation v2** | 与 React 直出、独立编译、chunk 共享一致；优于裸 ESM import map 的版本对齐能力 |
| ADR-02 | 扩展运行时 | **独立子进程**（非 worker_threads） | 脚本崩溃、原生模块、Python 子进程树隔离更彻底；**服务端**零扩展 JS |
| ADR-03 | 会话改写 | **P5 单独里程碑** | 安全与审计复杂度高，不阻塞 P0–P4 |
| ADR-04 | Registry | **仅官方** `registry.opptrix.org` | 降低供应链风险；CLI `publish` 只推官方 |
| ADR-05 | 签名 | **商店包强制 Ed25519**；本地 zip 开发者模式可跳过 | 用户默认可信链；`OPPTRIX_EXT_DEV=1` |
| ADR-06 | 运行形态 | **Web 优先**；Docker 自托管；PWA 可选 | **不依赖 Electron Desktop**；无 Electron 专属 API 作为硬前提 |
| ADR-07 | 通知 | **Notification Channel 抽象** | 统一 `NotificationBus`；内置多 channel；扩展可注册 |
| ADR-08 | 对话 | **Conversation Channel 抽象** | 与 `LlmProvider`（模型后端）分离；默认 `web`；扩展可注册机器人/远程对话 |

---

## 3. 总体架构

### 3.1 逻辑分层

```
┌─────────────────────────────────────────────────────────────────────────┐
│  client-ui（浏览器 / PWA）                                               │
│  ┌──────────────┐  ┌────────────────────┐  ┌─────────────────────────┐ │
│  │ App Shell    │  │ Extension UI Host  │  │ Contribution Slots      │ │
│  │ 路由/侧栏壳  │  │ MF Runtime / Remote│  │ sidebar / pages / chat  │ │
│  └──────┬───────┘  └─────────┬──────────┘  └───────────┬─────────────┘ │
│         │                      │ HTTPS remoteEntry.js     │              │
└─────────┼──────────────────────┼───────────────────────────┼──────────────┘
          │ REST + WebSocket (SSE) │                           │
┌─────────┼──────────────────────┼───────────────────────────┼──────────────┐
│ apps/server（Node 服务端）      │                           │              │
│  ┌──────▼───────┐  ┌───────────▼──────────┐  ┌────────────▼────────────┐ │
│  │ Extension    │  │ ServiceContainer     │  │ Hook Bus                │ │
│  │ Manager      │──│ (DI Root + Adapters) │──│ session/agent/cap       │ │
│  └──────┬───────┘  └──────────────────────┘  └─────────────────────────┘ │
│  ┌──────▼──────────┐  ┌──────────────────┐  ┌─────────────────────────┐ │
│  │ NotificationBus │  │ ConversationHub  │  │ EventStream (WS/SSE)    │ │
│  └─────────────────┘  └──────────────────┘  └─────────────────────────┘ │
│         │ stdio JSON-RPC                                                    │
│  ┌──────▼──────────────────────────────────────────────────────────────┐ │
│  │ Extension Host Supervisor（子进程池，每扩展 1 主进程 + N worker）     │ │
│  └──────┬──────────────────────────────────────────────────────────────┘ │
└─────────┼────────────────────────────────────────────────────────────────┘
          │
┌─────────▼────────────────────────────────────────────────────────────────┐
│ 既有核心（仅经 Adapter 暴露）                                              │
│  Agent Engine · LlmProvider · SessionStore · ConversationChannels          │
│  · agent-skills · agent-workspace · Schedule · NotificationDispatch        │
│  · user-store · Research Hub · Watchlist/Portfolio · External MCP          │
└──────────────────────────────────────────────────────────────────────────┘
```

### 3.2 运行时边界

| 运行时 | 位置 | 职责 | 禁止 |
|--------|------|------|------|
| **Shell** | 浏览器主线程 | 布局、路由、MF 加载、用户交互 | 扩展业务逻辑、LLM 调用 |
| **Server Facade** | Fastify 同进程 | 鉴权、扩展 CRUD、RPC 转发、WS 事件 | `eval` 扩展代码 |
| **Extension Host** | **独立子进程** / 扩展 | activate、hooks、schedule、channel adapter | 直接 DOM |
| **Resident Worker** | Host 子树下 **独立子进程** | 常驻任务、消息循环 | 无限 CPU（有配额） |
| **Script Runner** | 一次性 **子进程** | node/python 脚本 | 未授权路径 |
| **Conversation Channel** | Host 或 server 模块 | 外部对话入口（Bot/HTTP） | 绕过 Session 统一存储 |

### 3.3 概念分层：模型 vs 对话 vs 通知

```
用户消息 ──► ConversationChannel（web / telegram / …）
                │
                ▼
         ConversationHub（会话路由、鉴权、持久化）
                │
                ▼
         Agent Engine（turn 循环、tools、hooks）
                │
                ▼
         LlmProvider（OpenAI 兼容 / 扩展注册模型后端）
                │
                ▼
         回复 ──► ConversationChannel.deliver（按 channel 格式化）
                │
                └──► NotificationBus（可选并行：提醒、告警）
```

- **LlmProvider**：「用什么模型推理」（现有 `packages/agent/src/llm/provider.ts`）
- **ConversationChannel**：「从哪收消息、往哪发回复」（**新增**）
- **NotificationChannel**：「如何触达用户（非对话线程）」（**新增**）

---

## 4. 扩展包格式 `.opx`

### 4.1 目录结构（安装后）

```
~/.opptrix/extensions/
  com.example.alpha/
    1.2.0/
      opptrix.plugin.json
      dist/
        host/
          index.js              # Host 入口（子进程加载）
        ui/
          remoteEntry.js        # Module Federation entry
          mf-manifest.json
      node_modules/             # 仅插件增量依赖
      SIGNATURE.ed25519
      CHECKSUMS.sha256
    active -> 1.2.0             # symlink
  plugin-data/
    com.example.alpha/          # 扩展私有持久化
```

### 4.2 Manifest：`opptrix.plugin.json`

```json
{
  "$schema": "https://opptrix.org/schemas/plugin/v1.json",
  "id": "com.example.alpha",
  "name": "Alpha 助手",
  "version": "1.2.0",
  "publisher": "example",
  "description": "示例扩展",
  "icon": "assets/icon.png",
  "engines": {
    "opptrix": "^0.5.0",
    "node": ">=20",
    "python": ">=3.10"
  },
  "capabilities": {
    "web": true,
    "docker": true,
    "requiresPublicUrl": false,
    "scripts": { "node": true, "python": true }
  },
  "activationEvents": [
    "onStartup",
    "onCommand:alpha.refresh",
    "onView:com.example.alpha.main"
  ],
  "permissions": [
    "llm",
    "conversation.read",
    "notifications.send",
    "sessions.read",
    "events.subscribe",
    "watchlist",
    "schedule",
    "shell",
    "scripts.node",
    "scripts.python",
    "workers.resident",
    "ui.contribute"
  ],
  "main": "dist/host/index.js",
  "ui": {
    "remoteEntry": "dist/ui/remoteEntry.js",
    "exposes": {
      "./Sidebar": "./src/ui/sidebar",
      "./MainPage": "./src/ui/pages/main"
    }
  },
  "contributes": { },
  "signature": {
    "algorithm": "ed25519",
    "publisherKeyId": "opptrix-official-example"
  }
}
```

### 4.3 与 Agent Plugins v1 互操作（可选导入）

| Agent Plugins | Opptrix 映射 |
|---------------|--------------|
| `plugin.json` | 映射为 `opptrix.plugin.json` 子集 |
| `skills/` | 安装到 `~/.opptrix/skills/imported/{pluginId}/` |
| `mcp.json` | 注册到 `ExternalMcpRegistry`（命名空间 `{pluginId}__`） |

---

## 5. Module Federation UI 运行时

### 5.1 宿主（Host）配置

- 构建时内置 **Module Federation Host** 配置（`@module-federation/enhanced`）
- **Shared 单例**（`singleton: true`, `strictVersion: true`）：

| 模块 | 说明 |
|------|------|
| `react` / `react-dom` | 与 client-ui 同版本 |
| `@opptrix/ui-kit` | Fluent 封装、tokens、Opptrix* 组件 |
| `@opptrix/extension-sdk/ui` | `useService`, `useCommand`, 类型 |

### 5.2 扩展（Remote）配置

```ts
// vite / rspack federation plugin
federation({
  name: 'com_example_alpha',
  filename: 'remoteEntry.js',
  exposes: {
    './Sidebar': './src/ui/sidebar.tsx',
    './MainPage': './src/ui/pages/main.tsx',
  },
  shared: {
    react: { singleton: true, requiredVersion: '^18.3.0' },
    'react-dom': { singleton: true, requiredVersion: '^18.3.0' },
    '@opptrix/ui-kit': { singleton: true },
    '@opptrix/extension-sdk/ui': { singleton: true },
  },
})
```

### 5.3 加载流程

1. `ExtensionManager` 解析已启用扩展的 `ui.remoteEntry` URL（同源 HTTPS：`/api/ext/{id}/ui/remoteEntry.js` 或 Registry CDN）
2. `ExtensionUIRuntime.loadRemote(pluginId, remoteEntry)` 注册 remote
3. Contribution 声明 `module: "com_example_alpha/MainPage"`
4. Shell 路由匹配 → `React.lazy(() => loadRemote('com_example_alpha/MainPage'))`
5. 扩展组件在 `<ExtensionErrorBoundary>` + `<ExtensionThemeProvider>` 内渲染

### 5.4 非 iframe 的保证

- 同一 React 树（Portal 到 Shell slot 或嵌套路由）
- 共享 Fluent 主题与 `opptrixTokens`
- CSS：推荐 **CSS Modules**；全局类禁止污染（lint 规则：`:global` 受限）

### 5.5 失败与降级

| 场景 | 行为 |
|------|------|
| remoteEntry 404 | 侧栏项显示「扩展加载失败」；设置页可重试 |
| shared 版本不匹配 | 阻止激活，提示升级宿主或扩展 |
| 渲染抛错 | ErrorBoundary 隔离；不影响主应用 |

---

## 6. Extension Host（独立子进程）

### 6.1 进程模型

```
ExtensionSupervisor (server 内模块)
  ├── host-process: com.example.alpha  (stdio JSON-RPC)
  │     ├── worker-process: indexer    (manifest workers[])
  │     └── script-process: (按需 spawn, 用完即毁)
  ├── host-process: com.other.beta
  └── ...
```

- **每扩展一主 Host 进程**：加载 `dist/host/index.js`，执行 `activate(ctx)`
- **常驻 Worker**：Host 再 `fork` 子进程，入口 `workers[].module`
- **脚本**：`scripts.run` → 独立子进程，不经过 Host 事件循环

### 6.2 通信协议：JSON-RPC 2.0 over stdio

**Server → Host**

| method | 说明 |
|--------|------|
| `host/activate` | 传入 manifest + pluginRoot + grantedPermissions |
| `host/deactivate` | 清理 |
| `host/invoke` | 调用扩展导出的 command handler |
| `host/hook` | 分发 hook 事件 |
| `host/ping` | 健康检查 |

**Host → Server**

| method | 说明 |
|--------|------|
| `service/call` | DI 服务方法调用（如 `llm.chat`） |
| `contrib/register` | 动态注册 route / command |
| `hook/register` | 注册 hook handler |
| `log/write` | 结构化日志 |
| `metrics/inc` | 指标 |

### 6.3 超时与崩溃恢复

| 参数 | 默认 |
|------|------|
| RPC 超时 | 30s（`llm.chat` 可延长至 10min，独立 channel） |
| Hook 超时 | 100ms（可配置 per-event） |
| 崩溃重启 | 最多 5 次 / 10min，否则 `disabled` |
| 优雅退出 | `deactivate` 5s → SIGTERM → 3s → SIGKILL |

---

## 7. 依赖注入（DI）与服务目录

### 7.1 ServiceContainer

```ts
// 宿主侧 — packages/extension-host/src/container.ts
interface ServiceToken<T> { readonly id: symbol }

interface ServiceContainer {
  register<T>(token: ServiceToken<T>, factory: (ctx: ServiceContext) => T): void
  resolve<T>(token: ServiceToken<T>, scope: ServiceScope): T
}

type ServiceScope = 'app' | `session:${string}` | `extension:${string}`
```

扩展侧仅见 **Facade**（由 RPC `service/call` 代理）。

### 7.2 服务目录（核心 + 扩展能力）

#### 7.2.1 核心（P0–P2）

| Token | 接口 | 权限 | 底层 Adapter |
|-------|------|------|--------------|
| `LLM` | `ILlmService` | `llm` | `LlmProvider` + 配额（**模型后端**，非对话通道） |
| `CONVERSATION` | `IConversationService` | `conversation.read` / `.write` | **ConversationHub**（§20） |
| `NOTIFICATION` | `INotificationService` | `notifications.send` | **NotificationBus**（§19） |
| `SESSIONS` | `ISessionService` | `sessions.*` | `SessionStore` |
| `EVENTS` | `IEventService` | `events.subscribe` | WS/SSE EventStream |
| `SKILLS` | `ISkillService` | `skills.*` | `agent-skills` |
| `SHELL` | `IShellService` | `shell` | `ShellRunner` + grants |
| `WATCHLIST` | `IWatchlistService` | `watchlist` | Engine watchlist |
| `PORTFOLIO` | `IPortfolioService` | `portfolio` | Portfolio manager |
| `SCHEDULE` | `IScheduleService` | `schedule` | `ScheduleService` |
| `JOBS` | `IJobService` | `jobs.*` | JobRegistry（discover/fuyao/shell 等） |
| `DATA` | `IDataQueryService` | `data.query` | `queryInstrumentData` |
| `DATA_STREAM` | `IDataStreamService` | `data.subscribe` | 行情/Hub 订阅（背压） |
| `DOCUMENTS` | `IDocumentService` | `documents.*` | doc-library |
| `SEARCH` | `ISearchService` | `search` | 名录/文档/会话搜索 |
| `HTTP` | `IHttpService` | `http.fetch` | egress 策略 + 超时 |
| `FS` | `IFileService` | `fs.*` | plugin-data / 资产 / 导入 |
| `DB` | `IUserDbService` | `db.user` | user-store 白名单 namespace（§23.3） |
| `STORAGE` | `IPluginStorageService` | （内置） | `plugin-data` KV（§23.4） |
| `PLUGIN_DB` | `IPluginDbService` | `db.plugin` | 扩展私有 SQLite（§23.5，P6） |
| `VAULT` | `IVaultService` | `vault` | agent vault |
| `AUTH` | `IAuthService` | `auth` | whoami / step-up |
| `CONFIG` | `IConfigService` | `config.read` | 用户偏好 |
| `PLATFORM` | `IPlatformService` | （内置） | web/docker/pwa 能力矩阵 |
| `LOG` | `ILogger` | （内置） | 结构化日志 |
| `TELEMETRY` | `ITelemetryService` | `telemetry` | 脱敏指标 |

### 7.3 PolicyProxy

每个 `service/call` 校验：

1. manifest `permissions` 是否包含所需 capability  
2. 会话级 scope（如 `sessions.mutate` 仅当前 extensionId 审计条目）  
3. 速率限制（LLM token/min、shell 并发）

---

## 8. Hook 总线（三分域）

设计对齐 **DeepSeek Harness / Cordis**：事件即扩展点，注册可撤销。

### 8.1 域划分

| 域 | 前缀 | 持久化 | 典型用途 |
|----|------|--------|----------|
| Session | `session/` | 是 | 消息已提交、标题变更 |
| Conversation | `conversation/` | 是 | 入站/出站消息（§20） |
| Agent | `agent/` | 否（可投影） | turn、tool 前后 |
| Capability | `cap/` | 否 | shell、fs、tools 策略 |

### 8.2 Hook 目录

#### 应用生命周期

| 事件 | 同步/异步 | 可改写 | 权限 |
|------|-----------|--------|------|
| `app/onStartup` | async | 否 | 自动 |
| `app/onShutdown` | async | 否 | 自动 |
| `extension/onActivate` | async | 否 | 自动 |
| `extension/onDeactivate` | async | 否 | 自动 |

#### Agent / 聊天

| 事件 | 同步/异步 | 可改写 | 权限 |
|------|-----------|--------|------|
| `conversation/inbound` | async | 否 | `conversation.channel` |
| `conversation/outbound` | sync | 是（格式化） | `conversation.channel` |
| `agent/turnStart` | sync, 100ms | 是（patch） | `sessions.mutate`（P5） |
| `agent/turnEnd` | sync, 100ms | 是（patch） | `sessions.mutate`（P5） |
| `agent/message` | async | 否 | `sessions.read` |
| `agent/toolPreExecute` | sync waterfall | 是 | `tools.intercept` |
| `agent/toolPostExecute` | async | 否 | `tools.intercept` |
| `session/messageCommitted` | async | 否 | `sessions.read` |

#### 计划任务

| 事件 | 说明 |
|------|------|
| `schedule/jobRegister` | 扩展注册 kind |
| `schedule/beforeRun` / `schedule/afterRun` | 审计与指标 |

#### Worker

| 事件 | 说明 |
|------|------|
| `worker/onStart` / `worker/onStop` / `worker/onMessage` | 常驻 worker 生命周期 |

### 8.3 Waterfall 合并规则（`toolPreExecute`）

1. 按扩展 `priority`（manifest 可选，默认 0）排序  
2. 每个 handler 可返回 `{ abort?, patchArgs? }`  
3. 任一 `abort: true` → 短路拒绝  
4. `patchArgs` 浅合并  

---

## 9. 能力面详表

### 9.1 UI Contributions

| 贡献点 | 字段 | 说明 |
|--------|------|------|
| `views.sidebar` | id, label, icon, module, order | 左侧边栏 |
| `views.settings` | id, label, module | 设置页卡片 |
| `pages` | id, path, title, module, showInSidebar | 独立路由页 `/ext/:pluginId/:pageId` |
| `views.chat` | id, module, placement | 聊天区注入（Composer 条、消息 actions） |
| `views.instrument` | id, module | 右栏/自选行内 actions |
| `commands` | id, title, icon, shortcut? | 命令面板 |
| `notificationChannels` | id, title, module | 注册通知 Channel（§19） |
| `conversationChannels` | id, title, module | 注册对话 Channel（§20） |

路由约定：`/ext/:pluginId/:pageId`

### 9.2 API Route Contributions

| 贡献点 | 说明 |
|--------|------|
| `routes` | 挂载到 `/api/ext/:pluginId/*`，经 Fastify 转发到 Host RPC |

### 9.3 Agent Contributions

| 贡献点 | 说明 |
|--------|------|
| `agentTools` | 注册到 Tool Pack（走现有 `tools.ts` → meta → pack 流程） |
| `skills` | 复制或链接到 skills 目录 |
| `mcp` | `mcp.json` → External MCP |

---

## 10. 计划任务、脚本与常驻 Worker

### 10.1 计划任务

```ts
// 扩展 host activate 内
ctx.schedule.registerJobKind({
  kind: 'com.example.alpha.daily-digest',
  title: '每日摘要',
  inputSchema: { type: 'object', properties: { group: { type: 'string' } } },
  handler: async (job, services) => { /* ... */ },
})
```

- 存储：复用 `ScheduleService` + `user-store`  
- 执行：Host 子进程内 async handler；禁止 >30min 无心跳  

### 10.2 脚本执行

```ts
ctx.scripts.run({
  runtime: 'node' | 'python',
  entry: 'scripts/report.py',
  args: ['--dry-run'],
  cwd: 'plugin-root' | 'workspace:default' | 'plugin-data',
  timeoutMs: 120_000,
  network: 'deny' | 'allowlist',
})
```

| runtime | 解释器来源 |
|---------|------------|
| `node` | 宿主 Node + 插件 `node_modules` 的 `NODE_PATH` |
| `python` | 现有 `resolvePythonRuntime`（Docker 系统 `python3` / 自托管环境） |

> **Web 优先说明**：不再假设「桌面包内 Python」。Docker 仅系统 Python；Web 自托管按部署镜像提供解释器。扩展 manifest 须声明 `engines.python` 与 `capabilities.scripts.python`。

### 10.3 常驻 Worker

```json
"workers": [{
  "id": "indexer",
  "module": "dist/host/workers/indexer.js",
  "autostart": true,
  "restart": "on-failure",
  "maxRestarts": 5,
  "resources": { "maxMemoryMb": 256 }
}]
```

- Supervisor 在 `app/onStartup` 后拉起  
- Host ↔ Worker：IPC + JSON 消息  
- 设置页展示：运行中 / 已停止 / 崩溃禁用  

---

## 11. 会话监听与改写（P5）

> **单独里程碑**；P0–P4 仅提供 `sessions.read` 与 `session/messageCommitted` 监听。

### 11.1 API（P5 开放）

| 方法 | 权限 | 审计 |
|------|------|------|
| `sessions.subscribe` | `sessions.read` | 无 |
| `sessions.setTitle` | `sessions.write` | 记录 |
| `sessions.appendMessage` | `sessions.mutate` | 记录 + 用户可见标记「由扩展 X 插入」 |
| `sessions.patchMessage` | `sessions.mutate` | 记录 + diff 快照 |
| Hook `agent/turnStart` patch | `sessions.mutate` | 记录 |

### 11.2 产品守卫

- 设置 → 扩展 → 权限卡片：**「修改对话内容」** 独立开关  
- 默认关闭；商店描述必须声明  
- 可选：用户每次会话首次改写前确认  

---

## 12. 官方扩展商店与签名

### 12.1 Registry（仅官方）

- 基址：`https://registry.opptrix.org/v1`（示例）  
- **不支持** 第三方 registry URL（降低供应链攻击面）  
- CLI `opptrix-ext publish` 需 `OPPTRIX_REGISTRY_TOKEN`  

### 12.2 API 摘要

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/extensions` | 搜索、分类 |
| GET | `/extensions/:id` | 元数据 + 版本列表 |
| GET | `/extensions/:id/:version/download` | `.opx` 流 |
| POST | `/extensions/:id/:version/publish` | 发布（CI / 人工审核后） |

### 12.3 客户端安装流

1. 设置 → 扩展商店 → 选择 → **安装**  
2. 下载 `.opx` → 校验 `CHECKSUMS` → **Ed25519 验签**（官方公钥内置）  
3. 解压到 `~/.opptrix/extensions/{id}/{version}/`  
4. `engines.opptrix` 兼容性检查  
5. 启用 → Supervisor 启动 Host 子进程 → `activate`  
6. UI Runtime 加载 `remoteEntry.js`  

### 12.4 升级 / 卸载 / 回滚

| 操作 | 行为 |
|------|------|
| **升级** | 下载新版本 → 并行安装 → 切换 `active` symlink → `deactivate` 旧 Host |
| **回滚** | 保留上一版本目录；一键切 symlink |
| **卸载** | `deactivate` → 杀进程 → 删 active；可选保留 `plugin-data` |

### 12.5 本地导入

| 模式 | 验签 | 用途 |
|------|------|------|
| 正式 | 必须 | 商店安装 |
| 开发者 | `OPPTRIX_EXT_DEV=1` 可跳过 | 本地文件夹 / 未签名 `.opx` |
| 企业 | 可配置附加公钥 | 未来；非 v1 |

---

## 13. CLI：`opptrix-ext`

### 13.1 命令

```bash
opptrix-ext create <name>       # 脚手架：mf remote + host + manifest
opptrix-ext dev                 # 联调：watch build + 连接本地 Opptrix
opptrix-ext build               # ui (federation) + host (bundle)
opptrix-ext pack                # .opx + checksums
opptrix-ext sign                # Ed25519（发布者密钥）
opptrix-ext publish             # 上传官方 registry
opptrix-ext doctor              # peer 版本、权限、体积、shared 契约
opptrix-ext compat              # 打印 engines 与当前宿主兼容性
```

### 13.2 双产物构建

| 产物 | 工具 | externals / shared |
|------|------|-------------------|
| `dist/ui/*` | Vite + MF plugin | shared: react, ui-kit, sdk/ui |
| `dist/host/*` | esbuild / tsup | external: `@opptrix/extension-sdk/host` only |
| 私有依赖 | `npm install --omit=peer` | 打入 `node_modules` 或 host bundle |

### 13.3 `doctor` 门禁

- UI bundle gzip > 150KB → warn  
- Host bundle 禁止 import `react`  
- `permissions` 非空  
- `engines.opptrix` 与当前 SDK 兼容  

---

## 14. 安全、隔离与审计

### 14.1 威胁模型

| 威胁 | 缓解 |
|------|------|
| 恶意商店包 | Ed25519 + 官方审核 + 权限最小化 |
| 扩展读密钥 | Vault 无明文；LLM key 不出宿主 |
| 扩展写任意文件 | Shell/脚本路径 allowlist + grant |
| 扩展卡死 UI | MF ErrorBoundary；Host 子进程隔离 |
| 扩展卡死 Server | RPC 超时；独立进程可 kill |
| 对话篡改 | P5 审计 + 用户授权 + 可见标记 |

### 14.2 审计日志

`~/.opptrix/logs/extensions/{id}.jsonl`：

```json
{"ts":"...","action":"sessions.patchMessage","sessionId":"...","msgId":"...","extensionId":"..."}
```

---

## 15. 与现有子系统映射

| 现有模块 | 扩展平台用法 |
|----------|--------------|
| `packages/agent` Engine | Hook 注入点；经 **ConversationHub** 统一入站；不替换 loop（v1） |
| `packages/agent/src/llm/provider.ts` | `ILlmService` / **LlmProvider**（模型后端，非对话通道） |
| `client-ui` 聊天 | **web** ConversationChannel 适配器 |
| `packages/schedule/src/notify*` | 迁入 **NotificationBus**（§19.6） |
| `client-ui/.../chatNotifications` | 废弃 Electron 路径 → in-app + websocket |
| `packages/agent-skills` | `ISkillService` + contributes.skills |
| `packages/agent-workspace` | `IShellService` |
| `packages/schedule` | `IScheduleService` + job kind 注册 |
| `packages/agent/src/mcp/external` | contributes.mcp |
| `packages/shared/tool-packs` | contributes.agentTools |
| `client-ui` | Shell + MF Host（浏览器） |
| `apps/server` | ExtensionManager + Route 转发 + WS EventStream |

---

## 16. 对照 DeepSeek Harness 能力矩阵

| Harness 能力 | Opptrix v1.1 | 阶段 |
|--------------|--------------|------|
| 一切皆插件 | 部分（核心仍内置） | P0–P4 |
| Profile / Bundle 分层 | 无 | P7 可选 |
| cordis.patch.yml | 无 | P7 可选 |
| 三分域事件 | **有**（+ conversation 域） | P1 |
| 多通道对话 / Bot | **ConversationChannel** | P4.5–P5.5 |
| 通知抽象 | **NotificationBus** | P2.5 |
| Agent loop 可替换 | 无 | 长期 |
| Session event log | 部分（SessionStore） | P2 强化 |
| Tool waterfall | **有** | P2 |
| UI 插件 | **MF Remote** | P2 |
| Reversible effects | **Disposable** | P1 |
| 官方/社区插件市场 | **仅官方** | P4 |
| Web 优先部署 | **是**（无 Electron 硬依赖） | P0 |

---

## 17. 架构短板与演进

1. **Engine 单体**：v1 靠 Hook 外挂；v2 考虑 `IAgentLoop` 注册  
2. **无 Profile 组合**：多扩展冲突靠 priority；后续引入 profile 层（对齐 Harness Bundle）  
3. **MF 版本耦合**：`engines.opptrix` + shared strictVersion 缓解  
4. **历史 Electron 通知路径**：`DESKTOP.md` 中 Electron 本地通知 **deprecated**；统一迁移至 NotificationBus（Web Push / in-app）  
5. **Self-Evolution Harness 命名**：`extension-*` vs `harness-evolve-*` 文档隔离  
6. **对话与模型曾混用**：通过 ConversationChannel vs LlmProvider 分层解决（§20）

---

## 18. 分阶段交付

| 阶段 | 交付物 | 验收 |
|------|--------|------|
| **P0** | SDK、manifest schema、Supervisor、**Platform 能力探测** | Host ping/pong；`platform.isWeb` |
| **P1** | Hook bus、JSON-RPC、**EventStream (WS)** | `events.subscribe` 示例 |
| **P2** | MF UI Host、sidebar/page、**in-app 通知** | 扩展 UI + toast |
| **P2.5** | **NotificationBus** 核心 channel（in-app/webhook/email） | 计划任务通知迁入 Bus |
| **P3** | `.opx`、本地安装、设置页 | 安装启用禁用卸载 |
| **P3.5** | `http.fetch`、`search`、`documents` 只读、`jobs.*` | 投研扩展 demo |
| **P4** | 官方 registry、验签、升级 | 端到端商店 |
| **P4.5** | **ConversationHub + web channel** 抽象落地 | 现有 Web 聊天走 Channel |
| **P5** | sessions.mutate、turn patch、审计、`auth.stepUp` | 安全评审 |
| **P5.5** | **扩展注册 ConversationChannel**（如 Telegram） | 官方示例 Bot 扩展 |
| **P6** | schedule/scripts/workers、`data.subscribe`、UI 细粒度插槽 | 常驻 worker + 行情订阅 |
| **P7** | 配额、telemetry、testing SDK、扩展互调、数据导出 | 商店扩展可观测 |

---

## 19. 通知系统（Notification Channel）

### 19.1 设计目标

- **统一抽象**：扩展、计划任务、Agent Job、系统事件均经 `NotificationBus` 发送  
- **多 Channel**：按用户偏好与场景路由；失败可降级、可重试  
- **Web 优先**：不依赖 Electron；浏览器侧用 **in-app + Web Push（可选）**  
- **与对话分离**：通知是「触达」；对话走 ConversationChannel（§20）

### 19.2 核心类型

```ts
/** 通知载荷（与 channel 无关） */
interface NotificationPayload {
  id: string
  source: { kind: 'system' | 'extension' | 'schedule' | 'agent' | 'job'; id: string }
  severity: 'info' | 'success' | 'warning' | 'error'
  title: string
  body: string
  actions?: Array<{ id: string; label: string; url?: string; command?: string }>
  target?: { sessionId?: string; page?: string }
  metadata?: Record<string, string>
  createdAt: string
}

/** Channel 插件接口 */
interface NotificationChannel {
  readonly channelId: string
  readonly displayName: string
  /** 是否可用（如 Web Push 未授权） */
  isAvailable(ctx: ChannelContext): Promise<boolean>
  deliver(payload: NotificationPayload, ctx: ChannelContext): Promise<DeliveryResult>
}

interface DeliveryResult {
  ok: boolean
  channelId: string
  error?: string
  retryable?: boolean
}
```

### 19.3 内置 Channel（v1）

| channelId | 说明 | Web | Docker 自托管 | 扩展可替代 |
|-----------|------|-----|---------------|------------|
| `in-app` | 应用内消息中心 + Toast | ✓ 默认 | ✓ | 否（内置） |
| `websocket` | 推送到已连接浏览器 Tab（实时） | ✓ | ✓ | 否 |
| `web-push` | PWA Service Worker Push | ✓ 可选 | ✓ 需配置 VAPID | 否 |
| `webhook` | HTTP POST（复用 schedule notify） | ✓ | ✓ | 扩展可注册变体 |
| `email` | SMTP（复用 schedule notify） | ✓ | ✓ | 否 |
| `extension.*` | 扩展贡献的 channel | ✓ | ✓ | **是** |

> **Electron 废弃**：原 `apps/desktop/electron/notifications.cjs` 路径不再作为扩展平台依赖；若遗留桌面壳存在，可实现为 **可选** `NotificationChannel` 适配器，非 v1 必选项。

### 19.4 NotificationBus 路由

```ts
interface NotificationBus {
  /** 扩展 / 系统发送 */
  publish(payload: NotificationPayload, opts?: {
    channels?: string[]           // 默认走用户偏好
    priority?: 'low' | 'normal' | 'high'
    dedupeKey?: string
  }): Promise<DeliveryResult[]>

  /** 用户偏好：某类事件走哪些 channel */
  getPreferences(userId: string): NotificationPreferences
  setPreferences(userId: string, prefs: NotificationPreferences): void
}
```

**路由规则（默认）**

| 事件类型 | 默认 channels |
|----------|---------------|
| 聊天完成（用户未在看会话） | `in-app` + `websocket`；可选 `web-push` |
| 计划任务失败 | `in-app` + `email`（若已配置） |
| 扩展告警 | `in-app` |
| 行情触发（扩展） | `in-app` + `websocket` |

### 19.5 扩展注册通知 Channel

```json
"contributes": {
  "notificationChannels": [{
    "id": "dingtalk",
    "title": "钉钉机器人",
    "module": "dist/host/channels/dingtalk.js",
    "permissions": ["notifications.channel"]
  }]
}
```

```ts
// activate 内
ctx.notifications.registerChannel({
  channelId: 'com.example.alpha/dingtalk',
  async deliver(payload) { /* ... */ },
})
```

### 19.6 与现有 `schedule/notify` 整合

- `packages/schedule/src/notify-dispatch.ts` 改为调用 `NotificationBus.publish`  
- 保留用户全局 Webhook/SMTP 配置（`docs/API.md` `/api/schedule/settings`）  
- `POST /api/schedule/notify/test` → `NotificationBus` 测试指定 channel  

### 19.7 API（扩展 SDK）

```ts
ctx.notifications.send({
  title: '任务完成',
  body: '每日摘要已生成',
  severity: 'success',
  channels: ['in-app', 'webhook'],
  actions: [{ id: 'open', label: '查看', page: '/ext/alpha/main' }],
})
```

权限：`notifications.send`；注册 channel 需 `notifications.channel`。

---

## 20. 对话系统（Conversation Channel）

### 20.1 设计目标

- **抽象对话入口**：Web 聊天只是默认 Channel 之一  
- **统一会话模型**：无论来自浏览器还是 Telegram，消息进入同一 `SessionStore`  
- **与 LlmProvider 分离**：Channel 负责传输格式；Engine 负责推理  
- **扩展可注册**：机器人、企业 IM、远程 HTTP 对话 API

### 20.2 核心类型

```ts
/** 对话通道 — 「消息从哪来、回哪去」 */
interface ConversationChannel {
  readonly channelId: string
  readonly displayName: string

  /** 启动监听（webhook long-polling / bot SDK） */
  start(ctx: ConversationChannelContext): Promise<void>
  stop(): Promise<void>

  /** 入站：外部消息 → 标准化 */
  normalizeInbound(raw: unknown): InboundMessage | null

  /** 出站：助手回复 → channel 特定格式 */
  deliverOutbound(msg: OutboundMessage, ctx: ConversationChannelContext): Promise<void>

  /** 流式增量（可选） */
  deliverOutboundDelta?(delta: OutboundDelta, ctx: ConversationChannelContext): Promise<void>
}

interface InboundMessage {
  channelUserId: string
  channelChatId: string
  text: string
  attachments?: AttachmentMeta[]
  /** 映射到 Opptrix session；不存在则创建 */
  sessionKey: string
}

interface OutboundMessage {
  sessionId: string
  text: string
  attachments?: AttachmentMeta[]
  isFinal: boolean
}
```

### 20.3 ConversationHub（编排器）

```ts
interface ConversationHub {
  /** 注册 channel（内置 web + 扩展） */
  registerChannel(channel: ConversationChannel): Disposable

  /** 入站统一入口 */
  async ingest(inbound: InboundMessage, channelId: string): Promise<void> {
    // 1. 鉴权 / 映射用户
    // 2. resolve 或 create session（sessionKey = `${channelId}:${channelChatId}`）
    // 3. 持久化 user message
    // 4. 调用 Agent Engine.chat（与 Web UI 相同路径）
    // 5. 流式/最终回复经 channel.deliverOutbound
  }

  /** Web UI 发送消息 — 走 web channel 适配器 */
  sendFromWeb(sessionId: string, text: string, opts?): Promise<ChatResult>
}
```

### 20.4 内置 Channel

| channelId | 说明 | 默认 |
|-----------|------|------|
| `web` | 现有 `client-ui` 聊天 + SSE/WS 流式 | **✓ 默认** |
| `api` | REST：`POST /api/sessions/:id/chat`（远程集成） | 内置 |
| `extension.*` | 扩展注册（Telegram、Slack、企业微信等） | 可选 |

### 20.5 Web Channel 行为（兼容现有）

- 现有 Web 聊天 **不改用户感知**；内部改为 `ConversationHub.sendFromWeb`  
- SSE/WebSocket 推送 = `web` channel 的 `deliverOutboundDelta`  
- 会话 `meta.channel = 'web'` 写入 SessionStore  

### 20.6 扩展注册对话 Channel 示例（Telegram）

```json
"contributes": {
  "conversationChannels": [{
    "id": "telegram",
    "title": "Telegram 机器人",
    "module": "dist/host/channels/telegram.js",
    "permissions": ["conversation.channel", "sessions.read", "llm"]
  }]
}
```

```ts
export function activate(ctx: ExtensionHostContext) {
  ctx.conversation.registerChannel({
    channelId: 'com.example.bot/telegram',
    async start({ secrets }) {
      const token = await secrets.get('telegram_bot_token')
      // 启动 bot long-polling / webhook endpoint: /api/ext/.../telegram/webhook
    },
    normalizeInbound(update) { /* Telegram Update → InboundMessage */ },
    async deliverOutbound(msg) { /* sendMessage */ },
  })
}
```

### 20.7 远程对话 API（`api` channel）

供外部系统集成，无需写扩展：

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/conversation/:channelId/inbound` | 入站（需 API token + 签名校验） |
| GET | `/api/sessions/:id/stream` | 出站流（已有会话流可复用） |

扩展可包装为更复杂协议（gRPC、消息队列），但 **必须** 汇入 `ConversationHub.ingest`。

### 20.8 LlmProvider 与扩展

**LlmProvider**（模型后端）仍可扩展注册，但属于 **DI `LLM` 服务**，不是 ConversationChannel：

```ts
ctx.llm.registerProvider({
  providerId: 'com.example.custom-llm',
  async chat(messages, tools, signal, opts) { /* ... */ },
})
```

关系：

```
ConversationChannel  →  传输与身份
Agent Engine         →  推理编排
LlmProvider          →  模型 API
NotificationBus      →  旁路提醒
```

### 20.9 Hook 集成

| Hook | 用途 |
|------|------|
| `conversation/inbound` | 入站消息后、入 Engine 前 |
| `conversation/outbound` | 出站前格式化 |
| `agent/turnStart` / `turnEnd` | 与现有 Agent hook 共用 |

---

## 21. 扩展 Host API 完整目录

> 汇总 §7–§20 及前序缺口分析，作为 SDK 实现的 **单一清单**。

### 21.1 平台与鉴权

| API | 说明 |
|-----|------|
| `platform.getInfo()` | `{ deployment: 'web'|'docker', features: string[] }` |
| `platform.supports(feature)` | 能力探测（无 Electron 假设） |
| `auth.whoami()` | 当前用户 |
| `auth.requestStepUp(reason)` | 敏感操作步进验证 |

### 21.2 事件（推送）

| API | 说明 |
|-----|------|
| `events.subscribe(topic, handler)` | `chat.*` `job.*` `market.*` `schedule.*` |
| `events.unsubscribe(id)` | 取消订阅 |

### 21.3 数据与投研

| API | 说明 |
|-----|------|
| `data.query(ref, capability, opts?)` | 一次性查询 |
| `data.subscribe(ref, capability, onData)` | 订阅（背压、取消） |
| `search.instruments(q)` | 名录搜索 |
| `search.documents(q)` | 文档库搜索 |
| `documents.list / ingest / semanticQuery` | 文档库 |
| `watchlist.*` / `portfolio.*` | 关注与持仓 |

### 21.4 Agent 与作业

| API | 说明 |
|-----|------|
| `agent.registerTool(...)` | Tool Pack 注册 |
| `agent.injectPromptFragment(sessionId, text)` | 会话级 prompt（可撤销） |
| `agent.getContextRef(sessionId)` | 当前标的/组合上下文 |
| `jobs.registerKind / list / cancel / watch` | 统一后台 Job |

### 21.5 执行环境

| API | 说明 |
|-----|------|
| `shell.run(...)` | 沙盒命令 |
| `scripts.run({ runtime })` | 脚本（§24：`node`/`python`/`wasm`/`oci`/`custom`） |
| `workers.register({ autostart })` | 常驻 Worker |
| `http.fetch(url, opts)` | 受控 HTTP |

### 21.6 文件与存储

| API | 说明 |
|-----|------|
| `storage.plugin` | KV（扩展私有，§23.4） |
| `db.user` | 宿主 user-store 白名单（§23.3） |
| `db.plugin` | 扩展私有 SQLite（§23.5，P6） |
| `fs.readAsset / writePluginData` | 包内资产与数据目录 |
| `fs.pickFile / pickFolder` | Web：`<input type=file>`；无原生对话框依赖 |
| `data.exportPlugin / importPlugin` | 卸载可携带数据 |

### 21.7 UI（MF）

| API | 说明 |
|-----|------|
| `ui.getTheme()` / `onThemeChange` | 亮暗色 |
| `ui.registerCommand` | 命令 |
| `contributions.*` | manifest 声明式 + 动态注册 |

### 21.8 自进化 Harness 边界

| API | 说明 |
|-----|------|
| `harness.getActiveOverlay()` | 只读 |
| `harness.proposePatch(...)` | 审核通道（禁止直写技能） |

### 21.9 扩展互操作（P7）

| API | 说明 |
|-----|------|
| `extensions.getExportedApi(pluginId, exportName)` | 显式导出 |
| manifest `requires: ["com.foo@^1"]` | 依赖声明 |

### 21.10 配额（P7）

| 限制 | 默认 |
|------|------|
| LLM tokens / 日 / 扩展 | 可配置 |
| 并发 shell / 扩展 | 3 |
| 常驻 worker / 扩展 | 3 |
| HTTP 带宽 | 令牌桶 |

---

## 22. 部署兼容矩阵（Web / Docker / PWA）

| 能力 | Web 浏览器 | PWA | Docker 自托管 |
|------|------------|-----|---------------|
| MF 扩展 UI | ✓ | ✓ | ✓ |
| Extension Host 子进程 | ✓（server 侧） | ✓ | ✓ |
| in-app / websocket 通知 | ✓ | ✓ | ✓ |
| Web Push | ✓ 需授权 | ✓ | 需 VAPID 配置 |
| Webhook / Email 通知 | ✓ | ✓ | ✓ |
| Shell / Python 脚本 | ✓（server） | ✓ | ✓ 仅系统 python3 |
| 文件选择 | `<input file>` | 同左 | 同左 |
| ConversationChannel `web` | ✓ 默认 | ✓ | ✓ |
| 扩展 Bot（webhook 入站） | ✓ | ✓ | ✓ 需公网 URL |
| Electron 原生通知 | **不依赖 / 非目标** | — | — |

**manifest 声明**

```json
"capabilities": {
  "web": true,
  "docker": true,
  "requiresPublicUrl": false,
  "scripts": { "node": true, "python": true }
}
```

`opptrix-ext doctor` 在目标部署不满足时警告。

---

## 23. 存储与数据库能力

### 23.1 现状：Opptrix 多存储分层（扩展须理解、不可直连）

| 层级 | 路径 / 包 | 引擎 | 用途 | 扩展默认 |
|------|-----------|------|------|----------|
| **用户库** | `~/.opptrix/opptrix.db` · `@opptrix/user-store` | SQLite | 配置、会话、关注、计划任务、Vault、MCP 配置、资讯 FTS | 经 `IUserDbService` **只读/受限写** |
| **行情库** | `market.db` · `@opptrix/market-data` | SQLite + DuckDB | 名录、K 线、同步元数据 | **禁止直连**；经 `data.query` / `data.subscribe` |
| **文档库** | `doc-library.db` · `@opptrix/doc-library` | SQLite + FTS | 研报切块、解析产物 | 经 `IDocumentService` |
| **向量库** | `~/.opptrix/lancedb/` | LanceDB | 研报语义检索 | 经 `documents.semanticQuery` |
| **资讯库** | `news.db` · `@opptrix/news-feed` | SQLite | RSS 文章 | 经 `search` / Hub（无裸 SQL） |
| **文件系统** | `~/.opptrix/` 子目录 | FS | blob、附件、workspace、模型权重 | 经 `IFileService` 白名单路径 |
| **扩展私有** | `plugin-data/{pluginId}/` | FS + 可选 SQLite | 扩展自有数据 | **默认入口** |

> **硬性原则**：扩展 **禁止** `import better-sqlite3`、禁止打开宿主库文件路径；一切经 DI Adapter + PolicyProxy。

### 23.2 扩展侧存储模型（三层）

```
┌─────────────────────────────────────────────────────────────┐
│ Layer A — storage.plugin（默认，P3）                         │
│   KV：get/set/delete/list · JSON 文档 · 按 pluginId 隔离      │
│   实现：plugin-data/{id}/kv.json 或 LevelDB/SQLite 单表       │
├─────────────────────────────────────────────────────────────┤
│ Layer B — storage.pluginDb（P6，可选权限 db.plugin）         │
│   扩展私有 SQLite：~/.opptrix/plugin-data/{id}/data.db       │
│   仅扩展 namespace 表；宿主迁移框架 opptrix_plugin_migrations │
├─────────────────────────────────────────────────────────────┤
│ Layer C — IUserDbService（权限 db.user，强审核）             │
│   访问宿主 user-store **白名单 namespace**（见 23.3）         │
│   只读为主；写操作须声明用途 + 审计                           │
└─────────────────────────────────────────────────────────────┘
```

### 23.3 `IUserDbService` 契约（宿主 user-store 受限门面）

```ts
/** 扩展可申请的 namespace 白名单（v1） */
type UserDbNamespace =
  | `ext:${string}`           // 扩展自有 JSON 文档（推荐，等同 Layer A 但进主库）
  | 'user_preferences'        // 只读：用户全局偏好投影
  | 'watchlist'               // 读 + 经 API 写（非裸 setDocument）
  | 'portfolio'               // 读 + 经 API 写

interface IUserDbService {
  /** JSON 文档 CRUD — namespace 必须在 manifest 声明 */
  get<T>(ns: UserDbNamespace, id: string): Promise<T | null>
  set(ns: UserDbNamespace, id: string, data: unknown): Promise<void>
  delete(ns: UserDbNamespace, id: string): Promise<void>
  listPage<T>(ns: UserDbNamespace, opts?: { limit?: number; after?: Cursor }): Promise<Page<T>>

  /** 结构化查询 — 仅 ext:{pluginId} 且启用 db.plugin.sql 时 */
  query?(sql: string, params?: unknown[]): Promise<Row[]>

  /** 禁止**：任意 SQL、访问 session/provider_settings/vault 等敏感表
}
```

| 数据域 | 扩展访问方式 | 说明 |
|--------|--------------|------|
| 会话 `session` | `ISessionService` | 不经 `IUserDbService` 直读 JSON |
| Provider 密钥 | `IVaultService` | 永不暴露明文 |
| 行情 / K 线 | `IDataQueryService` | 引擎统一 capability |
| 文档 / 向量 | `IDocumentService` | 语义检索封装 |
| 计划任务 | `IScheduleService` | 注册 job kind，非直写表 |
| 扩展配置 | `storage.plugin` 或 `ext:{id}` | 默认路径 |

### 23.4 `IPluginStorageService`（Layer A，默认）

```ts
interface IPluginStorageService {
  get<T>(key: string): Promise<T | null>
  set(key: string, value: unknown): Promise<void>
  delete(key: string): Promise<void>
  keys(prefix?: string): Promise<string[]>
  /** 原子批量 */
  transaction(fn: (tx: PluginStorageTx) => Promise<void>): Promise<void>
}
```

- 路径：`~/.opptrix/plugin-data/{pluginId}/`
- 卸载：`data.exportPlugin` 打包；用户可选保留或删除
- 配额：单扩展默认 **64MB**（可配置）；超限拒绝写

### 23.5 `IPluginDbService`（Layer B，P6）

```ts
interface IPluginDbService {
  /** 扩展私有 SQLite，表名须前缀 plugin_ */
  exec(sql: string, params?: unknown[]): Promise<void>
  query<T>(sql: string, params?: unknown[]): Promise<T[]>
  migrate(steps: PluginMigrationStep[]): Promise<void>
}
```

- 文件：`plugin-data/{pluginId}/data.db`
- 迁移：扩展在 `dist/host/migrations/` 声明；`opptrix-ext doctor` 校验
- **禁止** ATTACH 宿主库、禁止 `PRAGMA` 危险项
- 商店默认 **不授予** `db.plugin`；企业自托管可开

### 23.6 与现有 `UserDataStore` 映射

| UserDataStore API | 扩展 SDK 映射 |
|-------------------|---------------|
| `getDocument/setDocument` | `storage.plugin` 或 `db.user` 白名单 ns |
| `listDocumentPage` | `db.user.listPage` |
| `providerSettings.*` | **不暴露** |
| `agentVault.*` | `IVaultService` |
| `schedule.*` | `IScheduleService` |
| FTS `searchSessions` | `ISearchService.searchSessions` |

### 23.7 Web / 多用户部署注意

| 场景 | 策略 |
|------|------|
| 单用户自托管（v1 默认） | `~/.opptrix` 即当前用户 |
| 多用户 SaaS（长期） | 每用户独立 data root 或租户前缀；`IUserDbService` 注入 `userId` scope |
| 无状态 K8s | 挂载 PVC；`plugin-data` 随用户卷走 |

---

## 24. 多语言运行时

### 24.1 目标与边界

- **目标**：扩展能用多种语言实现逻辑，同时保持进程隔离与可审计
- **边界**：浏览器 UI 仍为 **TypeScript/React（MF）**；其他语言跑在 **服务端子进程**

### 24.2 运行时分级

| 级别 | 机制 | 语言示例 | 沙盒 | 阶段 |
|------|------|----------|------|------|
| **L0 Host** | Extension Host 主模块 | TypeScript → JS | 子进程 + 权限 | P0 |
| **L1 脚本** | `scripts.run` 一次性子进程 | **Node**、**Python** | cwd/网络/超时 | P3 |
| **L2 Shell** | `shell.run` | 任意 CLI（ruby、go、bash…） | Seatbelt/bwrap + allowlist | P3 |
| **L3 WASM** | `scripts.run({ runtime: 'wasm' })` | Rust/Go/C→WASM、QuickJS | 内存/燃料限制 | P7 |
| **L4 容器** | `scripts.run({ runtime: 'oci' })` | 任意镜像内语言 | Docker 命名空间（仅 docker 部署） | 长期 |

### 24.3 `scripts.run` 扩展契约

```ts
ctx.scripts.run({
  runtime: 'node' | 'python' | 'wasm' | 'oci' | 'custom',
  entry: 'scripts/analysis.py',
  args: ['--symbol', '600519'],
  cwd: 'plugin-root' | 'plugin-data' | 'workspace:default',
  env: Record<string, string>,        // 禁止覆盖 PATH 除非权限 scripts.env
  timeoutMs: 120_000,
  network: 'deny' | 'allowlist' | 'host-only',
  /** custom / oci 专用 */
  command?: string[],
  image?: string,
})
```

**manifest 声明**

```json
"capabilities": {
  "scripts": {
    "node": true,
    "python": true,
    "wasm": false,
    "oci": false,
    "custom": ["ruby", "lua"]
  }
}
```

| runtime | 解释器来源 | Web/Docker |
|---------|------------|------------|
| `node` | 宿主 Node + 插件 `node_modules` | ✓ |
| `python` | 系统 `python3`（Docker 镜像内） | ✓ |
| `custom` | `which` 检测 + manifest 白名单 | ✓ 需镜像预装 |
| `wasm` | wasmtime / wasmer 内嵌 | ✓ 推荐跨语言默认路径 |
| `oci` | `docker run` 一次性容器 | 仅 docker 且需 `scripts.oci` |

### 24.4 「自由编程语言」推荐路径

1. **v1 实用组合**：TypeScript（Host/UI）+ Python（量化/数据脚本）+ `shell.run` 调用已安装 CLI  
2. **v2 可移植扩展**：WASM 作为「任意语言编译目标」— 扩展作者用 Rust/Go/Zig 编译 wasm，宿主统一执行  
3. **企业自托管**：OCI 一次性容器跑 R/Julia/MATLAB 等重环境，不与宿主污染  

**不推荐 v1**：无沙盒的任意 `exec` 或扩展自带解释器安装 — 供应链与逃逸风险过高。

### 24.5 常驻 Worker 与语言

- Worker 入口 **仅支持 JS/TS**（`dist/host/workers/*.js`）  
- 其他语言：Worker 内 `scripts.run` 派生子进程，或 WASM 模块热加载  
- Python 长驻：可选 `workers.pythonModule`（P6）— 单进程复用解释器，仍受 Supervisor 监管

---

## 25. 能力缺口审计（v1.1）

### 25.1 存储 / 数据库

| 缺口 | 严重度 | 状态 |
|------|--------|------|
| `@opptrix/plugin-storage` KV + export | 高 | **已实现**（P3 基础） |
| `UserDbFacade` 白名单 | 高 | **已实现**（待接入 Extension Host） |
| `IPluginDbService` 私有 SQL 表 | 中 | P6 |
| 多租户 `userId` scope | 中 | SaaS 前 |
| Lance/Duck 只读适配器 | 低 | P3.5 |
| storage 配额监控 UI | 中 | P7 |

### 25.1b 事件系统

| 缺口 | 严重度 | 状态 |
|------|--------|------|
| `@opptrix/event-bus` 进程内 Dispatcher | 高 | **已实现** |
| 宿主各子系统 emit 接线 | 高 | P1（JobRegistry 等） |
| WebSocket `EventStream` 桥接 | 高 | P1 |
| 扩展 `events.emit` 自定义事件 | 中 | P3 |
| 事件持久化 / 回放 | 低 | 长期 |
| 跨进程扩展 Host 事件转发 | 中 | P1 JSON-RPC `events/emit` |

### 25.2 执行 / 语言

| 缺口 | 严重度 | 建议阶段 |
|------|--------|----------|
| 仅 node/python 一等公民 | 中 | P3 起 shell 兜底 |
| WASM 运行时 | 中 | P7 |
| OCI 脚本 | 低 | 企业版 |
| Python 长驻 Worker | 低 | P6 |
| 脚本产物回传（artifact）标准 | 中 | P3.5 |

### 25.3 平台能力（设计有、待实现）

| 缺口 | 阶段 |
|------|------|
| NotificationBus / ConversationHub | P2.5 / P4.5 |
| `events.subscribe` WS | P1 |
| `data.subscribe` 背压 | P6 |
| `http.fetch` egress | P3.5 |
| `auth.stepUp` | P5 |
| 扩展互调 `getExportedApi` | P7 |
| i18n：扩展文案 `locales/` 加载 | P4 |
| 扩展调试器 / RPC trace | P4 |
| 扩展配置 JSON Schema 设置 UI 自动生成 | P4 |
| Canvas / Artifacts 贡献点 | P6 |
| 离线 PWA 与 storage 同步 | 长期 |

### 25.4 安全 / 运维

| 缺口 | 说明 |
|------|------|
| 扩展网络 egress 域名白名单 UI | 与 `http.fetch` 同步 |
| 扩展审计日志查询 API | 合规 |
| 扩展崩溃报告脱敏上传（可选） | 商店质量 |
| 跨扩展数据泄露防护 | namespace 强制 `ext:{pluginId}` 前缀 |

---

## 26. 事件总线 vs Hook 总线

> **结论：不冲突，互补。** Hook = 可改写拦截点；Event = 可观测广播 + 扩展自定义消息。  
> 实现包：`@opptrix/event-bus`（Symfony `EventDispatcher` 语义）+ §8 Hook Bus（Harness 语义）。

### 26.1 对照表（Symfony / Harness / Opptrix）

| 维度 | Symfony EventDispatcher | Opptrix **Event Bus** | Opptrix **Hook Bus** |
|------|-------------------------|----------------------|----------------------|
| 目的 | 解耦通知 | 系统事实广播 + UI/扩展订阅 | 生命周期**拦截**与改写 |
| 监听注册 | `addListener` / `EventSubscriber` | `on()` / `subscribeTopic()` | `hook/register` RPC |
| 分发 | `dispatch($event)` | `dispatch()` + `emit(envelope)` | `host/hook` 至扩展子进程 |
| 可改写 payload | 仅当 Event 对象可变 | **否**（只读 envelope） | **是**（waterfall / patch） |
| 优先级 | `priority` 整数 | `priority` 整数 | manifest `priority` |
| 停止传播 | `stopPropagation()` | `BaseEvent.stopPropagation()` | `abort: true` 短路 |
| 异步 | `KernelEvents` 可 defer | `emit` 可接 WS；listener 默认同步 | 混合（turn 同步 100ms 预算） |
| 扩展自定义 | 任意 event class/name | `ext.{pluginId}.{name}` | 仅 manifest 声明的 hook 点 |
| 跨进程 | 单进程 | 进程内 + **WS 扇出** | **必须**跨 Extension Host |

### 26.2 命名约定（避免混用）

| 机制 | 分隔符 | 示例 |
|------|--------|------|
| Hook | `/` | `agent/turnStart` |
| Event Bus | `.` | `chat.turn.start` |
| 扩展自定义 Event | `ext.` 前缀 | `ext.com.foo.taskDone` |
| Topic 订阅 | `*` 通配 | `job.*`、`ext.com.foo.**` |

`HookToBusMap`（`@opptrix/event-bus`）在 Hook 执行**之后**向 Bus `emit` 只读副本，供 UI / 其他扩展观察，**不回写** Hook 结果。

### 26.3 Event Bus 完整机制

#### 26.3.1 注册

```ts
// 宿主 / 扩展 Host 内（进程内）
dispatcher.on('chat.turn.end', (event) => { /* ... */ }, 10)

// Symfony 风格 Subscriber
class JobMetricsSubscriber {
  getSubscribedEvents() {
    return { 'job.terminal': 'onTerminal', 'job.progress': ['onProgress', -10] }
  }
  onTerminal(event: BaseEvent) { /* ... */ }
}

// 浏览器 / 扩展：WebSocket
events.subscribe('job.*', (envelope) => { /* ... */ })
```

#### 26.3.2 广播（系统 + 扩展）

```ts
// 宿主发出系统事件
dispatcher.emit(SystemEvents.job.terminal, { jobId, state: 'completed' })

// 扩展发出自定义事件（需 events.emit 权限）
dispatcher.emit(extensionEventName('com.example.alpha', 'digestReady'), { rows: 12 }, {
  kind: 'extension',
  id: 'com.example.alpha',
})
```

#### 26.3.3 监听与卸载

- 进程内：`on()` 返回 `dispose()`  
- WS：`events.unsubscribe(subscriptionId)`  
- 扩展 `deactivate`：自动注销该 extensionId 注册的所有 listener

### 26.4 扩展自定义事件：要支持

| 能力 | 权限 | 说明 |
|------|------|------|
| `events.emit` | `events.emit` | 广播 `ext.{pluginId}.*` |
| `events.subscribe` | `events.subscribe` | 可订系统 topic + 其他扩展 **公开** 事件 |
| `events.declare` | manifest `contributes.events` | 文档化事件 schema，商店展示 |

**规则**

1. 扩展默认只能 emit 自己的 `ext.{pluginId}.*`  
2. 订阅其他扩展事件需在 manifest 声明 `watches: ["ext.com.other.done"]`  
3. 禁止订阅 `vault.*`、`auth.*` 等敏感 topic  
4. 自定义事件 payload 须 JSON 可序列化；单条 ≤ 64KB

### 26.5 与 NotificationBus 边界

| | Event Bus | NotificationBus |
|---|-----------|-----------------|
| 受众 | 开发者 / 扩展 / 连接中的 UI | **最终用户** |
| 持久化 | 否（仅在线 WS） | 可 in-app 历史 |
| 用途 | 「发生了什么」 | 「请用户注意」 |

Job 完成：先 `emit(job.terminal)` → NotificationBus 根据用户偏好发 toast。

### 26.6 仍缺能力（事件专项）

| 缺口 | 阶段 |
|------|------|
| `apps/server` WebSocket `/api/events/stream` | P1 |
| JobRegistry / SessionStore / Schedule → emit 接线 | P1 |
| Extension Host RPC `events/register` `events/emit` | P1 |
| `contributes.events` schema + 商店文档 | P4 |
| 事件审计日志（合规查询） | P7 |
| 离线事件队列（PWA reconnect 补发） | 长期 |

### 26.7 实现状态

| 包 | 内容 |
|----|------|
| `@opptrix/plugin-storage` | `SqlitePluginKvStore`、`UserDbFacade`、`exportPluginData` |
| `@opptrix/event-bus` | `EventDispatcher`、`SystemEvents`、`HookToBusMap`、`topicMatches` |

---

## 27. 附录：流程图与脑图

> 详细 Mermaid 图源码见同目录 **[EXTENSION-PLATFORM-DIAGRAMS.md](./EXTENSION-PLATFORM-DIAGRAMS.md)**。

包含：

1. 系统架构总图  
2. 扩展生命周期状态机  
3. 商店安装序列图  
4. Module Federation 加载流  
5. 聊天 Turn Hook 流  
6. 能力脑图（Mindmap）  
7. 包结构与 CLI 流程  

---

## 文档变更

| 版本 | 日期 | 说明 |
|------|------|------|
| 1.0 | 2026-09-03 | 初始设计：MF + 子进程 Host + 官方商店 + 签名 |
| 1.1 | 2026-09-03 | Web 优先（去 Electron 依赖）；Notification Channel；Conversation Channel；完整 Host API；部署矩阵 |
| 1.2 | 2026-09-03 | 存储与数据库三层模型；多语言运行时分级；能力缺口审计表 |
| 1.3 | 2026-09-03 | 实现 `@opptrix/plugin-storage`、`@opptrix/event-bus`；§26 Event vs Hook |
| 2.0 | 2026-09-03 | **抽象架构独立成文** [EXTENSION-PLATFORM-ARCHITECTURE.md](./EXTENSION-PLATFORM-ARCHITECTURE.md)；本文降为规格附录 |
