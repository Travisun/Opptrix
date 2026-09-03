# Opptrix 扩展平台 — 抽象架构 v2.5

> **定位**：扩展平台的**唯一抽象架构入口**（先结构、后功能）。  
> **上位内核**：[AI-OS-KERNEL.md](./AI-OS-KERNEL.md) — Agent Gate / Session / Memory / Jobs；本文 Gateway 与内核 **同源 ABI**。  
> **产品演进**：近端 = 投研工作台；远端 = **通用 Agent 运行时**（可承载编程终端 / 任意领域解决方案）。  
> **状态**：设计稿（未实现）  
> **运行形态**：Web 优先（浏览器 / Docker 自托管）；不依赖 Electron  
> **详细规格**：见 [EXTENSION-PLATFORM.md](./EXTENSION-PLATFORM.md)（以本文 MVP 与通用原语为准）  
> **勿混用**：[Self-Evolution Harness](./SELF-HARNESS-PRODUCT.md) ≠ 本扩展平台

---

## 目录

**Part I — 抽象架构**

1. [问题域与边界](#1-问题域与边界)
2. [四层平面模型](#2-四层平面模型)
3. [扩展如何接入：双轴模型](#3-扩展如何接入双轴模型)
4. [统一交互三元组](#4-统一交互三元组hook--event--alert)
5. [推理与对话：两个正交维度](#5-推理与对话两个正交维度)
6. [存储模型](#6-存储模型)
7. [运行时与隔离](#7-运行时与隔离)
8. [治理：权限、签名、生命周期](#8-治理权限签名生命周期)
9. [平台韧性铁律（R0 / R1）](#9-平台韧性铁律r0)
10. [通用运行时原语 vs 领域包](#10-通用运行时原语-vs-领域包)

**Part II — 能力目录**

11. [MVP 能力包（投研首发）](#11-mvp-能力包投研首发)
12. [Phase B / C](#12-phase-b--c)
13. [Phase D — 编程终端与任意解决方案](#13-phase-d--编程终端与任意解决方案)

**Part III — 交付**

14. [四阶段路线图](#14-四阶段路线图)
15. [已锁定 ADR](#15-已锁定-adr)
16. [与现有代码包映射](#16-与现有代码包映射)

---

# Part I — 抽象架构

## 1. 问题域与边界

### 1.1 扩展平台是什么

在 **不修改 Opptrix 核心仓库** 的前提下，让第三方或官方团队能够：

- 贡献 **UI**（侧栏、页面）
- 注册 **行为**（Hook 拦截、计划任务、工具）
- 调用 **平台能力**（LLM、会话、脚本、领域 API…）
- 拥有 **私有持久化**
- 经 **官方商店** 或本地包安装，并受 **权限 + 签名** 约束

### 1.1b 战略三层（产品能力分层）

> 你所说的「三层架构」指这一层。**全部** Harness 对齐能力与投研/编程能力都落在这三层内；不另起第四套产品模型。

```
┌──────────────────────────────────────────────────────────┐
│ ③ Extensions（.opx 扩展）                                 │
│    第三方/官方插件：UI · Hook · tools · 领域功能组装       │
│    只能调 ①② 经 Gateway 暴露的 Token；自带私有依赖        │
├──────────────────────────────────────────────────────────┤
│ ② Domain Packs（领域包 · 可替换可叠加）                    │
│    research（首发）· coding（Phase D）· 任意垂直方案       │
│    实现落在 L2 Core，经 Adapter 暴露；可官方内置或审核包  │
├──────────────────────────────────────────────────────────┤
│ ① Platform Primitives（通用运行时原语 · 稳定）             │
│    llm · sessions · storage · shell/scripts · tools/skills│
│    jobs · approval · Hook/Event/Alert · Host/MF/商店/R0  │
└──────────────────────────────────────────────────────────┘
```

| 层 | 变不变 | 谁实现 | 例子 |
|----|--------|--------|------|
| ① Primitives | 长期稳定 | Core + Extension Runtime | `ctx.llm`、`ctx.storage`、`ctx.on` |
| ② Domain Packs | 按产品线增减 | Core 模块或官方 Pack | `data.query`、`terminals` |
| ③ Extensions | 商店/本地可插拔 | `.opx` Host+MF | 钉钉通知、专家 UI、Bot |

- **近端**：① + ②`research` + 少量 ③  
- **远端**：同一 ① 上叠加 ②`coding` 或任意 Pack + 更多 ③  
- **禁止**：行情进 ①；Terminal 硬塞进 MVP；扩展直连 L2 内部包  

#### 与运行时四平面的映射（正交，不冲突）

| 产品三层 | 主要落在 | 说明 |
|----------|----------|------|
| ① Primitives | L2 实现 + L3 Gateway 暴露 + L4 鉴权 | Runtime（L3）负责把原语 RPC 出去 |
| ② Domain Packs | **L2** 领域实现；L3 按 `domainPacks` 开关 Token | Pack 未启用 → Gateway 拒绝 |
| ③ Extensions | **L3** Host 子进程 + **L1** MF UI | 治理走 L4 |

```
产品三层（能力归属）     运行时四平面（部署/隔离）
③ Extensions      →     L1 UI + L3 Host
② Domain Packs    →     L2 Core（Adapter 出）
① Primitives      →     L2 + L3 Gateway + L4
                         L4 横切全部
```

**结论**：是的——规划中的能力都在产品三层内；四平面是**同一设计的运行时投影**，不是另一套架构。

### 1.2 不是什么

| 概念 | 关系 |
|------|------|
| Self-Harness | 独立产品线；禁止共用 `extension-*` 与 `harness-*` 命名空间 |
| External MCP | 已有；扩展可 `contributes.mcp`，但不替代 MCP 协议 |
| Provider 插件 | 已有 `@opptrix/provider-sdk`；行情 Provider **不**走扩展 Host |
| 任意用户脚本 | 必须打包为 `.opx` + 声明权限；无「粘贴 JS 就运行」 |
| 立刻做全量 IDE | Phase D；不阻塞 A–C |

### 1.3 设计约束（不可妥协）

1. **Web 优先**：浏览器 + `apps/server`；无 Electron 硬依赖  
2. **Host 唯一入口**：扩展禁止 `import @opptrix/agent` 等内部包  
3. **进程隔离**：扩展逻辑在服务端 **独立子进程**  
4. **可撤销**：`activate()` 注册的一切必须在 `deactivate()` 清理  
5. **权限先行**：manifest 声明 → 运行时 PolicyProxy 强制  
6. **R0 / R1 平台韧性**：扩展不得阻塞启动；关闭有界 best-effort（§9）  
7. **原语 / 领域分离**：Platform Primitives 领域无关；领域能力进 Domain Pack（§10）

---

## 2. 四层平面模型

所有功能都落在这四层之一；**禁止跨层直连**。

```
┌─────────────────────────────────────────────────────────────────┐
│ L1  Presentation Plane（呈现平面）                               │
│  App Shell · Module Federation Host · 贡献点插槽                  │
│  职责：渲染、路由、加载 remoteEntry                               │
│  禁止：LLM 调用、SQLite、扩展业务逻辑                             │
└────────────────────────────┬────────────────────────────────────┘
                             │ HTTPS + WS
┌────────────────────────────▼────────────────────────────────────┐
│ L2  Platform Plane（平台平面）= Opptrix Core               │
│  Agent Engine · SessionStore · Domain Pack 实现 · stores │
│  职责：Primitives 实现 + 已启用 Domain Pack 的领域逻辑     │
│  扩展不可 import；仅经 L3 Adapter 暴露                     │
└────────────────────────────┬────────────────────────────────────┘
                             │ Adapter（DI Token）
┌────────────────────────────▼────────────────────────────────────┐
│ L3  Runtime Plane（运行平面）                                      │
│  Extension Manager · Host Supervisor · 子进程 · JSON-RPC         │
│  职责：加载扩展、路由 Capability 调用、分发 Hook                   │
└────────────────────────────┬────────────────────────────────────┘
                             │ manifest + RPC
┌────────────────────────────▼────────────────────────────────────┐
│ L4  Governance Plane（治理平面）                                   │
│  权限 · Ed25519 验签 · 审计 · 配额 · 生命周期                      │
│  横切 L1–L3；所有 Capability / Hook / Event emit 均经此校验       │
└─────────────────────────────────────────────────────────────────┘
```

**复杂度控制原则**：L2 **零改动业务语义**；扩展只做 **外挂**。L3 是唯一允许运行扩展代码之处。

---

## 3. 扩展如何接入：双轴模型

扩展与平台只有两种连接方式；所有「功能」都是二者组合。

### 3.1 Capabilities（拉 — 扩展调用平台）

扩展 **主动调用** 平台提供的能力，经 JSON-RPC → DI Adapter → L2 核心。

```
Extension Host  ──RPC service/call──►  Capability Gateway  ──►  Platform API
                      ▲
                      └── PolicyProxy（权限 + 配额）
```

- 形态：`ctx.capabilities.llm.chat(...)` / SDK 等价物  
- 特点：**请求-响应**、扩展发起、必须声明 `permissions`  

### 3.2 Contributions（推 — 扩展注册到平台）

扩展在 `activate()` 或 manifest 中 **向平台注册** 扩展点。

| 贡献类型 | 注册内容 | 示例 |
|----------|----------|------|
| **UI** | MF remote 模块 | sidebar、page |
| **Hook** | 拦截 handler | `agent/turnStart` |
| **Job** | 计划任务 kind | 每日摘要 |
| **Tool** | Agent 工具 | 经 Tool Pack 流程 |
| **Route** | HTTP 子路由 | `/api/ext/{id}/*` |

- 特点：**平台在生命周期节点回调扩展**  

### 3.3 双轴关系（一图）

```
                    Contributions（推）
                    扩展注册 → 平台回调
                           │
    UI ─ Hook ─ Job ─ Tool ─ Route
                           │
              ┌────────────┴────────────┐
              │     Extension Host      │
              └────────────┬────────────┘
                           │
                    Capabilities（拉）
                    扩展调用 → 平台服务
                           │
    Storage · LLM · Data · Session · Shell · …
```

---

## 4. 统一交互三元组：Hook · Event · Alert

> **核心简化**：不再并列五套「总线」。所有异步/生命周期通信归入 **三种模式**。

```
                    ┌──────────────────────────────────────┐
                    │         Platform Lifecycle            │
                    └──────────────────┬───────────────────┘
                                       │
           ┌───────────────────────────┼───────────────────────────┐
           ▼                           ▼                           ▼
    ┌─────────────┐            ┌─────────────┐            ┌─────────────┐
    │    Hook     │            │    Event    │            │    Alert    │
    │  拦截/改写   │            │  事实广播    │            │  用户触达    │
    └─────────────┘            └─────────────┘            └─────────────┘
     同步·可变                   异步·不可变                  可选·持久
     扩展可注册                   扩展可订阅+emit              仅平台+配置
```

### 4.1 Hook（拦截）

| 属性 | 值 |
|------|-----|
| **语义** | 「在继续之前，允许扩展修改或否决」 |
| **方向** | 平台 → 扩展（Contributions） |
| **可变** | **是**（patch、abort、waterfall） |
| **命名** | `domain/action`，如 `agent/turnStart` |
| **传输** | Host 子进程 RPC；同步；有超时（默认 100ms 可配置） |
| **类比** | Symfony Event 的可变阶段 / Express middleware |

**适用**：改 prompt、拦截 tool 参数、审计 shell 命令。

**不适用**：通知 UI 刷新、记录 metrics —— 用 Event。

### 4.2 Event（观察）

| 属性 | 值 |
|------|-----|
| **语义** | 「某事已发生，订阅者自行处理」 |
| **方向** | 任意 → 订阅者（扩展、UI、内部模块） |
| **可变** | **否**（只读 envelope） |
| **命名** | `domain.entity.verb`，如 `job.terminal` |
| **传输** | 进程内 `EventDispatcher` + **WebSocket 扇出**（在线 UI/扩展） |
| **类比** | Symfony EventDispatcher（不可变 payload） |

**系统事件**：平台在 Hook **完成之后** 发 Event（避免订阅者看到未改写的中间态）。

**扩展自定义事件**：

- 命名：`ext.{pluginId}.{name}`  
- 需权限 `events.emit`；默认只能发自己的 prefix  
- 订阅需 `events.subscribe`；跨扩展订阅须在 manifest 声明 `watches`  

**实现包**：`@opptrix/event-bus`（进程内）；WS 桥在 `apps/server`（MVP Phase B）。

### 4.3 Alert（触达）

| 属性 | 值 |
|------|-----|
| **语义** | 「让用户注意到某事」 |
| **方向** | 平台 → 用户 |
| **可变** | 否 |
| **命名** | 内部路由；对用户只展示 title/body |
| **传输** | in-app / toast / webhook / email（**内置 channel**，MVP 不做 channel 插件） |

**与 Event 关系**：

```
Event(job.terminal)  ──►  Alert 策略（用户偏好）──►  in-app toast（若用户未在看该页）
```

Alert **不是**第四套注册 API；它是 **Event 的消费者 + 用户偏好路由**（Phase 2 从 schedule notify 迁入）。

### 4.4 决策表（扩展作者只看这一张）

| 我想… | 用 |
|--------|-----|
| 改掉即将发送给 LLM 的消息 | **Hook** `agent/turnStart` |
| 知道任务完成了，更新自己的 UI | **Event** 订阅 `job.terminal` |
| 告诉**用户**任务完成了 | 平台 **Alert**（或你 emit Event，由平台策略触达） |
| 广播「我的扩展算完了」给其他扩展 | **Event** `ext.{myId}.done` |
| 接入 Telegram 收消息 | **Conversation Transport**（Phase 3，非 Event） |

---

## 5. 推理与对话：两个正交维度

避免把「聊天入口」和「模型 API」混为一谈。

```
┌─────────────────────┐     ┌─────────────────────┐
│ Conversation        │     │ Inference           │
│ Transport           │     │ (LLM Provider)      │
│ 消息从哪来/回哪去    │     │ 用哪个模型推理       │
└──────────┬──────────┘     └──────────┬──────────┘
           │                           │
           └───────────┬───────────────┘
                       ▼
              ┌─────────────────┐
              │  Agent Engine   │
              │  SessionStore   │
              └─────────────────┘
```

| 维度 | MVP | 演进 |
|------|-----|------|
| **Transport** | 仅 `web`（现有聊天 UI） | `api` REST、Bot channel |
| **Inference** | 现有 `LlmProvider` | 扩展注册模型后端 |

MVP **不引入** ConversationHub 抽象层代码；仅预留命名。Web 聊天走现有路径，Phase 3 再抽 Hub。

---

## 6. 存储模型

**一条铁律**：扩展 **禁止** 打开宿主数据库文件（`opptrix.db`、`market.db` 等）。

```
┌─────────────────────────────────────────────────────────┐
│ Tier 1  Private Store（默认 · MVP）                      │
│  扩展私有 KV · ~/.opptrix/plugin-data/{id}/storage.db     │
│  API：storage.get / set / export                          │
├─────────────────────────────────────────────────────────┤
│ Tier 2  Domain API（MVP 只读为主）                       │
│  经 Capability 访问领域数据，非 SQL                      │
│  data.query · sessions.read · documents.* · search.*     │
├─────────────────────────────────────────────────────────┤
│ Tier 3  Shared Write（Phase 2+ · 强审核）                │
│  user-store 白名单 namespace · watchlist 等经专用 API     │
├─────────────────────────────────────────────────────────┤
│ Tier 4  Private SQL（Phase 3 · 可选）                     │
│  扩展自有 SQLite 表 · 权限 db.plugin                     │
└─────────────────────────────────────────────────────────┘
```

**实现**：Tier 1 → `@opptrix/plugin-storage`（已有）。

---

## 7. 运行时与隔离

### 7.1 进程模型（MVP）

```
apps/server（Platform Plane + Manager）
    │
    ├── JSON-RPC stdio ──► Host 子进程 [扩展 A]
    │                         └── 可选：Script 子进程（一次性）
    │
    └── JSON-RPC stdio ──► Host 子进程 [扩展 B]
```

- **UI**：浏览器 MF remote（L1），无 Node 集成  
- **Host**：扩展 `main` 入口；**唯一**长期运行扩展 JS 之处  
- **Script**：`capabilities.scripts.run`；Node / Python；一次性  

### 7.2 语言策略

| 层级 | 语言 | 阶段 |
|------|------|------|
| UI | TypeScript / React | MVP |
| Host | TypeScript → JS | MVP |
| Script | Node、Python | MVP |
| Shell | 受控 CLI | Phase 2 |
| WASM / OCI | — | 不承诺 |

### 7.3 与 R0 的关系

运行时隔离（子进程）是 **故障域隔离** 手段；**R0（§9）** 规定这些手段 **不得反向拖累** L2 主系统。实现上：Manager / Supervisor 全部在 **listen 之后** 异步就绪，且任何扩展失败 **fail-open**。

### 7.4 依赖与打包模型（自包含优先）

> **原则**：扩展的**私有依赖**必须自带；安装后最小可运行单元是 `.opx` 本身，**禁止**运行时再 `npm install` / 依赖宿主 `node_modules` 里的第三方库。  
> **唯一例外**：宿主 **Framework Shared**（React / UI Kit / extension-sdk），保证 UI 单例与版本契约。

#### 分层规则

```
┌─────────────────────────────────────────────────────────────┐
│ A. Framework Shared（宿主提供 · peer · 不打进扩展私有包）     │
│    react / react-dom · @opptrix/ui-kit · @opptrix/extension-sdk │
│    原因：MF singleton、避免双 React、体积、主题一致             │
├─────────────────────────────────────────────────────────────┤
│ B. Extension Private Bundle（扩展自带 · 必须）                 │
│    Host：esbuild/tsup 打成单文件（或少量 chunk）+ 私有 deps   │
│    UI：除 shared 外全部打进 remoteEntry 及其 chunk            │
│    禁止：安装时联网拉依赖、依赖宿主 lodash/axios 等偶然路径     │
├─────────────────────────────────────────────────────────────┤
│ C. Native / 解释器（白名单 · 显式声明）                        │
│    better-sqlite3 等：默认禁止；若必须 → manifest 声明 + 预编译 │
│    Python 脚本：依赖随扩展 wheels/vendor 或声明 system packages │
│    禁止：激活时 pip/npm install                                │
└─────────────────────────────────────────────────────────────┘
```

#### Host（服务端子进程）

| 规则 | 说明 |
|------|------|
| **默认产物** | `dist/host/index.js`（单文件 bundle，含私有 deps） |
| **external** | 仅 `@opptrix/extension-sdk/host`（宿主注入 Facade） |
| **禁止** | `import 'lodash'` 等未打包模块；运行时解析到 Server 的 `node_modules` |
| **原生模块** | MVP **禁止**；Phase C 起才允许 `nativeBindings[]` + 平台预编译 artifact |
| **doctor** | 扫描 Host 产物：未解析 external → fail；体积超阈值 → warn |

#### UI（Module Federation）

| 规则 | 说明 |
|------|------|
| **shared** | `react`、`react-dom`、`@opptrix/ui-kit`、`@opptrix/extension-sdk/ui`（singleton + strictVersion） |
| **其余** | 全部打进 remote；**不得**假设宿主有 `antd` / `echarts` 等 |
| **版本契约** | `engines.opptrix` + shared 版本不匹配 → **拒绝激活**（不降级猜版本） |

#### 脚本（Node / Python）

| runtime | 依赖策略 |
|---------|----------|
| `node` | 脚本入口可 `require` **扩展包内** `vendor/` 或已 bundle 的同目录模块；不可用全局 |
| `python` | 优先 `vendor/` 内 wheels；或 `requirements.lock` + 安装时解压到 `plugin-data`（**离线**）；禁止激活时 `pip install` |

#### 为什么不全量「零 shared」？

| 全自带（含 React） | 双层模型（推荐） |
|--------------------|------------------|
| 每个扩展一份 React → 多实例、状态断裂、体积爆炸 | UI 共享宿主 React，逻辑自包含 |
| 主题/Design Token 无法统一 | 走 `@opptrix/ui-kit` |
| 升级宿主 React 时扩展全碎 | `engines.opptrix` + MF strictVersion 显式门禁 |

**结论**：业务依赖「自己带齐」✅；框架层「宿主单例」✅。这是 VS Code / Webpack Federation 的成熟折中，不是半成品。

#### `.opx` 安装契约

```
.opx（zip）
├── opptrix.plugin.json
├── dist/host/index.js          # 已含私有依赖
├── dist/ui/remoteEntry.js      # 已含非 shared 依赖
├── vendor/                     # 可选：python wheels / 静态资源
├── SIGNATURE.ed25519
└── CHECKSUMS.sha256
```

安装 = 解压 + 验签 + 写注册表；**零网络拉依赖**（商店下载 `.opx` 本身除外）。

---

## 8. 治理：权限、签名、生命周期

### 8.1 生命周期

```
Available → Installed → Enabled → Active ⇄ Crashed
                │                      │
                └──── Deactivated ─────┘
                │
           Uninstalled（可选保留 Private Store）
```

### 8.2 权限模型

- manifest `permissions[]` 声明  
- 运行时 **Capability Gateway** 校验；缺权限 → RPC 拒绝  
- 商店默认策略：敏感权限（`shell`、`sessions.write`）需审核  

### 8.3 签名

- 官方商店 `.opx`：**Ed25519 强制**  
- 本地开发：`OPPTRIX_EXT_DEV=1` 可跳过  

---

## 9. 平台韧性铁律（R0）

> **最高优先级架构约束**（与 L0 核心信条同级）：  
> **扩展是平台的客人；主系统启动、健康检查、聊天、行情、会话等核心路径，不得因扩展安装、启用、崩溃或超时而不可用。**

### 9.1 原则（不可妥协）

| # | 铁律 | 含义 |
|---|------|------|
| R0-1 | **启动非阻塞** | `apps/server` 在扩展未就绪时须已 `listen`；`/api/health` 不依赖扩展 |
| R0-2 | **失败可降级** | 单扩展 activate/crash/超时 → 仅该扩展 `Disabled`；主系统继续 |
| R0-3 | **关键路径零等待** | 聊天、登录、配置、行情查询 **禁止** `await` 扩展 Host RPC（除非用户显式打开扩展 UI） |
| R0-4 | **超时硬上限** | Hook / RPC / activate 均有超时；超时视为扩展失败，**不**重试阻塞主线程 |
| R0-5 | **资源有界** | 扩展子进程数、内存、并发 RPC 有配额；超限拒绝或排队，**不**拖死 Server |
| R0-6 | **UI 懒加载** | MF `remoteEntry` 仅在进入扩展路由/侧栏时加载；首屏不拉扩展 chunk |
| R0-7 | **零扩展 = 零成本** | 未安装或未启用扩展时，启动路径与无扩展平台前 **等价**（无子进程、无扫描阻塞） |

### 9.2 启动时序（强制）

```
时间 ──────────────────────────────────────────────────────────────►

│ Phase 0 — 主系统关键路径（同步/必须成功）                          │
│   init network → register core routes → listen HTTP(S)            │
│   → /api/health OK → user-store / agent / hub 按需懒初始化       │
│                                                                  │
│ Phase 1 — 扩展元数据（异步，可失败，禁止 await 在 Phase 0 内）    │
│   setImmediate / 后台 job：scan ~/.opptrix/extensions             │
│   验签失败 → 标记 Rejected，不 spawn                               │
│                                                                  │
│ Phase 2 — 扩展激活（按需，可失败）                                 │
│   仅 Enabled 扩展 · 仅满足 activationEvents · spawn Host          │
│   activate 超时 → kill 子进程 → Disabled + 审计日志                │
│                                                                  │
│ Phase 3 — 扩展 UI（用户触发）                                      │
│   用户打开 /ext/... → loadRemote → ErrorBoundary 兜底              │
```

**禁止**：在 `bootstrap()` 的 `listen` 之前 `await extensionManager.activateAll()`。

### 9.3 稳定性隔离

| 故障 | 主系统行为 | 扩展行为 |
|------|------------|----------|
| Host 子进程崩溃 | 继续服务；扩展标 `Crashed` | Supervisor 按 `maxRestarts` 重启；超限 `Disabled` |
| Hook 超时 | 忽略该 handler，走默认逻辑 | 记审计；不阻断 turn |
| Capability RPC 超时 | 向调用方返回错误 | 不重试阻塞 Engine |
| MF 加载失败 | Shell 正常；扩展位显示友好空态 | 不白屏整站 |
| 恶意/死循环扩展 | cgroup/超时杀进程 | 不影响其他扩展与 Core |

### 9.4 实现检查清单（Phase A 门禁）

代码评审与 CI **必须** 满足：

- [ ] `apps/server` 启动不 `import` 扩展业务模块；Extension 代码仅在 Manager 模块内
- [ ] `getEventDispatcher()` / `plugin-storage` 等包 **懒加载** 或仅在扩展 RPC 路径使用
- [ ] 无扩展时 `ExtensionManager` 扫描 < 50ms（仅读目录 + manifest 解析）
- [ ] `/api/health` 不检查扩展 Host 状态（可提供 **独立** `/api/ext/health`）
- [ ] 集成测试：安装故意崩溃的扩展后，`/api/health` 仍 200，聊天 API 仍可用
- [ ] 集成测试：10 个扩展同时 activate 失败，主进程启动时间增幅 < 5%（相对无扩展基线）

### 9.5 与官方内置扩展

官方 `.opx` 内置扩展 **同样遵守 R0**。不允许「官方扩展走同步 in-process 捷径」而阻塞启动；若需性能优化，仅允许 **已激活后的** 快速路径，且须有 ADR。

### 9.6 关闭与有序退出（R1）

> **与 R0 对称、但不矛盾**：启动 **fail-open**（不等待扩展）；关闭 **best-effort ordered**（给扩展有序清理机会），但 **总时长有界**，绝不允许扩展拖死进程退出。

#### R1 原则

| # | 铁律 | 含义 |
|---|------|------|
| R1-1 | **有序关闭** | 扩展 `deactivate` 在 **关闭 user-store / plugin-data 之前**、**停止调度器之后** 执行 |
| R1-2 | **有界等待** | 全进程关闭预算继承 `OPPTRIX_SIDECAR_FORCE_EXIT_MS`（默认 12s）；扩展阶段单独子预算 |
| R1-3 | **尽力而为，非无限** | 某扩展 `deactivate` 超时 → 强杀 Host 子进程，**继续**后续关闭步骤 |
| R1-4 | **核心数据优先** | `user-store.close()`、各 `plugin-storage` flush **必须执行**；扩展 Hook 失败 **不** 阻止关库 |
| R1-5 | **事件语义分离** | **Hook** `app/onShutdown` = 可 await 的清理；**Event** `app.shutdown` = 只读广播，不保证每个 listener 成功 |
| R1-6 | **拒绝新工作** | 进入关闭后不再 activate 扩展、不接受新 RPC、不派发新 Hook（除 onShutdown） |

#### 「完美退出」的定义（可验收）

> **注意**：下表「关停层级」用 S0–S3，**不要**与运行时平面 L1–L4 混淆。

| 关停层级 | 必须达成 | 扩展失败时 |
|----------|----------|------------|
| **S0 核心** | schedulers 停、HTTP drain、`user-store` / market / doc-library 按现有 `runSidecarShutdown` 关闭 | 照常执行；与今天一致 |
| **S1 扩展运行时** | 对每个 **Active** Host 调用 `deactivate()`（含 dispose hooks/workers） | 超时 kill 子进程；记审计 |
| **S2 扩展持久化** | 各扩展 `plugin-storage` SQLite checkpoint / close | 超时跳过该扩展目录 |
| **S3 可观测** | `emit(app.shutdown)` + 审计日志落盘 | listener 抛错仅 warn |

**不承诺**：所有 Event listener 全部成功、所有扩展 deactivate 无超时——在恶意/卡死扩展下 **不允许** 阻碍 S0。

#### 关闭时序（接入 `runSidecarShutdown`）

```
SIGTERM / SIGINT / uncaughtException
        │
        ▼
┌─ 现有 Step 1：stopSchedulers ─────────────────────────┐
│  schedule · retention · news · enrichment 定时器停止   │
└───────────────────────────┬─────────────────────────────┘
                            ▼
┌─ 【新增】Step 2：extensionShutdownPhase ────────────────┐
│  2a  ExtensionManager.enterDraining()  // 拒绝新 RPC    │
│  2b  emit Event: app.shuttingDown（只读，进程内）        │
│  2c  Hook: app/onShutdown（并行，每扩展 ≤ perExtMs）     │
│  2d  RPC: host/deactivate（同上）                        │
│  2e  kill 仍存活 Host 子进程                             │
│  2f  flush + close 各 plugin-storage                     │
│  2g  emit Event: app.shutdown                            │
│  子预算：min(5000, forceExitMs × 0.4)                    │
└───────────────────────────┬─────────────────────────────┘
                            ▼
┌─ 现有 Step 3–N：closeBrowsers → closeHttpApp → … ─────┐
│  unloadLlama · doc-library · market · user-store         │
└───────────────────────────┬─────────────────────────────┘
                            ▼
                    nativeSettle → process.exit
        │
        └── 全程：forceExit 定时器（已有）到期则强制 exit
```

**实现位置（Phase A）**：在 `apps/server/src/sidecar-shutdown.ts` 的 `stopSchedulers` 之后、`closeBrowsers` 之前插入 `extensionShutdownPhase` hook。

#### Hook vs Event 在关闭时

| 机制 | 名称 | 行为 | 超时 |
|------|------|------|------|
| Hook | `app/onShutdown` | 扩展清理：停 worker、写盘、断开外部连接 | **per-ext** 默认 2s |
| Event | `app.shuttingDown` | 通知「即将关闭」；只读 | 同步 dispatch，单 listener ≤50ms |
| Event | `app.shutdown` | 通知「扩展已 deactivate」；只读 | 同上 |
| RPC | `host/deactivate` | 撤销 contributions、dispose | 含在 per-ext 预算内 |

**禁止**：要求「所有 Event 订阅者成功后才 `user-store.close()`」——这与 R1-4 冲突。

#### 环境变量（建议）

| 变量 | 默认 | 说明 |
|------|------|------|
| `OPPTRIX_SIDECAR_FORCE_EXIT_MS` | `12000` | 全进程关闭总预算（已有） |
| `OPPTRIX_EXT_SHUTDOWN_MS` | `min(5000, force×0.4)` | 扩展阶段总预算 |
| `OPPTRIX_EXT_DEACTIVATE_MS` | `2000` | 单扩展 deactivate 超时 |

### 9.7 其他生命周期场景

| 场景 | 策略 | 与 R0/R1 |
|------|------|----------|
| **单扩展禁用/卸载** | 仅对该扩展 `deactivate` → kill Host；不重启 Server | 同 R1 per-ext 超时 |
| **扩展升级** | deactivate 旧版 → 换 symlink → activate 新版（异步）；升级期间旧版不可用 | 不阻塞 HTTP |
| **Runtime 槽位切换**（`system-update`） | 新槽 post-activate **fail-closed**（已有）；旧槽退出前走 **完整 R1** | 扩展 Manager 随旧进程 R1 清理 |
| **热重载（开发）** | `opptrix-ext dev` 只重载该扩展 Host；**不**重启 Server | 等同单扩展 deactivate+activate |
| **Docker SIGTERM** | 走统一 `shutdown()`；`STOPSIGNAL` 与 forceExit 对齐 | 文档注明最小 `stop_grace_period` |
| **崩溃恢复** | 下次启动 Phase 1 扫描；`Crashed` 扩展默认 **不** 自动 activate（用户手动或 `maxRestarts`） | R0 fail-open |
| **浏览器页关闭** | MF 组件 unmount；**不**等于 Server shutdown；扩展 UI 状态丢弃 | 无 Server RPC |
| **计划任务执行中收到 SIGTERM** | stopSchedulers 后当前 run 允许 **短完成窗口**（schedule 包已有 stale 语义）；扩展 job handler 受 per-ext deactivate 截断 | 不无限等待 |

#### 客户端（L1）关闭

- 浏览器关 Tab：**不**触发扩展 `onShutdown`（无 Host）。  
- 仅 Server 进程退出时触发 R1。  
- UI 侧：`beforeunload` 可提示未保存内容；**不**阻塞 Server 关闭。

---

## 10. 通用运行时原语 vs 领域包

> 对照 Harness `ctx.*`：**原语对齐通用层；IDE/领域专属进 Domain Pack。**  
> SDK：MVP **扁平 Token**；Phase B+ 提供 `ctx.*` **别名**（同一 Gateway）。

### 10.1 Platform Primitives（领域无关 · 长期稳定）

| 类别 | Token / SDK | 阶段 | 说明 |
|------|-------------|------|------|
| **模型** | `llm` / `ctx.llm` | A | LLM 适配器 |
| **执行** | `shell` / `ctx.shell` | A thin / B grant UI | 沙盒命令 |
| | `scripts` / `ctx.scripts` | A–B | node/python 一次性（≈ subprocess） |
| | `fs.plugin` / `ctx.fs.plugin` | B | **仅** plugin-root / plugin-data / 包内资产 |
| | `fs.workspace` / `ctx.fs.workspace` | **D**（coding） | 工作区全量；见 §10.3 |
| | sandbox | 内嵌 | 不单独暴露；嵌在 shell/scripts |
| **网络/工具** | `http.fetch` / `ctx.http` | B | 受控 egress |
| | `tools` / `ctx.tools` | B | 注册/查找/执行 + Hook 拦截 |
| | `skills` / `ctx.skills` | B | 读/写技能 |
| **会话与数据** | `sessions.read` / `.write`/`.mutate` | A / C | mutate 仅 C |
| | `storage` / `ctx.storage` | A | 扩展私有 KV |
| | sessionPersistence / spill / compaction | Core | **不**作扩展可写 Token |
| **流程** | `jobs` / `ctx.jobs` | B | **统一门面**（§10.7）；含 schedule kinds |
| | `schedule` | A 过渡 | A 可用；B 起为 `jobs` 的 kind 别名 |
| | `approval` / `ctx.approval` | C | PolicyProxy + stepUp |
| | workflow | 远期可选 | 默认 jobs + agent turn |
| **组合** | activate / Disposable / Hook+Event | A | ≈ plugin / effect / on |
| **Agent** | agents / subagents | D 受限 | Core 持有 |
| | agentLoop | D+ 默认关 | 实验开关 |

### 10.2 Domain Pack：`research`（首发）

| Token | 说明 |
|-------|------|
| `data.query` / `data.subscribe` | 行情与档案 |
| `watchlist` / `portfolio` | 关注与持仓 |
| `documents.*` / `search.*` | 研报与统一搜索 |
| Conversation Transport `web` | 现聊天路径 |

`manifest.domainPacks: ["research"]`；`platform.supports('research')`。

### 10.3 Domain Pack：`coding`（Phase D）

| Token | 说明 |
|-------|------|
| `fs.workspace` | 工作区读写/监视（包装 agent-workspace，**不重写**） |
| `terminals` | PTY 交互终端 |
| `codeRuntime` | 语言运行时探测 |
| `lsp` | 语言服务桥（可选） |
| `web.browser` | 包装 agent-browser |
| spill/compaction 观察 | 默认只读；写权限极严 + ADR |
| UI `views.terminal` / `views.editor` | MF 插槽 |

**实现原则（D6）**：coding pack = **Adapter 包装**现有 `@opptrix/agent-workspace` / `agent-browser`，禁止平行重写。

### 10.4 Domain Pack：任意解决方案

```
① primitives（固定）
  + ② domainPack: research | coding | legal | ops | …
  + ③ store extensions（.opx）
```

### 10.5 Domain Pack 加载与治理（D2 / D7 / D8 · ADR-13）

| 规则 | 说明 |
|------|------|
| **谁能提供 Pack** | **仅 Core 官方模块**（如 `@opptrix/domain-research`）或 **Opptrix 官方签名的 Pack 清单** |
| **第三方 `.opx`** | **禁止** `contributes.domainPack` 自封 Pack；只能 **消费** 已启用 Pack 的 Token |
| **启用** | 设置页 / `platform.enablePack(id)`；默认启用 `research`（投研发行物） |
| **探测** | `platform.supports(packId)` / `platform.listPacks()` |
| **冲突** | 两 Pack 不得注册同一 Token；冲突表见下；Gateway 启动时 assert |
| **Pack ≠ Builtin Ext** | Pack = **能力面（Token 集合）**；Builtin `.opx` = **可选功能组装**（可禁用扩展，Pack 仍可在） |

**Token 冲突表（预置）**

| Token | 归属 Pack / 原语 | 冲突方 |
|-------|------------------|--------|
| `data.*` | research | 禁止 coding 占用 |
| `fs.plugin` | primitives | 与 `fs.workspace` 并存、权限不同 |
| `fs.workspace` / `terminals` / `lsp` | coding | 未启用 coding → 拒绝 |
| `llm` / `storage` / `sessions.*` | primitives | Pack 不得重复注册 |

### 10.6 两套插件系统（D5 · ADR-14）

| 系统 | 包 | 用途 | 运行时 |
|------|-----|------|--------|
| **行情 Provider** | `@opptrix/provider-sdk` | 数据源适配 | Engine 进程内 Registry |
| **扩展 `.opx`** | Extension Host + MF | UI/Hook/工具/领域组装 | L3 子进程 + L1 |

**禁止**：把 Provider 改造成 `.opx`；禁止扩展 `import` Provider 实现并绕过 `data.query`。

### 10.7 `jobs` 统一门面（D3 · ADR-15）

```
ctx.jobs.list / watch / cancel / registerKind
       │
       ├── kind: schedule.*     ← 现 @opptrix/schedule
       ├── kind: discover|fuyao|shell|…
       └── kind: ext.{pluginId}.*
```

- Phase A：可继续暴露 `schedule` Token（实现转调 jobs 或直连 ScheduleService）  
- Phase B：文档与 SDK **主推 `jobs`**；`schedule` 标 deprecated alias  
- Alert：`job.terminal` / `schedule.run.end` 均可触发用户触达  

### 10.8 文件系统双 Token（D4）

| Token | 根路径 | 阶段 | 权限 |
|-------|--------|------|------|
| `fs.plugin` | plugin-root、plugin-data、包内 assets | B | 扩展默认可申请 |
| `fs.workspace` | 用户工作区（agent-workspace） | D + coding | 强审核；需 coding pack |

### 10.9 SDK 命名：扁平 vs `ctx.*`（D12）

| 阶段 | 风格 |
|------|------|
| A | 扁平：`storage.get`、`llm.chat`、`data.query` |
| B+ | SDK 增加 `ctx.storage` / `ctx.llm` / `ctx.research.data` **别名**，同一 Gateway |

### 10.10 多租户（D10）

单用户自托管为默认。多用户 data root / 租户隔离 **SaaS 立项前不开**；三层模型预留 `platform.userScope`，不实现。

### 10.11 Phase A 限额表（D11）

| 限额 | 默认 | 说明 |
|------|------|------|
| Hook 同步超时 | 100ms | 可 per-event 配置，上限 500ms |
| activate 超时 | 10s | 超时 → Disabled |
| deactivate 单扩展 | 2s（`OPPTRIX_EXT_DEACTIVATE_MS`） | R1 |
| 扩展关闭阶段总预算 | min(5s, forceExit×0.4) | R1 |
| 全进程 force exit | 12s | 已有 env |
| 并发 Host 子进程 | 16 | 超限拒绝 activate |
| 单扩展常驻 worker | 0（A）/ 3（C） | A 无 worker |
| plugin-storage 配额 | 64MB | 已有 |
| Event envelope | 64KB | 超限拒绝 emit |
| 无扩展扫描 | < 50ms | R0 门禁 |

---

# Part II — 能力目录

> 下列每一项标注：**Capability（拉）** 或 **Contribution（推）**，以及所属 Phase / Pack。

## 11. MVP 能力包（投研首发）

**目标**：能安装一个扩展，看到 UI，调 LLM，存私有数据，订阅系统 Event，注册一个 Hook。  
**Pack**：`primitives` + `research`（`data.query`）。

### 11.1 Capabilities（拉）

| Token | 用途 | 权限 | Pack |
|-------|------|------|------|
| `storage` | Private Store KV + export | （内置） | primitives |
| `llm` | 模型推理 | `llm` | primitives |
| `sessions.read` | 读会话 | `sessions.read` | primitives |
| `data.query` | 行情/档案一次性查询 | `data.query` | **research** |
| `shell` | 沙盒命令（thin；完整 grant UI 在 B） | `shell` | primitives |
| `schedule` | 注册/管理计划任务 | `schedule` | primitives |
| `events.subscribe` | 订阅系统 + 自有 Event | `events.subscribe` | primitives |
| `events.emit` | 发 `ext.{id}.*` | `events.emit` | primitives |
| `platform.info` | 部署形态、特性与已装 packs | （内置） | primitives |

### 11.2 Contributions（推）

| 贡献点 | 用途 | Phase |
|--------|------|-------|
| `views.sidebar` / `pages` | MF UI | MVP |
| `hooks.*` | Hook 注册 | MVP（只读类 hook 优先） |
| `schedule.jobKind` | 计划任务 | MVP |
| `routes` | `/api/ext/{id}/*` | MVP |
| `agentTools` | Agent 工具 | Phase B |

### 11.3 交互（三元组 MVP 范围）

| 模式 | MVP 范围 |
|------|----------|
| **Hook** | `session/messageCommitted`、`agent/toolPreExecute`（只读审计）；扩展 `app/onStartup` **仅 Phase B 异步**，禁止阻塞 listen |
| **Event** | 系统：`job.*`、`session.message.committed`、`extension.activated`；WS 扇出 |
| **Alert** | 仅 in-app toast；复用现有 schedule webhook/email **不重构** |

### 11.4 包格式与工具

| 项 | MVP |
|----|-----|
| `.opx` 安装/卸载 | ✓ |
| 本地导入 + DEV 模式 | ✓ |
| `opptrix-ext` create / build / pack | ✓ |
| 官方商店 + publish | Phase B |

---

## 12. Phase B / C

### 12.1 Phase B（商店与 Agent 集成）

| 类别 | 新增 | Pack |
|------|------|------|
| Capability | `http.fetch`、`search.*`、`documents.read`、**`jobs.*`（主推）**、`skills.*`、`tools`、**`fs.plugin`** | primitives + research |
| Contribution | `agentTools`、settings、`views.chat`、**Pack 启用 UI** | — |
| Hook | `agent/turnStart`（只读 audit） | — |
| Alert | NotificationRouter（消费 Event） | primitives |
| Alias | `schedule` → `jobs` kind | primitives |
| 存储 | Tier 3 白名单写 | research |

### 12.2 Phase C（高级 · 按需）

| 类别 | 内容 | Pack |
|------|------|------|
| Hook | `sessions.mutate`、step-up / `approval` | primitives |
| Transport | ConversationHub、Bot channel | primitives |
| 存储 | `db.plugin` | primitives |
| 运行时 | Worker、`data.subscribe` | research / primitives |
| 语言 | WASM 脚本（评估） | primitives |

---

## 13. Phase D — 编程终端与任意解决方案

**前置**：Phase A–B 稳定；独立产品 ADR「Coding Domain Pack」。

| 交付 | 说明 |
|------|------|
| Domain Pack `coding` | §10.3；**Adapter 包装** agent-workspace / agent-browser |
| UI | `views.terminal`、`views.editor`（MF） |
| Workspace | 用户工作区根、权限模型、与 agent-workspace 对齐 |
| 可选 | LSP 桥、codeRuntime、浏览器自动化增强 |
| 任意方案 | 文档化「如何新增 Domain Pack」模板 + 商店审核清单 |
| Agent | 受限 `ctx.subagents`；`agentLoop` 仅实验开关（默认关） |

**验收**：同一 Server 可同时启用 `research` + `coding` packs，互不阻塞；卸载 `coding` 后投研路径零回归（R0）。

---

# Part III — 交付

## 14. 四阶段路线图

```
Phase A — MVP（投研扩展可演示）
├── Extension Manager + Host + JSON-RPC（R0/R1）
├── Primitives：storage · llm · sessions.read · events · shell · schedule
├── Research：data.query
├── MF UI · hooks（只读）· .opx 本地 · CLI
└── 验收：示例扩展 + R0/R1 测试

Phase B — 商店与 Agent
├── registry · Ed25519 · tools · skills · http · jobs · 受限 fs
├── shell grant UI 完善 · Alert 统一 · research 文档/搜索
└── 验收：商店官方示例

Phase C — 高级（按需）
├── sessions.mutate · approval · ConversationHub · db.plugin · Worker
└── 每项独立 ADR

Phase D — 编程终端 / 任意方案（不阻塞 A–C）
├── Domain Pack coding · terminals · workspace FS · editor UI
├── Domain Pack 模板（任意垂直方案）
└── 可选 agentLoop 实验开关
```

**禁止**：Phase A 未验收前启动 Phase C/D；**禁止** 为 Phase D 回头破坏 A 的 R0 契约。

---

## 15. 已锁定 ADR

| ID | 决策 | 理由 |
|----|------|------|
| ADR-01 | UI = Module Federation | 与 React 宿主 shared 一致 |
| ADR-02 | 运行时 = 独立子进程 | 隔离优于 worker_threads |
| ADR-03 | 交互 = Hook + Event + Alert 三元组 | 控制概念数量 |
| ADR-04 | Event 进程内 + WS；Hook 仅 RPC | 职责分离 |
| ADR-05 | 存储默认 Tier 1 KV | 简单可导出 |
| ADR-06 | Web 优先 | 不依赖 Electron |
| ADR-07 | 商店仅官方 + Ed25519 | 供应链 |
| ADR-08 | `sessions.mutate` 仅 Phase C | 安全复杂度 |
| ADR-09 | R0 平台韧性 | 扩展不得阻塞启动；见 §9 |
| ADR-10 | R1 有序关闭 | 有界 best-effort；见 §9.6 |
| ADR-11 | 依赖自包含 | 私有 deps 进 `.opx`；见 §7.4 |
| ADR-12 | 通用原语 + 领域包；投研首发，编程终端 Phase D | 见 §10 |
| **ADR-13** | **Domain Pack 仅官方 Core/清单提供；第三方 `.opx` 不可自封 Pack** | D2/D7/D8；见 §10.5 |
| **ADR-14** | **Provider 插件 ≠ Extension `.opx`；永久双轨** | D5；见 §10.6 |
| **ADR-15** | **`jobs.*` 统一后台任务门面；schedule 为 kind/别名** | D3；见 §10.7 |
| **ADR-16** | **`fs.plugin` 与 `fs.workspace` 分 Token、分权限** | D4；见 §10.8 |

## 16. 与现有代码包映射

| 抽象 | 包 / 模块 | 状态 |
|------|-----------|------|
| Private Store | `@opptrix/plugin-storage` | 已实现 |
| Event（进程内） | `@opptrix/event-bus` | 已实现 |
| Event（WS） | `apps/server` | 待 Phase A |
| Hook 分发 | Extension Manager（新） | 待 Phase A |
| Capability Gateway | ServiceContainer（新） | 待 Phase A |
| Research domain | Hub / Engine / doc-library | 已有，Adapter 接入 |
| Coding domain | agent-workspace / agent-browser | 已有；**D 仅 Adapter 包装为 pack** |
| 行情 Provider | provider-sdk / a-stock-layer | **独立插件轨**（≠ `.opx`） |
| Platform 核心 | `packages/agent`、`user-store`… | 已有 |

---

## 附录 A：与 v1.3 详细规格的关系

[EXTENSION-PLATFORM.md](./EXTENSION-PLATFORM.md) 含 manifest / RPC 等实现细节。阅读顺序：

1. **本文 v2.5** — 抽象边界、原语/领域包、缺陷闭环  
2. **DIAGRAMS** — 看图  
3. **实现规格** — 细节备忘；冲突以本文为准  

---

## 附录 B：扩展作者心智模型（一页）

```
1. 写 UI（MF） + Host（activate/deactivate）
2. manifest 声明 permissions + contributes + domainPacks
3. 要通用能力 → ctx.llm / storage / shell / tools / events（Primitives）
4. 要投研能力 → data.* / documents（research pack）
5. 要编程终端 → coding pack（Phase D；未启用则不可用）
6. 要介入生命周期 → Hooks；要广播 → events.emit
7. 私有数据 → storage.*；禁止直连宿主 DB / import 内部包
```

## 附录 C：Harness `ctx.*` 对照摘要

| Harness | Opptrix | 归属 |
|---------|---------|------|
| ctx.llm | llm / ctx.llm | ① |
| ctx.fs（插件数据） | **fs.plugin** | ① B |
| ctx.fs（工作区） | **fs.workspace** | ② coding D |
| ctx.shell / subprocess / sandbox | shell / scripts（sandbox 内嵌） | ① |
| ctx.terminals / lsp / codeRuntime | coding pack | ② D |
| ctx.web / tools / skills | http / tools / skills | ① B |
| ctx.agents / subagents / agent-loop | Core；D 受限；loop 默认关 | Core / D |
| ctx.sessions / storage / spill / compaction | sessions / storage；spill/compaction Core | ① / Core |
| ctx.approval / jobs / workflow | approval / **jobs**；（workflow 可选） | ① B–C |
| ctx.plugin / effect / on | Host / Disposable / Hook+Event | ① |

---

## 附录 D：设计缺陷闭环（原审计）

| ID | 缺陷 | 状态 | 落点 |
|----|------|------|------|
| D1 | 规格文五总线/P0–P7 双源 | **已修** | EXTENSION-PLATFORM.md 服从横幅 + §18 废弃表 |
| D2 | Pack 加载形态 | **已定** | ADR-13 / §10.5：仅官方；第三方不可自封 |
| D3 | schedule vs jobs | **已定** | ADR-15 / §10.7 |
| D4 | fs 双语义 | **已定** | ADR-16 / §10.8 |
| D5 | Provider vs Ext 两套插件 | **已定** | ADR-14 / §10.6 |
| D6 | coding vs agent-workspace | **已定** | §10.3：Adapter 包装不重写 |
| D7 | Pack 启用/冲突 | **已定** | §10.5 + Token 冲突表 |
| D8 | Pack vs Builtin Ext | **已定** | §10.5 定义 |
| D9 | Alert/Event/对话边界膨胀 | **已修** | 规格 §19/§20 改挂三元组；实现只认 §4 |
| D10 | 多租户 | **已定延后** | §10.10 SaaS 前不开 |
| D11 | 限额散落 | **已修** | §10.11 Phase A 限额表 |
| D12 | ctx vs 扁平 Token | **已定** | §10.9：A 扁平；B+ 别名 |

**结论**：附录 D 项均已文档闭环；实现 Phase A 时以本节 + ADR-13–16 为验收依据。

---

*文档版本：2.5 · 2026-09-04 — 审计缺陷 D1–D12 文档闭环（ADR-13–16）*
