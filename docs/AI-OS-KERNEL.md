# Opptrix AI OS 内核框架

> **定位**：在投研工作台之上，将现有 Agent / 会话 / 工具 / 沙盒 / 数据 / 扩展能力收敛为**可演进的 AI OS 内核**的唯一设计入口。  
> **状态**：设计稿 **v0.2**（完备性修订；未实现装配层；多数原语已以分散包存在）  
> **修订**：
> - 2026-09-04 v0.1 — 首版；对照 Agent libOS / Managed Agents / OpenClaw Memory / 扩展平台 v2.5  
> - 2026-09-04 v0.2 — 补齐 Ingress/Transport、Principal/ABI、Checkpoint、可观测与计量、Memory 晋升、Hands Port、Conformance；闭合狭隘清单  
> **近端产品**：投研 Agent 工作台  
> **远端产品**：通用 Agent 运行时（编程终端 / 任意 Domain Pack / 多通道 Bot）  
> **配套文档**：
> - 扩展与商店：[EXTENSION-PLATFORM-ARCHITECTURE.md](./EXTENSION-PLATFORM-ARCHITECTURE.md)（服从本文内核模型）
> - 现网分层：[ARCHITECTURE.md](./ARCHITECTURE.md) · [DATA-LAYER.md](./DATA-LAYER.md)
> - Agent 工具：[AGENT-GUIDE.md](./AGENT-GUIDE.md)

---

## 0. 一句话

**Opptrix Kernel = 能力门控的微内核 + 回合调度器 + 会话态 + 可插拔领域包**；LLM 是「用户态进程」的大脑，一切对世界的副作用必须经 **Syscall Gate**，不得直连内部包。入口通道（Web / Bot / Job / API）与推理正交。

---

## 1. 为什么需要「AI OS」而不是再堆功能

### 1.1 现状矛盾

| 已有优势 | 演进阻力 |
|----------|----------|
| `queryInstrumentData` 数据标准入口清晰 | Hub / `Agent.chat` / `apps/server` bootstrap 呈 God Object |
| Tool Pack Router、SessionMemory、Workspace Grant、UserPrompt 已成型 | 无统一 Composition Root；横切能力靠全局单例与 ad-hoc 回调 |
| 沙盒 Shell、子 Agent、TurnWake、Schedule 可用 | Jobs 多轨（discover / enrichment / shell / fuyao / schedule / agent jobs） |
| 扩展平台 v2.5 设计完备 | Host / Gateway / EventBus **未接线**；与 Agent 运行时两张皮 |
| Provider Registry 成熟 | 「插件」语义分裂：Provider / MCP / Tool Pack / 未来 `.opx` |

若不抽象内核，每加一条产品线（编程终端、Bot、审批流）都会继续打进 `engine.ts` / `hub.ts` / `index.ts`，终态是不可替换的投研单体，而非可演进的运行时。

### 1.2 设计目标

1. **薄内核、厚用户态**：内核只保证调度、门控、状态、审计、计量、韧性（R0/R1）；领域逻辑进 Domain Pack。  
2. **Tool ≈ Syscall**：模型产出的 tool call 不是「随便调函数」，而是经 Policy Gate 的特权调用。  
3. **Brain ⊥ Hands ⊥ Session**：推理、副作用执行、会话日志三者可独立替换与恢复。  
4. **Ingress ⊥ Inference**：通道与大脑正交；同一 Session 可被 Web / Bot / Job 唤醒。  
5. **演进不重写 + 允许纵向切片**：近端以装配与门面为主；禁止平行复制 Hub/workspace/Provider；**允许**沿 Gate 路径切开 God Object。  
6. **投研首发、通用远期**：同一内核；换 Pack / 换 Ingress 换产品形态。  
7. **可证明**：Conformance Suite 锁住不变量，防止「文档先进、实现回潮」。

### 1.3 非目标

- 不做多租户 SaaS 内核（预留 `tenantId` / `userScope` 字段，不实现隔离）  
- 不做「粘贴任意 JS 即运行」  
- 不把行情 Provider 塞进 Extension Host（ADR-14 延续）  
- 不替换 Self-Harness 命名空间（独立产品线）  
- 不在近端实现完整 IDE / LSP / 分布式多机编排产品  
- **不做图工作流内核**（LangGraph 类编排可在 Userspace/Pack，不进 L3）

### 1.4 完备性声明（v0.2）

