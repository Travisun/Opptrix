---
name: create-mindmap
description: 思维导图 / 结构图制品工作流（工具 create_mindmap）。用户说「思维导图」「脑图」「mindmap」「结构图」「梳理脉络」「出一张导图」「create_mindmap」「/create-mindmap」时使用。用 create_mindmap 交付可预览导图。
license: Apache-2.0
metadata:
  author: opptrix
  version: "1.0"
  required-packs: artifacts
allowed-tools: create_mindmap update_mindmap read_mindmap
---

# 思维导图 / 结构图

## 何时使用

用户要把主题、产业链、投研论点或流程**梳理成可预览的思维导图**，而不是长文列表或画布报告。

## 步骤

1. **确认主题与层级**：明确中心节点与 2–4 层分支；信息不足时简短确认，勿过度追问。
2. **取证（按需）**：需要事实支撑时用已有行情/资讯/基本面工具；缺口写明，禁止编造。
3. **创建导图**：激活后直接调 `create_mindmap`；节点标题简短、一层一事。
4. **更新**：已有导图先 `read_mindmap`，再 `update_mindmap`。
5. **输出边界**：结构呈现事实与论点；**不给出**买卖建议、目标价或仓位建议。

## 禁止

- 荐股或编造未返回的数据
- 用 `workspace_write` 代替 `create_mindmap`
- 把完整画布报告需求误做成导图（应转 `` `@skill:create-canvas` ``）
