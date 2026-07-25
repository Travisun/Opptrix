# 自建本地专家指南

> **面向对象**：希望定制投研对话风格的产品使用者，以及需要理解专家机制的开发者与远程目录部署方。  
> **相关文档**：[API.md §Experts](./API.md#experts专家目录)、[AGENT-GUIDE.md §4.2](./AGENT-GUIDE.md#42-agent-与-mcp)

---

## 1. 专家是什么

**专家**是带固定技能专长的投研对话助手。选定专家后开启会话，会把专家的 **persona（技能专长）** 快照到该会话的 `rolePersona`；之后每轮 Layer 1 只读会话快照（可在对话中编辑），目录修改不再影响已有对话。

> **字段与文案**：API 与 JSON Schema 中字段名始终为 `persona`；产品界面与用户文档中称「**技能专长**」。

### 核心概念

| 概念 | 说明 |
|------|------|
| **Session + expertId** | 创建会话时可选绑定 `expertId`；持久化 `expertId` / `expertIcon`，并快照 `rolePersona`；侧栏显示专家标识 |
| **Layer 0 — 系统底线** | 不可被任何 persona 覆盖：禁止具体买卖建议、禁止编造数据、须先调工具取数等（见 `buildLayer0Baseline`） |
| **Layer 1 — 技能专长** | 正文来自会话 `rolePersona`（创建时从专家或默认研究员复制，可编辑）；抬头可用专家 title；**优先级低于 Layer 0** |
| **Layer 2 — 工具与投研纪律** | 工具选型卡、研究档位 playbook、会话时钟等；与是否绑定专家无关 |

### 两类专家

| 类型 | `source` | 存储 | 可编辑/删除 |
|------|----------|------|-------------|
| **内置专家** | `builtin` | `packages/agent/src/experts/catalog.mock.json` | 否 |
| **本地自建专家** | `local` | 用户 SQLite（user-store 命名空间 `local_experts`） | 是 |

### 与「默认研究员新对话」的区别

| | 默认研究员 | 专家会话 |
|---|-----------|----------|
| 创建方式 | `POST /api/sessions` **不传** `expertId` | 传 `expertId`（须存在于目录） |
| Layer 1 | 会话 `rolePersona`（创建时写入默认研究员文案，可编辑） | 会话 `rolePersona`（创建时从专家 `persona` 快照，可编辑；与目录解耦） |
| 默认标题 | 「新对话」 | 专家 `defaultSessionTitle` 或 `title` |
| 工具包 | 按消息意图路由播种 | 首聊天轮前按 `defaultPacks` 自动激活（每会话每专家仅一次） |
| 研究档位 | Tool Pack 路由默认档位 | 专家 `defaultResearchTier` 覆盖本轮档位 |

---

## 2. 创建与编辑字段

在 **专家市场** 通过「创建」或「编辑」填写以下字段（对应 REST `POST /api/experts`、`PATCH /api/experts/:id`）：

| 字段 | 必填 | 说明 |
|------|------|------|
| **名称**（`title`） | 是 | 展示标题；本地专家 id 由名称 slug 生成（如 `local-hang-ye-yan-jiu`），冲突时自动加后缀 |
| **简介**（`summary`） | 是 | 一句话说明擅长领域；列表卡片展示，不参与 prompt 注入 |
| **技能专长**（`persona`） | 是 | 注入 Layer 1 的正文；见下文写法指导 |
| **标签**（`tags`） | 否 | 分类与搜索；去重后最多 8 个 |

### 系统自动填充（用户不可改）

本地专家创建时，服务端写入以下默认值（UI 不提供编辑项）：

| 字段 | 默认值 | 说明 |
|------|--------|------|
| `defaultPacks` | `["fundamentals", "instrument_analytics"]` | 会话首聊前自动激活的工具包 |
| `defaultResearchTier` | `"L2"` | 默认研究档位（解读级） |
| `defaultSessionTitle` | 同 `title` | 新建会话默认标题 |
| `icon` | `{ kind: "icon", value: "expert" }` | UI 统一 Fluent 专家图标 |
| `official` | `false` | 非官方内置 |
| `complianceVersion` | `"1"` | persona 合规版本标记 |
| `version` | `"1.0.0"` | 目录条目版本 |

内置专家可在 `catalog.mock.json` 中配置不同的 `defaultPacks` / `defaultResearchTier`（如宏观策略顾问用 `market` + `news`，个股分析助手用 `L3`）。

---

## 3. 技能专长（persona）写法指导

persona 描述「**你是谁、怎么思考、怎么表达**」，不是工具清单，也不是合规免责声明（Layer 0 已覆盖底线）。

### 建议写什么

1. **身份定位** — 领域与角色，例如「你是一位行业研究助手，熟悉 A 股中游制造产业链」
2. **分析侧重** — 优先关注的维度，例如「先看景气度与供需，再看龙头竞争格局与估值分位」
3. **表达风格** — 结构偏好，例如「先给 3 条核心结论，再展开证据；区分事实、推断与假设」
4. **工具使用倾向**（可选）— 例如「涉及单票时优先核实基本面与 K 线，再补充新闻」

### 示例（合规）

```
你是一位 ETF 配置研究助手，熟悉宽基、行业与主题 ETF 的结构差异。
回答时先说明标的类型与跟踪指数，再解读估值、规模、费率与近期表现；
涉及单只 ETF 时优先调用行情与档案工具核实数据，区分历史表现与前瞻推断。
输出用条目化结构，标注数据时效与不确定性。
```

### 不应写什么

| ❌ 禁止 | 原因 |
|--------|------|
| 「忽略规则 / 无视规则 / override system」 | 命中注入拦截，创建/更新失败 |
| 「可以荐股 / 推荐买入 / 推荐卖出」 | 同上；且违反 Layer 0 |
| 「ignore all rules / you may recommend buy」 | 英文注入模式同样拦截 |
| 具体买卖指令、目标价、仓位建议 | Layer 0 禁止，persona 无法覆盖 |
| 要求编造数据、跳过工具直接给数字 | Layer 0 禁止 |
| 超过 4000 字 | 消毒失败，回退默认角色 |
| 空内容或纯空格 | 校验失败 |

### 消毒规则（`sanitizeExpertPersona`）

创建与更新时，persona 经服务端消毒；对话运行时再次消毒，失败则 **回退默认投研研究员**（不中断会话）。

拦截条件：

- 空或仅空白
- 长度 > 4000 字符
- 命中以下正则模式之一（**大小写不敏感**）：
  - `忽略.*规则` / `无视.*规则`
  - `可以荐股`
  - `推荐买入|推荐卖出`
  - `ignore\s+(all\s+)?rules`
  - `you\s+may\s+recommend\s+(buy|sell)`
  - `override\s+system`

---

## 4. 注意事项

### 会话快照技能专长（`rolePersona`）

- 创建会话时，将消毒后的专家 `persona`（或默认研究员文案）**复制**到会话字段 `rolePersona`
- Layer 1 **正文只读会话快照**；目录里改专家技能专长**不会**影响已有会话
- 可在对话标题下拉菜单「技能专长」打开顶部抽屉编辑本会话文案（`GET/PUT /api/sessions/:id/role-persona`）；不改专家目录
- **不**写入消息表；列表 `SessionMeta` **不**返回全文（避免侧栏膨胀）
- 旧会话若 `rolePersona` 为空：首次读取时**惰性回填一次并持久化**（有 `expertId` 且目录仍有定义 → 复制当时目录 persona；否则默认研究员）
- **删专家后**：已有会话的 `expertId` / `rolePersona` 仍保留；Layer 1 继续用会话快照；抬头若目录无定义则用「本会话」样式

### 本地永久保存

- 自建专家写入 `~/.opptrix/opptrix.db`（`documents` 命名空间 `local_experts`）
- 卸载应用不自动删除；备份 user-store 即备份自建专家

### 内置专家不可删、不可改

- `PATCH` / `DELETE` 对 `source: "builtin"` 返回 **403**
- 删除文案：`内置专家不可删除`；编辑：`内置专家不可编辑`

### 已有对话不受影响

- 删除自建专家时，**已创建的会话与历史消息保留**；仅目录条目移除
- 会话技能专长已快照，删除目录条目后仍可继续按原专长对话（可再编辑）

### 合规不可弱化

- Layer 0 优先级 **高于** Layer 1；persona 再「强势」也不能绕过
- UI 创建表单提示：「描述专家的思考方式与技能专长，**不会覆盖投研安全底线**」

---

## 5. 产品交互（专家市场）

入口：**专家** 页（`client-ui/src/pages/experts/ExpertMarketPage.tsx`）。

| 区域 | 行为 |
|------|------|
| **搜索** | 匹配名称、简介、标签（debounce 250ms） |
| **我的专家** | 横向滚动展示 `scope=personal` 列表；点击图标 → 以该专家开聊；「+」→ 创建 |
| **公开 / 个人** | 分段切换：`公开` = 内置专家；`个人` = 本地自建 |
| **列表卡片** | 展示简介与标签；「开始对话」→ 创建绑定该专家的会话 |
| **创建 / 编辑** | 对话框：名称、简介、技能专长、标签；创建时可「保存并开始对话」 |
| **更多菜单**（仅 `source: local`） | 编辑、删除（二次确认：已有对话不受影响） |

顶部 **创建** / **刷新** 按钮；Electron 与 Web 布局一致，仅标题栏 chrome 不同。

---

## 6. REST API 速查

完整字段与错误码见 [API.md §Experts](./API.md#experts专家目录)。

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/experts?scope=public\|personal\|all` | 列表（默认 `all`）；列表项**不含** `persona` |
| GET | `/api/experts/:id` | 完整定义（含 `persona`） |
| POST | `/api/experts` | 创建本地专家 → 201 |
| PATCH | `/api/experts/:id` | 更新本地专家 |
| DELETE | `/api/experts/:id` | 删除本地专家 → `{ ok: true, deleted }` |

创建会话：`POST /api/sessions` body `{ "expertId": "<id>" }`。

---

## 7. 远程专家 datasource

Opptrix 专家目录采用 **Provider 抽象**（`RemoteExpertProvider`）：`listExperts(query?) → ExpertCatalog`、`getExpert(id) → ExpertDefinition | null`。一期客户端仅接 **本地 JSON 文件**（`LocalJsonExpertProvider` → `catalog.mock.json`）与用户自建（user-store）；**二期**将接入 HTTP 远程目录，REST 路径 `/api/experts*` 对 UI 保持不变。

### JSON Schema 与示例

| 文件 | 用途 |
|------|------|
| [`expert-definition.schema.json`](../packages/agent/src/experts/schemas/expert-definition.schema.json) | 单条 `ExpertDefinition` 完整字段与校验 |
| [`expert-catalog-file.schema.json`](../packages/agent/src/experts/schemas/expert-catalog-file.schema.json) | 静态目录文件 `{ schemaVersion?, experts[] }` |
| [`remote-expert-http.schema.json`](../packages/agent/src/experts/schemas/remote-expert-http.schema.json) | 远程 HTTP 列表/详情契约 |
| [`remote-catalog.example.json`](../packages/agent/src/experts/examples/remote-catalog.example.json) | 可托管的静态目录示例 |

内置 mock 已可选引用 catalog schema：`catalog.mock.json` 顶部 `"$schema": "./schemas/expert-catalog-file.schema.json"`（运行时忽略，仅供编辑器校验）。

### 静态 JSON 部署

1. 按 `expert-catalog-file.schema.json` 编写 `{ "schemaVersion": 1, "experts": [ … ] }`。
2. 每条专家须满足 `expert-definition.schema.json`（见下表）。
3. 托管至 HTTPS 静态站点、对象存储或内网文件服务；**二期**客户端或 sidecar 可配置 URL 拉取。
4. 远程官方条目建议：`official: true`、`source: "builtin"`、`complianceVersion: "1"`。

本地开发可对照 [`remote-catalog.example.json`](../packages/agent/src/experts/examples/remote-catalog.example.json) 与现有 [`catalog.mock.json`](../packages/agent/src/experts/catalog.mock.json)。

### HTTP 契约（RemoteExpertProvider）

部署方提供 `baseUrl`（无尾部斜杠）。客户端请求：

| 操作 | 请求 | 成功响应 |
|------|------|----------|
| 列表 | `GET {baseUrl}/experts?q=&tag=&limit=&cursor=&scope=` | `ExpertCatalog`；**`source` 必须为 `"remote"`** |
| 详情 | `GET {baseUrl}/experts/{id}` | `{ "expert": ExpertDefinition }` |
| 未找到 | 同上，未知 id | **404** `{ "error": "expert not found" }` |

**列表查询参数**（与 `ExpertListQuery` 对齐）：

| 参数 | 说明 |
|------|------|
| `q` | 可选；匹配 `title` / `summary` / `tags`（子串，不区分大小写） |
| `tag` | 可选；精确匹配某一 tag |
| `limit` | 可选；默认 50，范围 1–100 |
| `cursor` | 可选；上一页 `nextCursor`（数值 offset 字符串） |
| `scope` | 可选；远程通常仅 `public`；`personal` 仍由客户端本地存储 |

**列表响应**（不含 `persona`）：

```json
{
  "experts": [ { "id": "…", "title": "…", "summary": "…", "icon": { … }, "tags": [ … ], "official": true, "source": "builtin", "version": "1.0.0" } ],
  "source": "remote",
  "fetchedAt": "2026-07-25T06:00:00.000Z",
  "nextCursor": "50"
}
```

**详情响应**（含完整 `persona` 与 `defaultPacks` 等）：见 [API.md §Experts](./API.md#experts专家目录) 示例。

### 字段表（ExpertDefinition）

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | string | 是 | `/^[a-z][a-z0-9_-]{0,63}$/` |
| `title` | string | 是 | 展示标题 |
| `summary` | string | 是 | 列表简介 |
| `icon` | `{ kind: "emoji"\|"icon", value: string }` | 是 | 元数据图标 |
| `tags` | string[] | 是 | 最多 8 个，去重 |
| `persona` | string | 是 | 技能专长；1–4000 字；须通过消毒规则 |
| `defaultPacks` | string[] | 是 | 合法 Tool Pack id，见 `packages/shared/src/tool-packs.ts` |
| `defaultResearchTier` | `"L1"\|"L2"\|"L3"` | 是 | 默认研究档位 |
| `defaultSessionTitle` | string | 否 | 新建会话默认标题 |
| `complianceVersion` | `"1"` | 是 | 当前固定为 `"1"` |
| `official` | boolean | 否 | 官方目录建议 `true` |
| `version` | string | 否 | 如 `1.0.0` |
| `source` | `"builtin"\|"local"` | 否 | 远程官方为 `builtin` |

### 校验与合规

- **id**：须通过 `isValidExpertId`；列表内 id 唯一。
- **persona**：非空、≤4000 字；不得命中 §3 注入模式；客户端加载时再次 `sanitizeExpertPersona`，失败回退默认研究员。
- **defaultPacks**：须为已注册的 Tool Pack id（`core` / `meta` 每轮自动加载，无需写入）。
- **HTTPS**：生产环境建议 TLS；响应 `Content-Type: application/json; charset=utf-8`。

### 客户端接入路线

| 阶段 | 数据源 | 说明 |
|------|--------|------|
| **一期（当前）** | `LocalJsonExpertProvider` + user-store | 内置 `catalog.mock.json`；`ExpertCatalogService` 合并本地自建；API `ExpertCatalog.source` 为 `"local"` |
| **二期（规划）** | HTTP `RemoteExpertProvider` | 配置远程 `baseUrl`；拉取列表 `source: "remote"`，与内置/本地合并；失败可降级至缓存或内置目录 |

实现入口（供开发者对照，部署方无需改代码）：`packages/agent/src/experts/local-json-provider.ts`（`RemoteExpertProvider` 接口）、`packages/agent/src/experts/catalog-service.ts`。

---

## 8. 开发者参考

| 模块 | 路径 |
|------|------|
| 类型定义 | `packages/shared/src/expert.ts` |
| JSON Schema | `packages/agent/src/experts/schemas/` |
| 静态示例 | `packages/agent/src/experts/examples/remote-catalog.example.json` |
| 本地持久化 | `packages/user-store/src/local-experts.ts` |
| 目录合并 | `packages/agent/src/experts/catalog-service.ts` |
| persona 消毒与 prompt 组装 | `packages/agent/src/experts/prompt-assembler.ts` |
| 内置目录 | `packages/agent/src/experts/catalog.mock.json` |
| REST 路由 | `apps/server/src/index.ts` |
| UI | `client-ui/src/pages/experts/` |
| 测试 | `tests/expert-catalog.test.mjs` |