本文 v0.2 相对 v0.1 必须覆盖的完备面：

| 面 | 章节 |
|----|------|
| Ingress / Transport | §4.3 · §5.11 |
| Principal / 信任根 | §5.0 · §7 |
| ABI 版本与弃用 | §5.2.1 · K-ADR-09 |
| Turn Checkpoint / 续跑 | §5.12 |
| Memory 晋升与 provenance | §5.5 |
| 可观测 / 计量 / 配额 | §5.13 |
| Streaming / 背压 | §5.9 · §5.4 |
| 存储一致性 | §5.14 |
| Hands Port（含远期远程） | §5.15 |
| 多 Brain 编排契约 | §5.3.1 |
| 本地推理降级 | §5.9 |
| Conformance | §11.1 · §8 |
| 已知狭隘闭环表 | 附录 A |

---

## 2. 业界参照与采纳决策

| 参照 | 可采纳 | 明确不采纳 / 改造 |
|------|--------|-------------------|
| **Agent libOS / agent-kernel** | Syscall Gate、能力默认拒绝、审计日志、工具定义与执行分离 | 不强制「改源码才能执行」；用进程/包边界 + Gateway |
| **Anthropic Managed Agents** | Brain / Sandbox / Session Log 解耦；凭据在 Vault、不进沙盒；Hands 可独立失败 | 自托管单机为主；Hands Port 预留远程，不绑定其云 |
| **OpenClaw Memory** | 记忆分层；压缩前 flush；search→get rehydration | Markdown 非唯一 SoT；SQLite + 结构化 SessionMemory 为主；**晋升必须 provenance** |
| **Commonly CAP** | Memory 作为内核原语 envelope | 暂不引入跨 runtime 协议；先内核内 envelope + ABI 版本 |
| **LangGraph** | Checkpoint 思想（回合边界快照） | 主路径仍是**线性回合环**；图编排不进内核 |
| **OpenAI Agents / MCP** | Handoff、工具 schema、MCP 作为 Hands 后端之一 | MCP ≠ 扩展 Host；External MCP 继续独立 |
| **经典 OS** | 进程、syscall、scheduler、VFS、capability、principal | 术语映射到 Agent 域；避免假 OS 过度设计 |

**核心选型**：**能力微内核（Capability Microkernel）+ 回合调度（Turn Scheduler）+ 正交 Ingress**。

---

## 3. 现状内核资产清单（As-Is → To-Be 映射）

> 原则：内核框架是**重新命名与装配**，不是推倒重来；God Object **允许纵向切片**（见 K-ADR-06）。

| 内核概念 | 现有实现 | To-Be 归属 |
|----------|----------|------------|
| **Ingress** | Fastify 路由 / WS chat / schedule runner | Kernel: Ingress Router |
| **Principal** | 隐式「本机用户」+ sessionId | Kernel: Principal + Capability set |
| **Brain（推理）** | `packages/agent` LLM registry + 回合环 | Userspace + InferencePort |
| **Session Log** | `SessionStore` turns/messages + projection | Kernel: Session Primitive |
| **Working Memory** | `SessionMemory` + structured compact | Kernel: Memory M1 |
| **Syscall 表面** | MCP tools / Tool Pack / workspace-tools | Kernel: Gate + 路由表 |
| **Policy / Approval** | ConfirmHandler、UserPromptBridge | Kernel: Approval Queue |
| **FS / Shell Hands** | `agent-workspace` grants、sandbox | Hands Port + Pack/Primitive |
| **Browser Hands** | `agent-browser` | coding Pack Adapter |
| **Jobs / Cron** | schedule + 多处 in-memory job Map | Kernel: Jobs Facade |
| **Wake / Resume** | TurnWake、job wait/watch | Scheduler + Ingress(`job`) |
| **Data Syscall** | Hub + `queryInstrumentData` | research Pack |
| **Storage** | user-store / plugin-storage | Kernel: Storage 不变量 |
| **Events** | `@opptrix/event-bus`（未接线） | Kernel: Event Bus |
| **Process 树** | subagent sessions | Kernel: Process |
| **Composition** | `apps/server` 巨石 bootstrap | AppContext |
| **扩展** | 设计稿 Host/Gateway | 同源 Gate ABI |
| **Checkpoint** | 隐式 messages/turns；无正式快照 API | Kernel: TurnCheckpoint（K5+） |
| **Observability** | 分散 log / chat debug | Kernel: Trace + Meter |

