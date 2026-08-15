---
name: create-canvas
description: 投研画布备选交付（工具 create_canvas）。用户说「画布」「可视化报告」「一页式报告」「投研画布」「对比表报告」「用画布呈现」「create_canvas」「/create-canvas」时使用。默认投研交付优先 create_web；仅当用户点名画布/一页式机构报告时用本技能。
license: Apache-2.0
metadata:
  author: opptrix
  version: "2.0"
  title: 投研画布
  summary: 一页式机构风画布报告（备选）
  category: deliverable
  slash-rank: "210"
  default-deliverable: web
  required-packs: artifacts
allowed-tools: create_canvas update_canvas read_canvas
---

# 投研画布（备选交付）

## 何时使用

用户**明确点名**要一份**可预览的画布 / 一页式机构风图文报告**（对比表、多章节 TSX 排版）。

**默认投研交付是网页**（`@skill:create-web` / `create_web`）。未点名画布时，投研技能应优先 `create_web`，不要主动改用本技能。

## 与网页 / 围栏的区别

| 形态 | 何时用 |
|------|--------|
| `create_web`（默认） | 投研 HTML 报告页、离线交互页 |
| `create_canvas`（本技能） | 用户点名画布 / 一页式机构报告 |
| 正文 chart 围栏 | 日常定量小插图，无需 artifacts |

「画个柱状图」→ 优先围栏；「出一份画布报告」→ 本技能。

## 步骤

1. **确认交付形态**：用户已点名画布/一页式机构报告；否则转 `create_web`。
2. **取数**：用已有行情/基本面/资讯等工具；缺失写明，禁止编造。
3. **创建画布**：`create_canvas` 写入 TSX `source`。仅允许 `import … from 'react'` 与 `import { … } from '@opptrix/canvas'`；用 `Surface` / `Stack` / `H1`–`H3` / `Text` / `Stat` / `Table` / `Chart` / `Callout` / `Quote` 等 curated 组件。
4. **版式**：机构调研报告风格——H1 → 导语 → H2 分章；定量优先 `Chart`；须有说明文字。
5. **更新**：已有画布先 `read_canvas`，再 `update_canvas`。
6. **输出边界**：事实与推断分开；**不给出**买卖建议。

## 禁止

- 外网 CDN、任意第三方 npm/脚本（含直接 `import echarts`）  
- 荐股、编造数据  
- 用 `workspace_write` 代替 `create_canvas`  
- 把未点名画布的投研流程默认做成画布（应优先 `create_web`）

## 与网页技能分工

- 默认投研 HTML 报告 → `@skill:create-web`  
- 用户点名画布 → 本技能  
- 只要结构图 → `@skill:create-mindmap`
