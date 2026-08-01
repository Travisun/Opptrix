# Agent Skills（工作流技能）

Opptrix 实现 [Agent Skills 开放标准](https://agentskills.io/specification) 的 Phase 1：内置技能、用户导入、会话激活与渐进披露。

UI 对用户称「**工作流技能**」，避免与专家「技能专长」（persona）混淆。

## 与其它概念的区别

| 概念 | 是什么 | 不是 |
|------|--------|------|
| **工作流技能（Agent Skills）** | `SKILL.md` 流程知识：discovery → activate → 按需读附件 | 不是 Tool Pack，不是专家人设 |
| **技能专长（persona）** | 专家角色语气与分析偏好 | 不提供逐步工作流正文 |
| **Tool Pack** | 按意图加载的 MCP 工具子集 | 不替代流程说明 |
| **`@opptrix/skills`** | 晨报/产业链等**硬编码任务实现** | 不是 Agent Skills 标准格式 |

## 目录布局

```
packages/agent-skills/builtin/<name>/SKILL.md   # 内置
~/.opptrix/agent-skills/<name>/SKILL.md         # 用户（或 OPPTRIX_DATA_DIR/agent-skills）
```

`name` 必须与目录名一致，且符合规范：小写 `a-z0-9` 与连字符、1–64、不首尾连字符、无连续 `--`。

## 渐进披露

1. **Discovery**：system 注入短目录（仅 name + description）
2. **Activation**：`activate_agent_skill` → 会话 sticky（最多 3 个）→ 注入完整正文（约 20k 字截断保护）
3. **Resources**：`get_agent_skill_file` 按需读 `references/` / `scripts/` / `assets/`（路径 confine 在技能根内）

系统底线（Layer0）永远高于技能正文；技能不合并进 `rolePersona`。

## Agent 工具（meta pack）

| 工具 | 说明 |
|------|------|
| `list_agent_skills` | 索引 |
| `activate_agent_skill` | 会话激活 |
| `get_agent_skill` | 读完整说明 |
| `get_agent_skill_file` | 读附件 |
| `create_agent_skill` | 创建（须 `ask_user` + `confirmed=true`） |
| `import_agent_skill` | 导入 Markdown（须确认） |
| `delete_agent_skill` | 删用户技能（须确认；不可删内置） |

## REST / 设置

- `GET/POST /api/agent-skills`、`POST /api/agent-skills/import`、`GET/DELETE /api/agent-skills/:name`
- 设置页 → **工作流技能**：列表、粘贴导入、删除用户技能

## 包

`@opptrix/agent-skills` — 解析、校验、Registry、prompt 组装。

详见 `docs/API.md`、`docs/AGENT-GUIDE.md`。