---

## 4. 目标架构总览

### 4.1 五层栈

```
┌─────────────────────────────────────────────────────────────┐
│ L1  Presentation                                            │
│     client-ui · MF 扩展 UI · EventStream WS · Alert toast   │
├─────────────────────────────────────────────────────────────┤
│ L1b Ingress（通道，非 UI）                                    │
│     web.chat · bot.* · job.wake · api.admit · ext.route     │
├─────────────────────────────────────────────────────────────┤
│ L2  Agent Userspace（「用户态」）                             │
│     Turn Loop · Tool Pack 选型 · Skills · 编排策略           │
│     Subagent fan-out/join（策略层，非内核）                   │
├─────────────────────────────────────────────────────────────┤
│ L3  Opptrix Kernel（本文焦点）                               │
│     Principal · Gate · Scheduler · Session · Memory         │
│     Jobs · Approval · Event/Hook · Storage · Meter/Trace    │
│     Checkpoint · InferencePort · HandsPort · Process Tree   │
├─────────────────────────────────────────────────────────────┤
│ L4  Domain & Resource Providers（「驱动」）                   │
│     research-hub / Engine / Providers                       │
│     workspace · browser · schedule backends · External MCP  │
│     Extension Host workers ·（远期）Remote Hands            │
├─────────────────────────────────────────────────────────────┤
│ L5  Host Platform                                           │
│     Node sidecar · SQLite · OS 进程 · 网络 · Electron 可选  │
└─────────────────────────────────────────────────────────────┘
```

与扩展平台映射：

| AI OS 层 | 扩展平台映射 |
|----------|--------------|
| L3 Kernel | ① Platform Primitives 实现核心 |
| L4 Drivers | ② Domain Packs + Provider + MCP + Host |
| L1 / L1b + 扩展 UI | ③ Extensions + Presentation + Conversation Transport |
| Gate | Capability Gateway **同源 ABI** |

### 4.2 控制流（一次入站消息）

```
Ingress.admit(Envelope)
    │  校验 Principal · 附 traceId · 计量入口
    ▼
Session.admit(userTurn)              ← Session Log 权威写入
    │
    ▼
Scheduler.scheduleTurn(session)      ← 独占 / abort / 配额
    │
    ▼
Userspace Turn Loop (Brain via InferencePort)
    │  tool_calls[]
    ▼
┌─ Gate.submit(ActionRequest) ─────────────────────┐
│  Principal → Policy → Approval? → Hands/Pack     │
│  Meter + Audit + Event → Observation               │
└──────────────────────────────────────────────────┘
    │
    ▼
（可选）TurnCheckpoint.save(boundary)
    │
    ▼
Session.commit(assistant) + Memory.flush/compact
    │
    ▼
Event: session.message.committed → Hook / Alert / Ingress 回执
```

**不变量（硬）**：

1. **唯一副作用入口**：`kernel.submit(action)`（Agent 工具、扩展 RPC、系统任务、未来 Bot 动作一律适用）。  
2. **默认拒绝**：未声明 capability / pack 未启用 / Principal 不足 → 拒绝并返回可理解 Observation（含 `denialCode`）。  
3. **Session Log 权威**：崩溃恢复只信任 Session + Jobs + Checkpoint；不信任 Brain 堆内存。  
4. **R0 / R1**：扩展与 Pack 不得阻塞 listen；关闭有界。  
5. **Ingress ⊥ Inference**：通道不得内嵌领域业务；只产出标准 `Envelope`。  
6. **每条 submit 可审计、可计量**：必有 `auditId` + `traceId`；成本入 Meter。  
7. **Memory 晋升守恒**：进入 M3 Durable 必须带 provenance；禁止工具原始大 JSON 直接晋升。

### 4.3 Ingress ⊥ Inference（正交面）

| Ingress 种类 | 近端 | 远期 | 产出 |
|--------------|------|------|------|
| `web.chat` | ✓ 现有 UI/WS | — | Envelope(user text + attachments) |
| `web.api` | ✓ REST 工具/会话 | 稳定 External Admit API | Envelope |
| `job.wake` | ✓ TurnWake / schedule | 统一 Jobs 终态唤醒 | Envelope(wakeResume) |
| `bot.*` | Phase C（扩展 Conversation） | 钉钉/飞书/Telegram… | Envelope（同一 Session 或绑定会话） |
| `ext.route` | 扩展 HTTP `/api/ext/*` | — | 经 Gate，不直达 Hub |

