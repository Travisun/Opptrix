---
name: create-mindmap
description: 结构图 / 思维导图备选交付（工具 create_mindmap）。用户说「思维导图」「脑图」「mindmap」「结构图」「梳理脉络」「出一张导图」「create_mindmap」「/create-mindmap」时使用。默认投研交付优先 create_web；仅当用户只要结构图时用本技能。
license: Apache-2.0
metadata:
  author: opptrix
  version: "2.0"
  title: 结构脑图
  summary: 把论点与脉络梳成结构图
  category: deliverable
  slash-rank: "220"
  default-deliverable: web
  required-packs: artifacts
allowed-tools: create_mindmap update_mindmap read_mindmap
---

# 思维导图 / 结构图（备选）

## 何时使用

用户要把主题、产业链、投研论点或流程**梳理成可预览的思维导图/结构图**，而不是完整 HTML 报告或画布。

**默认投研交付是网页**（`create_web`）。只有用户明确只要结构图/脑图时用本技能。

## 步骤

1. **确认主题与层级**：中心节点与 2–4 层分支；信息不足时简短确认。
2. **取证（按需）**：需要事实支撑时用已有行情/资讯/基本面工具；缺口写明，禁止编造。
3. **创建导图**：`create_mindmap`；节点标题简短、一层一事。
4. **更新**：已有导图先 `read_mindmap`，再 `update_mindmap`。
5. **输出边界**：结构呈现事实与论点；**不给出**买卖建议。

## 与网页 / 画布分工

| 形态 | 何时用 |
|------|--------|
| `create_web` | 默认投研 HTML 报告 |
| `create_canvas` | 用户点名画布 / 一页式机构报告 |
| `create_mindmap`（本技能） | 只要结构图 / 脑图 |

## 禁止

- 荐股或编造未返回的数据  
- 用 `workspace_write` 代替 `create_mindmap`  
- 把完整报告需求误做成导图（应转 `@skill:create-web` 或 `@skill:create-canvas`）
