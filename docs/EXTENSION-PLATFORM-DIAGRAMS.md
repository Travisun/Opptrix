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

*图表版本：2.0 · 2026-09-03*