**禁止**：Bot 适配器直接 `import` Hub 或绕过 Session.admit。  
**回执**：Ingress 只消费 Event/Alert 或专用 `Ingress.reply` Port，不持有 Brain 句柄。

---

## 5. 内核子系统

### 5.0 Principal（信任根）

```ts
type PrincipalKind = 'user' | 'session' | 'extension' | 'system' | 'remote'

type Principal = {
  kind: PrincipalKind
  id: string                    // userId | sessionId | pluginId | 'system' | remoteNodeId
  sessionId?: string            // 绑定会话时
  rootSessionId?: string
  packIds: string[]             // 启用中的 Domain Pack
  capabilities: string[]        // 已授予 Token 或权限声明
  tenantId?: string             // 预留；单机恒为 default
  attrs?: Record<string, string>
}
```

| 规则 | 说明 |
|------|------|
| 入站 | Ingress 必须解析/构造 Principal；匿名仅 `system` 内部任务 |
| 降权 | 子 Agent Principal 继承 root 的 grant，**能力集可严格子集** |
| 扩展 | `.opx` Principal = 签名身份 + manifest 权限 ∩ 用户授权 |
| 远程 Hands（远期） | `kind: 'remote'`；仅能执行已签发的 Action 票据，不持 Vault |

### 5.1 AppContext（Composition Root）

```ts
type AppContext = {
  abiVersion: string            // 见 §5.2.1
  kernel: OpptrixKernel
  packs: PackRegistry
  extensions: ExtensionManager  // 可空 stub
  ingress: IngressRouter
  services: {
    userStore: UserDataStore
    marketData: MarketDataService
    // …
  }
}
```

- 启动：`createAppContext()` → `listen` → `kernel.boot()`（失败隔离，R0）  
- 关闭：`kernel.shutdown(S0–S3)` → 接入 `runSidecarShutdown`；先 `app.shuttingDown`  
- 测试：注入 fake Gate / Memory / Jobs / Ingress / Hands  
- 现有 `getUserDataStore()` 等 = **薄代理**；新代码禁止再增裸全局  

### 5.2 Gate（Syscall 门）

| 字段 | 说明 |
|------|------|
| `traceId` / `auditId` | 贯穿可观测 |
| `principal` | §5.0 |
| `action` | `{ token, method, args, resource? }` |
| `policy` | pack ∩ manifest ∩ grant ∩ quota ∩ abi |
| `result` | `{ ok, observation, denialCode?, auditId, meter? }` |

**Token 命名空间（稳定 ABI）**：

| 前缀 | 层 | 示例 |
|------|-----|------|
| `sys.*` | 内核 | `sys.session.*`、`sys.memory.*`、`sys.jobs.*`、`sys.checkpoint.*` |
| `llm.*` | 内核 | `llm.chat`、`llm.models.list` |
| `storage.*` | 内核 | `storage.kv.*`（白名单） |
| `shell.*` / `fs.plugin.*` | 原语 | 沙盒、扩展私有盘 |
| `data.*` | research | `data.query` |
| `fs.workspace.*` / `browser.*` / `terminals.*` | coding | 工作区与浏览器 |
| `ext.{id}.*` | 扩展 | 仅该扩展 |

现有 Tool Pack **工具名 → Token** 一层路由表；Agent 可继续看到友好 tool 名。

#### 5.2.1 ABI 版本与弃用（K-ADR-09）

| 项 | 规则 |
|----|------|
| `kernel.abiVersion` | semver；启动写入 `platform.info` |
| Token 新增 | minor；文档 + Conformance 用例 |
| Token 行为破坏 | major；必须双轨至少一个发版周期 |
| 弃用 | `deprecatedTokens` 表：`since` / `removeAt` / `successor` |
| 扩展 / Agent | 协商失败 → 明确错误，禁止静默降级到「全开」 |

### 5.3 Process 模型（会话树）

| OS 概念 | Opptrix |
|---------|---------|
| Process | `Session`（user / subagent） |
| PID | `sessionId` |
| PPID | `parentSessionId` |
| Root | `rootSessionId` |
| Threads | 同 session **禁止并行 chat**（abort 旧轮） |
| IPC | Event + Observation；禁止共享可变堆 |

#### 5.3.1 多 Brain 编排契约（Userspace，内核只提供原语）

