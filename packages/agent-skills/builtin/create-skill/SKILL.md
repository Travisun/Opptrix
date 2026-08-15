---
name: create-skill
description: 创建工作流技能引导。用户说「帮我建工作流技能」「新建技能」「定制技能」「写一个技能」「create-skill」时使用。按 agentskills.io 规范收集需求、命名、frontmatter、正文与附件，经 ask_user 确认后 create_agent_skill 写入。
license: Apache-2.0
metadata:
  author: opptrix
  version: "1.0"
references:
  - references/skill-template.md
  - references/attachment-guide.md
---

# 创建工作流技能

## 何时使用

用户要**从零新建**或**定制**一个可复用的投研工作流技能（不是激活已有早报/收盘等内置技能，也不是导入现成 Markdown）。

## 步骤

1. **弄清目标**：用 `ask_user` 确认技能要解决什么场景、触发词、输出形态（JSON / 报告 / 清单等）。
2. **命名**：`name` 须小写 `a-z0-9` 与连字符、1–64 字、不首尾连字符、无连续 `--`（如 `earnings-quick-read`）。
3. **description**：1–1024 字，写清**何时使用**与能力边界；含用户可能说的触发词。
4. **frontmatter**：至少 `name` + `description`；可选 `license`、`metadata`、`references`（附件路径列表）。
   - 若步骤会调用非常驻工具（如画布/网页 `create_canvas`/`create_web`），务必写 `allowed-tools: create_canvas create_web`（空格分隔工具名）；激活技能时会**自动挂上**对应工具包，无需用户再手动激活。
   - 也可在 `metadata` 写 `required-packs: artifacts`（空格/逗号分隔包 id）直接声明工具包。
5. **正文**：Markdown 步骤说明——何时用、逐步做什么、输出 Schema/注意；可引用工具名（如 `get_instrument_snapshot`）。
6. **附件（可选）**：知识库、模板、脚本说明放 `references/`、`scripts/`、`assets/`；见 `get_agent_skill_file(skill_name="create-skill", path="references/attachment-guide.md")`。
7. **预览确认**：向用户展示 name、description、正文摘要、references/files 数量；`ask_user` 确认后再创建。
8. **写入**：`create_agent_skill(name=…, description=…, body=…, references=[…], files=[{path, content}], confirmed=true)`。
9. **可选激活**：创建成功后询问是否 `activate_agent_skill` 立即试用。

## 附件何时需要

| 场景 | 建议 |
|------|------|
| 固定知识库 / JSON 数据 | `references/` + frontmatter `references` |
| 输出模板或 Schema 示例 | `references/skill-template.md` 类文件 |
| 可执行脚本 | `scripts/`（正文说明如何调用，勿在技能内硬编码密钥） |
| 图片 / 静态资源 | `assets/` |

创建时可通过 `files` 参数一次性写入附件正文；路径会自动合并进 `references` frontmatter。

## 模板与规范

- 最小合规模板：`get_agent_skill_file(skill_name="create-skill", path="references/skill-template.md")`
- 附件目录说明：`get_agent_skill_file(skill_name="create-skill", path="references/attachment-guide.md")`

## 注意

- 未获用户确认前**勿**传 `confirmed=true`。
- 技能正文不得含 prompt 注入（如「忽略以上规则」「推荐买入」等）。
- 单附件 ≤ 200KB，合计 ≤ 16 个；路径禁止 `..` 与技能根外写入。
- 与 **import_agent_skill** 区分：本流程是结构化创建；用户已有完整 Markdown 才走导入。
