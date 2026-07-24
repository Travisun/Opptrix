# 自建本地专家指南

> **面向对象**：希望定制投研对话风格的产品使用者，以及需要理解专家机制的开发者。  
> **相关文档**：[API.md §Experts](./API.md#experts专家目录)、[AGENT-GUIDE.md §4.2](./AGENT-GUIDE.md#42-agent-与-mcp)

---

## 1. 专家是什么

**专家**是带固定角色设定的投研对话助手。选定专家后开启会话，Agent 会在每轮 system prompt 的 **Layer 1** 注入该专家的 **persona（角色设定）**，让回答更聚焦某一领域或风格。

### 核心概念

| 概念 | 说明 |
|------|------|
| **Session + expertId** | 创建会话时可选绑定 `expertId`；绑定后会话元数据持久化 `expertId` 与 `expertIcon`，侧栏显示专家标识 |
| **Layer 0 — 系统底线** | 不可被任何 persona 覆盖：禁止具体买卖建议、禁止编造数据、须先调工具取数等（见 `buildLayer0Baseline`） |
| **Layer 1 — 角色 persona** | 专家差异化所在：身份、分析侧重、输出风格；**优先级低于 Layer 0** |
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
| Layer 1 | `DEFAULT_RESEARCHER_PERSONA`（通用投研研究员） | 专家 `persona`（经消毒后注入） |
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
| **角色设定**（`persona`） | 是 | 注入 Layer 1 的正文；见下文写法指导 |
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

## 3. 角色设定（persona）写法指导

persona 描述「**你是谁、怎么思考、怎么表达**」，不是工具清单，也不是合规免责声明（Layer 0 已覆盖底线）。

### 建议写什么

1. **身份定位** — 领域与角色，例如「你是一位行业研究助手，熟悉 A 股中游制造产业链」
2. **分析侧重** — 优先关注的维度，例如「先看景气度与供需，再看龙头竞争格局与估值分位」
3. **输出风格** — 结构偏好，例如「先给 3 条核心结论，再展开证据；区分事实、推断与假设」
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
- 命中以下正则模式之一：
  - `忽略.*规则` / `无视.*规则`
  - `可以荐股`
  - `推荐买入|推荐卖出`
  - `ignore\s+(all\s+)?rules`
  - `you\s+may\s+recommend\s+(buy|sell)`
  - `override\s+system`

---

## 4. 注意事项

### persona 不写入会话消息

- 会话 SQLite 只存 `expertId` / `expertIcon`，**不**把 persona 快照进消息表
- 每轮 Agent 从 **当前目录**（`ExpertCatalogService.getDefinitionSync`）读取 persona 并注入 Layer 1
- **改 persona 后，已有会话下一聊即生效**；无需重建会话
- **删专家后**，已有会话 `expertId` 仍保留，但目录查不到定义时会回退默认研究员

### 本地永久保存

- 自建专家写入 `~/.opptrix/opptrix.db`（`documents` 命名空间 `local_experts`）
- 卸载应用不自动删除；备份 user-store 即备份自建专家

### 内置专家不可删、不可改

- `PATCH` / `DELETE` 对 `source: "builtin"` 返回 **403**
- 删除文案：`内置专家不可删除`；编辑：`内置专家不可编辑`

### 已有对话不受影响

- 删除自建专家时，**已创建的会话与历史消息保留**；仅目录条目移除
- 之后该会话若继续聊天，因找不到专家定义而使用默认研究员 persona

### 合规不可弱化

- Layer 0 优先级 **高于** Layer 1；persona 再「强势」也不能绕过
- UI 创建表单提示：「描述专家的思考方式与回答风格，**不会覆盖投研安全底线**」

---

## 5. 产品交互（专家市场）

入口：**专家** 页（`client-ui/src/pages/experts/ExpertMarketPage.tsx`）。

| 区域 | 行为 |
|------|------|
| **搜索** | 匹配名称、简介、标签（debounce 250ms） |
| **我的专家** | 横向滚动展示 `scope=personal` 列表；点击图标 → 以该专家开聊；「+」→ 创建 |
| **公开 / 个人** | 分段切换：`公开` = 内置专家；`个人` = 本地自建 |
| **列表卡片** | 展示简介与标签；「开始对话」→ 创建绑定该专家的会话 |
| **创建 / 编辑** | 对话框：名称、简介、角色设定、标签；创建时可「保存并开始对话」 |
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

## 7. 开发者参考

| 模块 | 路径 |
|------|------|
| 类型定义 | `packages/shared/src/expert.ts` |
| 本地持久化 | `packages/user-store/src/local-experts.ts` |
| 目录合并 | `packages/agent/src/experts/catalog-service.ts` |
| persona 消毒与 prompt 组装 | `packages/agent/src/experts/prompt-assembler.ts` |
| 内置目录 | `packages/agent/src/experts/catalog.mock.json` |
| REST 路由 | `apps/server/src/index.ts` |
| UI | `client-ui/src/pages/experts/` |
| 测试 | `tests/expert-catalog.test.mjs` |