| 契约 | 内核提供 | Userspace 负责 |
|------|----------|----------------|
| spawn | `Process.create(child)` + 子集 Principal | 何时 spawn |
| fan-out / join | 无；仅 Event | Skill/专家策略 |
| 预算继承 | Meter 子账户 / 配额切分 API | 分配策略 |
| 失败 | 子 session 终态 Event | 重试 / 取消兄弟 |
| 工具冻结 | `sys.session.freezeTools` | 选型卡 |

**禁止**：在内核实现 Crew/Graph 调度器。

### 5.4 Scheduler

职责：

- 会话独占回合、abort、unattended / wake_resume  
- Jobs 就绪 → Ingress(`job.wake`)  
- **配额与背压**（见 §5.13）：LLM 并发、Gate 并发、扩展 Host 并发、工具并行上限  

默认建议（可配置，进 Conformance 软断言）：

| 配额 | 默认 |
|------|------|
| 全局 LLM 并发 | 4 |
| 单 session 工具并行 | 1（近端保持串行；远期可放宽有依赖分析的子集） |
| 扩展 Host 进程 | 16（扩展 §10.11） |
| 单 turn wall time | 可配；超时 → abort + Checkpoint |

### 5.5 Memory（内核原语 + 晋升）

| 层级 | 内容 | 注入 | 现有映射 |
|------|------|------|----------|
| **M0 Instructions** | 系统提示、persona、Skill | 每轮稳定前缀 | `buildRoundSystemPrompt` |
| **M1 Working** | 结构化工作记忆 | 压缩后 ModelView | `SessionMemory` |
| **M2 Episodic** | turns / 工具轨迹 | 默认不整段；search→get | SessionStore + projection |
| **M3 Durable** | 用户策展 / 投研结论 | 预算内；须 provenance | 预留；可接 doc-library |
| **M4 Prospective** | 意图、定时、wake | 触发时 | Schedule + TurnWake |

**晋升规则（硬）**：

1. 压缩前必须 **flush M1**（保留目标/约束/标的/事实）。  
2. M2→M3 仅经 `sys.memory.promote`；载荷含 `provenance: { sourceTurnIds, toolAuditIds?, humanConfirmed? }`。  
3. **禁止**工具原始 JSON / 大表直接写入 M3。  
4. 投研场景：涉及「结论/评级」的 M3 条目默认要求 `humanConfirmed=true` 或显式用户导出动作（产品可配置，默认偏严）。  
5. Rehydration API：`sys.memory.search` / `sys.memory.get`（K5+；近端可先内部函数）。

### 5.6 Jobs Facade

```
sys.jobs.list | watch | cancel | registerKind | run
kind: schedule.* | shell.* | discover.* | enrichment.* | fuyao.* | pack.* | ext.*
```

- 先只读聚合 + cancel 代理，再 `registerKind`  
- **禁止**再新增独立 `Map<string, Job>` 模块  
- 终态必须 `Event: job.terminal` → 可触发 Ingress wake / Alert  

### 5.7 Approval（人在回路）

统一 `UserPromptBridge` + Shell/network/install Confirm → `Approval.request` 队列。  

| 规则 | 说明 |
|------|------|
| 挂起 | Gate 可返回 `pending_approval`；Brain 轮次可暂停或短轮询 |
| 超时 | 可配；超时 = deny |
| Secret | Vault 写入；Observation **永不**含明文 |
| unattended | 默认拒绝需人批的动作（或策略表显式允许） |

### 5.8 Event / Hook / Alert

| 总线 | 职责 |
|------|------|
| Hook | 可变异拦截；超时；失败可跳过 |
| Event | 只读广播 + WS；内核第一发布者 |
| Alert | Event 消费者（Phase B） |

Boot 必须接线：`app.startup` / `app.shuttingDown` / `app.shutdown`。

### 5.9 InferencePort（含本地降级）

```ts
interface InferencePort {
  chat(view, tools, signal, opts): AsyncTurn   // 支持流式 delta
  listModels(): ModelRef[]
  health(): { ok: boolean; backend: 'remote' | 'local' | 'degraded' }
}
```

| 规则 | 说明 |
|------|------|
| 厂商无关 | Core 不绑定单一云厂商 |
| 流式 | delta → Userspace → Ingress/UI；背压时丢弃中间 token 进度、保留最终 |
| 降级 | remote 失败 → local（若已装）→ 明确错误 Observation；半开熔断 |
| 超时 | 由 Scheduler/opts 统一；计入 Meter |

