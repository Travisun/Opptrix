# Opptrix 扩展平台 — 架构图（v2.0 抽象）

> 抽象架构正文：[EXTENSION-PLATFORM-ARCHITECTURE.md](./EXTENSION-PLATFORM-ARCHITECTURE.md)  
> 实现细节：[EXTENSION-PLATFORM.md](./EXTENSION-PLATFORM.md)

---

## 1. 四层平面（总览）

```mermaid
flowchart TB
  subgraph L1["L1 Presentation"]
    Shell[App Shell]
    MF[MF Host]
    Slots[Contribution Slots]
    Shell --> MF --> Slots
  end

  subgraph L2["L2 Platform — 现有 Opptrix 核心"]
    Agent[Agent Engine]
    Hub[Research / Search Hub]
    Store[user-store / market-data / …]
    Agent --> Hub --> Store
  end

  subgraph L3["L3 Runtime"]
    EM[Extension Manager]
    GW[Capability Gateway]
    HB[Hook Dispatcher]
    EB[Event Dispatcher]
    HostA[Host 子进程 A]
    HostB[Host 子进程 B]
    EM --> GW
    EM --> HB
    EM --> EB
    EM <-->|stdio RPC| HostA
    EM <-->|stdio RPC| HostB
  end

  subgraph L4["L4 Governance"]
    Perm[Permissions]
    Sig[Ed25519]
    Audit[Audit / Quota]
  end

  L1 <-->|HTTPS + WS| L3
  GW --> L2
  HB --> HostA
  HB --> HostB
  L4 -.-> L3
```

---

## 2. 双轴模型：Capabilities × Contributions

```mermaid
flowchart LR
  subgraph Ext["Extension Host"]
    Code[activate / handlers]
  end

  subgraph Pull["Capabilities 拉"]
    ST[storage]
    LLM[llm]
    DATA[data.query]
    SESS[sessions.read]
  end

  subgraph Push["Contributions 推"]
    UI[views / pages]
    HK[hooks]
    JOB[schedule jobs]
    RT[routes]
  end

  Code -->|service/call| Pull
  Push -->|lifecycle callback| Code
```

---

## 3. 交互三元组

```mermaid
flowchart TB
  Engine[Platform Lifecycle / Agent Engine]

  Engine --> Hook[Hook 拦截 · 可变]
  Hook --> ExtHook[Extension Handler]
  ExtHook --> Engine

  Engine --> Event[Event 广播 · 只读]
  Event --> Sub1[Extension / UI 订阅]
  Event --> Sub2[WebSocket 扇出]

  Event --> Alert{Alert 策略}
  Alert --> User[用户 in-app / webhook / email]
```

---

## 4. 存储分层

```mermaid
flowchart TB
  Ext[Extension Host]

  Ext --> T1[Tier 1 Private Store KV]
  Ext --> T2[Tier 2 Domain API]
  Ext -.-> T3[Tier 3 Shared Write Phase 2]
  Ext -.-> T4[Tier 4 Private SQL Phase 3]

  T1 --> FS["plugin-data/{id}/"]
  T2 --> DQ[data.query]
  T2 --> SR[sessions.read]
  T2 --> DOC[documents.*]
```

---

## 5. 推理 × 对话（正交）

```mermaid
flowchart LR
  subgraph Transport["Conversation Transport"]
    Web[web MVP]
    API[api Phase 3]
    Bot[bot Phase 3]
  end

  subgraph Inference["Inference"]
    LLM[LlmProvider]
  end

  Transport --> Engine[Agent Engine]
  Engine --> Inference
  Engine --> Transport
```

---

## 6. 三阶段交付

```mermaid
flowchart LR
  A[Phase A MVP<br/>Host + MF + storage + events]
  B[Phase B 商店<br/>registry + tools + alert]
  C[Phase C 演进<br/>mutate · bot · db.plugin]

  A --> B
  B --> C

  style C fill:#f5f5f5,stroke-dasharray: 5 5
```

---

## 7. R0 启动时序（强制）

```mermaid
sequenceDiagram
  participant Boot as apps/server bootstrap
  participant Core as L2 Platform
  participant Health as /api/health
  participant Ext as ExtensionManager

  Boot->>Core: register routes
  Boot->>Health: listen OK
  Note over Boot,Health: Phase 0 完成 — 不等待扩展

  Boot-->>Ext: setImmediate scan（Phase 1 异步）
  Ext->>Ext: parse manifests（可失败）

  Note over Ext: Phase 2：仅 Enabled 扩展 spawn Host
  Ext->>Ext: activate 超时 → Disabled

  Note over Boot: 聊天/行情/会话 全程不 await Ext
```

---

## 8. R1 关闭时序（有界 best-effort）

```mermaid
sequenceDiagram
  participant OS as SIGTERM
  participant SD as runSidecarShutdown
  participant Ext as ExtensionManager
  participant Core as user-store / natives

  OS->>SD: shutdown()
  SD->>SD: stopSchedulers
  SD->>Ext: extensionShutdownPhase（预算 ≤5s）
  Ext->>Ext: app.shuttingDown Event
  Ext->>Ext: Hook app/onShutdown + deactivate（并行，per-ext 超时）
  Ext->>Ext: flush plugin-storage
  Ext->>Ext: app.shutdown Event
  SD->>Core: closeBrowsers → closeHttp → … → user-store
  Note over SD: forceExitMs 到期 → 强制 exit（已有）
```

---

## 9. 通用原语 vs 领域包（产品三层）

```mermaid
flowchart TB
  subgraph L3ext["③ Extensions .opx"]
    E[Host + MF UI]
  end
  subgraph L2pack["② Domain Packs"]
    R[research]
    C[coding]
    X[任意方案]
  end
  subgraph L1prim["① Platform Primitives"]
    P[llm storage shell tools events …]
  end
  E --> R
  E --> C
  E --> X
  E --> P
  R --> P
  C --> P
  X --> P
```

---

*图表版本：2.4.1 · 2026-09-04 — 产品三层*
