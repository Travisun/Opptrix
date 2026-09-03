# Opptrix 扩展平台 — 抽象架构 v2.0

> **定位**：扩展平台的**唯一抽象架构入口**（先结构、后功能）。  
> **状态**：设计稿（未实现）  
> **运行形态**：Web 优先（浏览器 / Docker 自托管）；不依赖 Electron  
> **详细规格**（manifest 字段、RPC 协议、完整 API 表）：见 [EXTENSION-PLATFORM.md](./EXTENSION-PLATFORM.md)（作附录级参考，以本文 MVP 边界为准）  
> **勿混用**：[Self-Evolution Harness](./SELF-HARNESS-PRODUCT.md) 是技能覆盖演进，不是本扩展平台

---

## 目录

**Part I — 抽象架构（先读这部分）**

1. [问题域与边界](#1-问题域与边界)
2. [四层平面模型](#2-四层平面模型)
3. [扩展如何接入：双轴模型](#3-扩展如何接入双轴模型)
4. [统一交互三元组](#4-统一交互三元组hook--event--alert)
5. [推理与对话：两个正交维度](#5-推理与对话两个正交维度)
6. [存储模型](#6-存储模型)
7. [运行时与隔离](#7-运行时与隔离)
8. [治理：权限、签名、生命周期](#8-治理权限签名生命周期)

**Part II — 能力目录（抽象 → 功能映射）**

9. [MVP 能力包](#9-mvp-能力包)
10. [Phase 2 能力包](#10-phase-2-能力包)
11. [Phase 3 能力包（演进，非承诺）](#11-phase-3-能力包演进非承诺)

**Part III — 交付**

12. [三阶段路线图](#12-三阶段路线图)
13. [已锁定 ADR](#13-已锁定-adr)
14. [与现有代码包映射](#14-与现有代码包映射)

---

# Part I — 抽象架构

## 1. 问题域与边界

### 1.1 扩展平台是什么

在 **不修改 Opptrix 核心仓库** 的前提下，让第三方或官方团队能够：

- 贡献 **UI**（侧栏、页面）
- 注册 **行为**（Hook 拦截、计划任务、工具）
- 调用 **平台能力**（LLM、行情、会话只读、脚本等）
- 拥有 **私有持久化**
- 经 **官方商店** 或本地包安装，并受 **权限 + 签名** 约束

### 1.2 不是什么

| 概念 | 关系 |
|------|------|
| Self-Harness | 独立产品线；禁止共用 `extension-*` 与 `harness-*` 命名空间 |
| External MCP | 已有；扩展可 `contributes.mcp`，但不替代 MCP 协议 |
| Provider 插件 | 已有 `@opptrix/provider-sdk`；行情 Provider **不**走扩展 Host |
| 任意用户脚本 | 必须打包为 `.opx` + 声明权限；无「粘贴 JS 就运行」 |

### 1.3 设计约束（不可妥协）

1. **Web 优先**：浏览器 + `apps/server`；无 Electron 硬依赖  
2. **Host 唯一入口**：扩展禁止 `import @opptrix/agent` 等内部包  
3. **进程隔离**：扩展逻辑在服务端 **独立子进程**  
4. **可撤销**：`activate()` 注册的一切必须在 `deactivate()` 清理  
5. **权限先行**：manifest 声明 → 运行时 PolicyProxy 强制  

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
│ L2  Platform Plane（平台平面）= 现有 Opptrix 核心                 │
│  Agent Engine · SessionStore · Hub/Engine · user-store · …       │
│  职责：投研与 Agent 全部已有能力                                   │
│  扩展不可 import；仅经 L3 Adapter 暴露                             │
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

# Part II — 能力目录

> 下列每一项都标注：**Capability（拉）** 或 **Contribution（推）**，以及所属 Phase。

## 9. MVP 能力包

**目标**：能安装一个扩展，看到 UI，调 LLM，存私有数据，订阅系统 Event，注册一个 Hook。

### 9.1 Capabilities（拉）

| Token | 用途 | 权限 |
|-------|------|------|
| `storage` | Private Store KV + export | （内置） |
| `llm` | 模型推理 | `llm` |
| `sessions.read` | 读会话 | `sessions.read` |
| `data.query` | 行情/档案一次性查询 | `data.query` |
| `shell` | 沙盒命令 | `shell` |
| `schedule` | 注册/管理计划任务 | `schedule` |
| `events.subscribe` | 订阅系统 + 自有 Event | `events.subscribe` |
| `events.emit` | 发 `ext.{id}.*` | `events.emit` |
| `platform.info` | 部署形态、特性探测 | （内置） |

### 9.2 Contributions（推）

| 贡献点 | 用途 | Phase |
|--------|------|-------|
| `views.sidebar` / `pages` | MF UI | MVP |
| `hooks.*` | Hook 注册 | MVP（只读类 hook 优先） |
| `schedule.jobKind` | 计划任务 | MVP |
| `routes` | `/api/ext/{id}/*` | MVP |
| `agentTools` | Agent 工具 | Phase B |

### 9.3 交互（三元组 MVP 范围）

| 模式 | MVP 范围 |
|------|----------|
| **Hook** | `app/onStartup`、`session/messageCommitted`、`agent/toolPreExecute`（只读审计优先） |
| **Event** | 系统：`job.*`、`session.message.committed`、`extension.activated`；WS 扇出 |
| **Alert** | 仅 in-app toast；复用现有 schedule webhook/email **不重构** |

### 9.4 包格式与工具

| 项 | MVP |
|----|-----|
| `.opx` 安装/卸载 | ✓ |
| 本地导入 + DEV 模式 | ✓ |
| `opptrix-ext` create / build / pack | ✓ |
| 官方商店 + publish | Phase B |

---

## 10. Phase 2 能力包

**目标**：商店闭环、Agent 工具、Alert 统一、更多 Hook。

| 类别 | 新增 |
|------|------|
| Capability | `http.fetch`、`search.*`、`documents.read`、`jobs.watch` |
| Contribution | `agentTools`、settings 卡片、`views.chat` 插槽 |
| Hook | `agent/turnStart`（**仍不改写**，仅 audit）；`sessions.mutate` **仍不在此阶段** |
| Event | 扩展 `watches` 跨插件订阅；审计日志 |
| Alert | `NotificationRouter` 统一 schedule notify → in-app + webhook + email |
| 存储 | Tier 3 白名单写（如 `watchlist` 经 API） |

---

## 11. Phase 3 能力包（演进，非承诺）

| 类别 | 内容 |
|------|------|
| Hook | `sessions.mutate`、turn patch、step-up 鉴权 |
| Transport | ConversationHub、`api` channel、Bot 扩展 |
| 存储 | Tier 4 `db.plugin` 私有 SQL |
| 运行时 | 常驻 Worker、Python 长驻、`data.subscribe` |
| 语言 | WASM 脚本（评估） |
| 治理 | 扩展互调、配额 telemetry、Profile 组合 |

---

# Part III — 交付

## 12. 三阶段路线图

```
Phase A — MVP（可演示「一个扩展」）
├── Extension Manager + Host 子进程 + JSON-RPC
├── Capability：storage · llm · sessions.read · data.query · events.*
├── Contribution：MF sidebar/page · hooks（只读） · schedule job
├── EventDispatcher + WS /api/events/stream
├── .opx 本地安装 · opptrix-ext CLI
└── 验收：示例扩展 end-to-end

Phase B — 商店与 Agent 集成
├── 官方 registry · Ed25519 · publish
├── agentTools · shell · http.fetch
├── Alert 路由（in-app + 迁入 schedule notify）
└── 验收：商店安装官方示例扩展

Phase C — 高级（按需启动，不阻塞 A/B）
├── sessions.mutate · ConversationHub · Bot
├── db.plugin · data.subscribe · Worker
└── 每项独立 ADR + 安全评审
```

**禁止**：Phase A 未验收前启动 Phase C 任一子项。

---

## 13. 已锁定 ADR

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

---

## 14. 与现有代码包映射

| 抽象 | 包 / 模块 | 状态 |
|------|-----------|------|
| Private Store | `@opptrix/plugin-storage` | 已实现 |
| Event（进程内） | `@opptrix/event-bus` | 已实现 |
| Event（WS） | `apps/server` | 待 Phase A |
| Hook 分发 | Extension Manager（新） | 待 Phase A |
| Capability Gateway | ServiceContainer（新） | 待 Phase A |
| Platform 核心 | `packages/agent`、`user-store`、Hub… | 已有，Adapter 接入 |

---

## 附录 A：与 v1.3 详细规格的关系

[EXTENSION-PLATFORM.md](./EXTENSION-PLATFORM.md) v1.3 含 manifest 字段、RPC 方法表、Hook 全目录等**实现细节**。阅读顺序：

1. **本文 v2.0** — 抽象边界与 MVP  
2. **DIAGRAMS** — 看图  
3. **v1.3 规格** — 实现某模块时查阅；若与本文 MVP 冲突，**以本文为准**

---

## 附录 B：扩展作者心智模型（一页）

```
1. 写 UI（MF） + Host（activate/deactivate）
2. manifest 声明 permissions + contributes
3. 要平台能力 → Capabilities（拉）
4. 要介入生命周期 → Hooks（推，可改写）
5. 要告诉世界发生了什么 → events.emit（推）
6. 要听平台或其他扩展 → events.subscribe（拉）
7. 私有数据 → storage.*；领域数据 → data.* / sessions.*
8. 不要：直连数据库、import 内部包、在 UI 里调 LLM
```

---

*文档版本：2.0 · 2026-09-03 — 抽象优先，MVP 收敛*