### 5.10 Domain Pack Runtime

| Pack | 职责 | 策略 |
|------|------|------|
| `research`（默认） | `data.*`、投研清单/评估 Adapter | **包装** Hub/Engine |
| `coding`（Phase D） | workspace / browser / terminals | **包装** agent-workspace / browser |
| 未来垂直包 | Token 集 | 官方或签名清单（ADR-13） |

Pack = 能力面；Builtin `.opx` = 可选组装。

### 5.11 Ingress Router

```ts
interface IngressAdapter {
  id: string
  admit(raw: unknown, principal: Principal): Promise<Envelope | Denial>
  reply?(sessionId: string, event: OutboundEvent): Promise<void>
}
```

`Envelope` 最小字段：`traceId`、`sessionId?`、`text`、`attachments?`、`origin`（`user` \| `wake_resume` \| `bot` \| …）、`principal`。

### 5.12 Turn Checkpoint（可恢复，非图内核）

| 项 | 规则 |
|----|------|
| 边界 | 每个 **用户 turn 结束** 与 **长工具批前后** 可存 |
| 内容 | messages/turns 水位、M1 快照指针、活跃 job ids、frozen tools 指纹 |
| API | `sys.checkpoint.save` / `restore` / `list` |
| 用途 | 进程崩溃续跑、用户「从某助手消息截断后重来」（可与现有 truncate API 对齐） |
| 非目标 | 任意节点时间旅行 UI（产品可选，内核只给原语） |

近端（K2–K4）：SessionStore 已是事实快照 → Checkpoint API 可先做薄封装。  
K5+：显式版本化 checkpoint 记录。

### 5.13 Trace · Meter · Quota

| 信号 | 说明 |
|------|------|
| `traceId` | Ingress 生成；贯穿 admit → turns → submit → provider |
| `auditId` | 每次 Gate.submit 一条；append-only（SQLite/JSONL） |
| Meter | token in/out、工具次数、耗时、拒绝次数；按 session/principal/pack 聚合 |
| Quota | Scheduler 强制；超限 → `denialCode: quota_exceeded` |
| 导出 | 设置页/诊断包可导出审计（脱敏） |

### 5.14 Storage 一致性

| 不变量 | 说明 |
|--------|------|
| 单写者 | 单机默认单一 Node 进程写 user-store / market-data |
| 库隔离 | user-store ≠ plugin-data ≠ market-data；禁止跨库无门控 SQL |
| 迁移 | 现有 SCHEMA_VERSION / 幂等迁移继续；Kernel boot 先迁移再 admit |
| 备份 | 产品级导出；内核只保证 close 有序（R1） |
| 事务 | 单库事务；跨库用「会话水位 + 重试」而非分布式事务 |

### 5.15 HandsPort（含远期远程）

```ts
interface HandsPort {
  invoke(ticket: ActionTicket): Promise<Observation>
  // ticket 由 Gate 签发：principal + token + args 哈希 + 短 TTL
}
```

| 部署 | 近端 | 远期 |
|------|------|------|
| in-process | workspace/shell/browser 适配器 | — |
| subprocess | Extension Host | 同 |
| remote | 不实现 | 独立 runner 持 HandsPort；**不持 Vault**；凭 ticket 调后端 |

Brain 永不直接持有 OS 凭据；对齐 Managed Agents「Vault + Proxy」。

---

## 6. 与扩展平台的边界

```
          ┌──────────── AI OS Kernel (本文) ────────────┐
          │  Principal · Gate · Session · Memory · …   │
          └───────────────┬──────────────────────────────┘
                          │ 同源 Gateway ABI（含 abiVersion）
          ┌───────────────▼──────────────────────────────┐
          │  Extension Host · MF UI · 商店 · Alert         │
          │  EXTENSION-PLATFORM-ARCHITECTURE.md          │
          └──────────────────────────────────────────────┘
```

- 扩展不得 `import @opptrix/agent` / Hub。  
- Agent Userspace 与 Extension **无特权后门**。  
- Provider 仍走 Engine Registry。  
- Conversation Transport（Bot）= Ingress 适配器，细节见扩展 Phase C，**契约服从本文 §4.3**。

---

## 7. 安全模型

