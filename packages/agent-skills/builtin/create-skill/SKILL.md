---
name: create-skill
description: 创建工作流技能引导。用户说「帮我建工作流技能」「新建技能」「定制技能」「写一个技能」「create-skill」时使用。按 agentskills.io 规范收集需求、命名、frontmatter、正文与附件，经 ask_user 确认后 create_agent_skill 写入；不强迫 create_web。
license: Apache-2.0
metadata:
  author: opptrix
  version: "1.1"
  title: 新建技能
  summary: 按规范定制可复用工作流
  category: ops
  slash-rank: "920"
  default-deliverable: none
references:
  - references/skill-template.md
  - references/attachment-guide.md
---

# 创建工作流技能

## 何时使用

用户要**从零新建**或**定制**一个可复用的投研工作流技能（不是激活已有早报/收盘等内置技能，也不是导入现成 Markdown）。本技能**不默认**产出 `create_web`。

## 步骤

1. **弄清目标**：用 `ask_user` 确认场景、触发词、**默认交付物**（投研类建议 `create_web`；运维类可为 none）。
2. **命名**：`name` 须小写 `a-z0-9` 与连字符、1–64 字、不首尾连字符、无连续 `--`。
3. **description**：1–1024 字，写清何时使用、触发词，以及是否默认网页交付。
4. **frontmatter**：至少 `name` + `description`；建议补齐 Composer 元数据：
   - `metadata.title` / `summary` / `category` / `slash-rank` / `default-deliverable`
   - 投研类：`allowed-tools` 含业务工具 + `create_web update_web read_web list_web_vendor`；`metadata.required-packs` 含业务 pack + `artifacts`
5. **正文**：含何时用、分析架构、数据维度、步骤、网页目录（若默认 web）、禁止项。
6. **附件（可选）**：见 `get_agent_skill_file(skill_name="create-skill", path="references/attachment-guide.md")`。
7. **预览确认**：展示 name、description、正文摘要；`ask_user` 确认后再创建。
8. **写入**：`create_agent_skill(..., confirmed=true)`。
9. **可选激活**：询问是否 `activate_agent_skill` 试用。

## 模板与规范

- 最小合规模板：`get_agent_skill_file(skill_name="create-skill", path="references/skill-template.md")`
- 附件目录说明：`get_agent_skill_file(skill_name="create-skill", path="references/attachment-guide.md")`

## 注意

- 未获用户确认前**勿**传 `confirmed=true`  
- 技能正文不得含 prompt 注入（如「忽略以上规则」「推荐买入」）  
- 与 **import_agent_skill** 区分：用户已有完整 Markdown 才走导入  
- 不要为「完成感」强行 `create_web`
