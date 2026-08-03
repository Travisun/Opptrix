# Agent Skills（工作流技能）

Opptrix 实现 [Agent Skills 开放标准](https://agentskills.io/specification) 的 Phase 1：内置技能、用户导入/编辑、会话激活与渐进披露。

UI 对用户称「**工作流技能**」，避免与专家「技能专长」（persona）混淆。

> **说明**：原独立包 `@opptrix/skills`（硬编码早报/收盘/产业链任务）已并入本包的**内置工作流技能**，不再作为现行依赖。

## 与其它概念的区别

| 概念 | 是什么 | 不是 |
|------|--------|------|
| **工作流技能（Agent Skills）** | 步骤说明与附件：discovery → activate → 按需读附件 | 不是 Tool Pack，不是专家人设 |
| **技能专长（persona）** | 专家角色语气与分析偏好 | 不提供逐步工作流正文 |
| **Tool Pack** | 按意图加载的 MCP 工具子集 | 不替代流程说明；技能正文可指引 Agent 去 activate 对应 pack |

三者正交：对话可同时有角色 persona、已激活 Tool Pack、以及最多 3 个已激活工作流技能。

## 目录布局

```
packages/agent-skills/builtin/<name>/SKILL.md   # 内置
~/.opptrix/agent-skills/<name>/SKILL.md         # 用户（或 OPPTRIX_DATA_DIR/agent-skills）
```

可选子目录（路径须相对技能根、禁止 `..`）：

- `references/` — 知识库 / 参考资料
- `scripts/` — 辅助脚本
- `assets/` — 其它附件

`name` 必须与目录名一致，且符合规范：小写 `a-z0-9` 与连字符、1–64、不首尾连字符、无连续 `--`。

## Frontmatter：`references`

YAML frontmatter 可选字段 `references`：字符串数组，列出技能内附加文件的**相对路径**（如 `references/chain-knowledge.json`）。

| 约束 | 说明 |
|------|------|
| 条数 | ≤ 16 |
| 路径 | 相对路径；禁止绝对路径、`..`、NUL |
| 用途 | 索引与设置页预览；运行时仍通过 `get_agent_skill_file` / `GET .../file?path=` 按需读取 |

## 渐进披露

1. **Discovery**：system 注入短目录（仅 name + description）
2. **Activation**：`activate_agent_skill` → 会话 sticky（最多 **3** 个）→ 注入完整正文（约 20k 字截断保护）
3. **Resources**：`get_agent_skill_file` 按需读 `references/` / `scripts/` / `assets/`（路径 confine 在技能根内）

系统底线（Layer0）永远高于技能正文；技能不合并进 `rolePersona`。

## `@skill:name` 互调与依赖激活

技能正文可用反引号包裹的 `` `@skill:other-name` `` 引用其它已安装技能。

| 行为 | 说明 |
|------|------|
| **解析** | `resolveSkillDependencies(name)` 从正文提取引用；仅保留**已存在**且非自身的技能名 |
| **自动激活** | `activate_agent_skill` 激活主技能时，递归激活依赖（`AgentSkillSessionStore` + `resolveDeps`） |
| **上限** | 同会话已激活总数 ≤ **3**（含依赖）；超限则跳过依赖并记入 `depNotes` |
| **循环检测** | 访问栈检测环；遇到环跳过并记入 `depNotes`，不死循环 |

返回字段含 `activated` / `skipped` / `active` / `depNotes`，便于 Agent 向用户说明未装上的依赖。

## 内置技能目录

| name | 用途 | 备注 |
|------|------|------|
| `equity-deep-dive` | 个股深度分析工作流 | 快照 → 基本面 → 资金/资讯 → 结构化结论 |
| `morning-market-brief` | 早报 / 开市简报 | **v2** 结构化 JSON（`report_type: morning`） |
| `closing-market-brief` | 收盘报告 | 结构化 JSON（`report_type: closing`） |
| `industry-chain` | 产业链透视 | 读内置知识库 + 可选板块成分；输出 JSON + Mermaid |
| `earnings-quick-read` | 财报速读 | 报告期确认 → 财务表 → 亮点/风险（无买卖建议） |
| `create-skill` | 新建 / 定制工作流技能 | 引导命名、frontmatter、正文与附件；经确认后 `create_agent_skill` 写入 |

### `industry-chain` 与知识库

- Frontmatter：`references: [references/chain-knowledge.json]`
- 步骤要求先 `get_agent_skill_file(skill_name="industry-chain", path="references/chain-knowledge.json")` 再匹配行业节点
- 代表公司可用 `get_sector_list` / `get_sector_constituents` / `search_instruments` 补全，禁止编造

### 意图路由（相对旧硬编码工具）

| 用户说法（示例） | 走工作流技能 | **勿**再推荐的旧路径 |
|------------------|--------------|----------------------|
| 早报、开市简报、盘前速览 | `morning-market-brief` | 已删除的 `get_morning_brief` / Hub `market_report` |
| 收盘报告、尾盘复盘 | `closing-market-brief` | 已删除的 `get_closing_report` / Hub `market_report` |
| 产业链、上下游、行业透视 | `industry-chain` | 已删除的 `industry_mining` / `industry_mermaid` |
| 帮我建工作流技能、新建/定制技能 | `create-skill` → `create_agent_skill` | 勿跳过引导直接 import；勿与 Tool Pack 混淆 |

### `create-skill` 与附件创建

- 内置引导技能：先 `activate_agent_skill(create-skill)`，再按步骤收集需求
- `create_agent_skill` / `POST /api/agent-skills` 支持 `references` 与 `files: [{ path, content }]`
- 附件路径须在 `references/`、`scripts/`、`assets/` 下；写入时自动合并进 frontmatter `references`

市场全景数据仍用 Tool Pack `market` 下的 `get_market_dynamics` 等；技能只规定**步骤与输出形状**。

## Agent 工具（meta pack）

| 工具 | 说明 |
|------|------|
| `list_agent_skills` | 索引（name + description + source） |
| `activate_agent_skill` | 会话激活；自动解析 `` `@skill:` `` 依赖；上限 3；返回 `depNotes` |
| `get_agent_skill` | 读完整步骤说明 |
| `get_agent_skill_file` | 读附件（须 confine） |
| `create_agent_skill` | 创建（须 `ask_user` + `confirmed=true`；可选 `references`、`files`） |
| `import_agent_skill` | 导入 Markdown（须确认） |
| `delete_agent_skill` | 删用户技能（须确认；不可删内置） |

## REST / 设置页

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/agent-skills` | 列表 |
| GET | `/api/agent-skills/:name` | 详情（含正文） |
| POST | `/api/agent-skills` | 创建（可含 `references`、`files: [{ path, content }]`） |
| POST | `/api/agent-skills/import` | 粘贴导入 |
| POST | `/api/agent-skills/:name/fork` | **复制内置**为用户可编辑副本（同名已存在则 409） |
| PUT | `/api/agent-skills/:name` | **更新**用户技能（内置只读 → 403，须先 fork） |
| GET | `/api/agent-skills/:name/file?path=` | 预览附件内容 |
| DELETE | `/api/agent-skills/:name` | 删除用户技能 |

设置页 → **工作流技能**：列表、粘贴导入、**fork 内置后编辑**、删除用户技能。内置只读；要改步骤须先 fork。

## 包

`@opptrix/agent-skills` — 解析、校验、Registry、依赖解析、prompt 组装、fork/update。

详见 [API.md](./API.md)、[AGENT-GUIDE.md](./AGENT-GUIDE.md)。