1. **Principal + Capability**：默认拒绝；三重交（pack · manifest · grant）+ 配额。  
2. **凭据**：Vault + inject_hosts；Hands / 远程 runner 不持长期密钥。  
3. **审计**：每次 submit 不可改记录；含 denial。  
4. **隔离**：扩展子进程；Shell 沙盒；浏览器上下文；plugin-data 配额。  
5. **注入面**：Observation 消毒；Hook 超时；Event 载荷上限。  
6. **Memory 投毒防护**：M3 provenance + 默认人工确认结论类条目。  
7. **ABI 协商失败安全**：拒绝，不「全开兼容」。

---

## 8. 演进路线

| 里程碑 | 交付 | 验收 |
|--------|------|------|
| **K0** | 本文 v0.2；禁止新平行 Job Map | 评审通过 |
| **K1** | AppContext + EventBus 接线 + shutdown 事件 | listen 行为不变 |
| **K2** | Gate 薄封装 tool 路径；Principal 最小集；auditId | Agent 黄金用例绿 |
| **K3** | Jobs Facade list/cancel | 统一列任务 |
| **K4** | research Pack 显式开关 | 关 Pack 拒 `data.*` |
| **K5** | Checkpoint API 薄封装；Meter 基础；Memory search 内部版 | 崩溃续跑手工测 |
| **K6** | Approval 队列统一；Ingress 接口抽出（web+job） | Bot 可挂适配器空壳 |
| **其后** | coding Pack、Extension Host、Remote Hands、M3 产品化 | 扩展 B/C/D |

推荐默认顺序：**K1 → K3 → K2 → K4 → K5 → K6**，Host 空壳可与 K2+ 并行。

**切片纪律（K-ADR-06）**：

- ✅ 允许：从 `Agent.chat` **抽出** Gate 调用、Session 写入、Meter（纵向）  
- ❌ 禁止：再写一套 query/Hub/workspace「干净实现」绕过旧路径（水平复制）

---

## 9. 包与目录前瞻

| 模块 | 职责 | 何时 |
|------|------|------|
| `apps/server/src/kernel/` | 起步装配，避免过早拆包 | K1 |
| `@opptrix/kernel` | Gate、Principal、Jobs、Memory API、Checkpoint、Meter 类型 | K2–K5 |
| `@opptrix/kernel-node` | Node 装配、shutdown、Ingress 主机 | K1+ |
| `@opptrix/domain-research` | research Pack | K4 |
| `@opptrix/domain-coding` | coding Pack | Phase D |
| 现有 agent / event-bus / plugin-storage | Userspace / 原语实现 | 持续 |

---

## 10. ADR（锁定）

| ID | 决策 |
|----|------|
| **K-ADR-01** | Capability Microkernel + Turn Scheduler，非图工作流内核 |
| **K-ADR-02** | 一切副作用经 `kernel.submit` |
| **K-ADR-03** | Brain ⊥ Session Log ⊥ Hands；恢复以 Session/Jobs/Checkpoint 为准 |
| **K-ADR-04** | Memory 分层 M0–M4；压缩前 flush M1；M3 须 provenance |
| **K-ADR-05** | Domain Pack 官方治理（扩展 ADR-13） |
| **K-ADR-06** | 装配演进 + **允许纵向切片**；禁止水平复制核心路径 |
| **K-ADR-07** | 扩展 Gateway 与 Agent Gate 同源 ABI |
| **K-ADR-08** | R0/R1 韧性铁律 |
| **K-ADR-09** | `abiVersion` semver + Token 弃用窗口 |
| **K-ADR-10** | Ingress ⊥ Inference；Bot/Job/Web 统一 Envelope |
| **K-ADR-11** | HandsPort + ActionTicket；远期可远程；Vault 不进 Hands |
| **K-ADR-12** | 可观测硬性：traceId + auditId + Meter；配额由 Scheduler 强制 |

---

## 11. 成功标准

| 维度 | 指标 |
|------|------|
| 可替换 | 关 `research` 仍可聊；仅数据 syscall 失败 |
| 可恢复 | 崩溃后 transcript + jobs + checkpoint 可续 |
| 可审计 | 任意工具调用 → auditId + principal + token + traceId |
| 可计量 | 会话级 token/工具耗时可查询 |
| 可扩展 | 新垂直 = Pack + 可选 `.opx`；新通道 = IngressAdapter |
| 通道正交 | 增加 Bot 适配器不改 Gate/Brain 核心 |
| 不回退 | K2+ 黄金用例绿；启动不劣于现状 |
| 可证明 | Conformance Suite 门禁红线 |

### 11.1 Kernel Conformance Suite（门禁）

| 用例 ID | 断言 |
|---------|------|
| C-R0 | 扩展 activate 失败不阻止 `/api/health` |
| C-R1 | shutdown 在 forceExitMs 内退出；发出 shuttingDown |
| C-GATE-DENY | 未授权 token → denial，无副作用 |
| C-GATE-AUDIT | 每次 submit 恰一条 audit |
| C-PACK | 禁用 research → `data.query` deny |
| C-JOBS | list 含至少 schedule + 一种 in-memory 后端 |
| C-MEM-FLUSH | compact 后 M1.goal/entities 非空（有输入时） |
| C-MEM-PROMOTE | 无 provenance 的 promote 拒绝 |
| C-INGRESS | job.wake 与 web.chat 均经 Session.admit |
| C-ABI | 协商失败不静默全开 |

实现位置建议：`tests/kernel-conformance/*.mjs`（K2 起逐步填绿）。

---

## 12. 文档关系

```
AI-OS-KERNEL.md          ← 你在这里（运行时内核 · 权威）
    ├── EXTENSION-PLATFORM-ARCHITECTURE.md
    ├── ARCHITECTURE.md / DATA-LAYER.md
    ├── AGENT-GUIDE.md
    └── SELF-HARNESS-PRODUCT.md   （禁止命名空间混用）
```

冲突时：**本文不变量（§4.2 / §10）> 扩展文档细节 > 历史实现规格 > 代码偶然结构**。

---

## 13. 下一步（产品确认）

默认推荐：**K1 → K3 → K2 → K4**（与扩展 Host 空壳并行）。

若安全边界优先：可 **K1 → K2 → K3 → K4**。

---

# 附录 A — 狭隘点闭环（v0.1 → v0.2）

| v0.1 狭隘 | v0.2 处置 | 状态 |
|-----------|-----------|------|
| Transport 几乎没写 | §4.3 · §5.11 · K-ADR-10 | 闭环 |
| 身份与信任根弱 | §5.0 Principal | 闭环（实现待 K2） |
| 可观测性一句带过 | §5.13 · K-ADR-12 · Conformance | 闭环 |
| Checkpoint 缺失 | §5.12 · K5 | 设计闭环 |
| 多 Brain 无契约 | §5.3.1 | 闭环 |
| Streaming / 背压 | §5.4 · §5.9 | 闭环 |
| 存储一致性 | §5.14 | 闭环 |
| 本地模型降级 | §5.9 | 闭环 |
| 投研记忆污染 | §5.5 晋升规则 | 闭环 |
| ABI 无版本 | §5.2.1 · K-ADR-09 | 闭环 |
| 无 Conformance | §11.1 | 闭环 |
| 「不重写」过死 | K-ADR-06 纵向切片 | 闭环 |
| Hands 仅本机 | §5.15 Remote 预留 | 设计闭环 |
| 多租户 | 仍非目标；字段预留 | **有意延后** |
| 分布式图编排 | 仍非目标 | **有意延后** |

# 附录 B — Envelope / ActionRequest 最小 schema（设计）

```ts
type Envelope = {
  traceId: string
  origin: 'user' | 'wake_resume' | 'bot' | 'api' | 'system'
  principal: Principal
  sessionId?: string
  text: string
  attachments?: Array<{ id: string; kind: string }>
  meta?: Record<string, unknown>
}

type ActionRequest = {
  traceId: string
  principal: Principal
  token: string
  method: string
  args: Record<string, unknown>
  resource?: string
}

type Observation = {
  ok: boolean
  denialCode?: string
  data?: unknown
  message?: string
  auditId: string
  meter?: { durationMs: number; costHint?: number }
}
```

# 附录 C — 术语表

| 术语 | 含义 |
|------|------|
| Kernel | L3 门控与原语，不含领域业务 |
| Userspace | Turn Loop / Pack 策略 / Skill |
| Syscall / Token | Gate 上的稳定能力名 |
| Pack | 官方领域能力面 |
| Ingress | 入站通道适配器 |
| Hands | 副作用执行后端 |
| Principal | 调用者身份与能力集 |
| Checkpoint | 回合边界可恢复快照 |
| Meter | 用量与配额计量 |
