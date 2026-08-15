---
name: create-canvas
description: 投研画布 / 可视化报告工作流（工具 create_canvas）。用户说「画布」「可视化报告」「一页式报告」「投研画布」「对比表报告」「出一份图文报告」「用画布呈现」「create_canvas」「/create-canvas」时使用。用 create_canvas 交付多章节图文，与消息内 chart 围栏插图区分。
license: Apache-2.0
metadata:
  author: opptrix
  version: "1.1"
  required-packs: artifacts
allowed-tools: create_canvas update_canvas read_canvas
---

# 投研画布 / 可视化报告

## 何时使用

用户要一份**可预览的完整图文报告**（对比表、多章节结论、一页式投研画布），而不是聊天里随手插一张小图。

## 与消息内 chart 围栏的区别

| 形态 | 何时用 |
|------|--------|
| 正文 `` ```chart`` `` / `` ```opptrix-chart`` `` 围栏 | 日常定量插图：单图对比/趋势/占比；无需 `artifacts` |
| `create_canvas` | 完整可视化报告、多章节排版、对比表 + 结论页；激活本技能后直接调用 |

「画个图 / 画个柱状图」→ 优先围栏；「出一份画布报告 / 一页式报告」→ 本技能 + `create_canvas`。

## 步骤

1. **确认交付形态**：用户已点名画布/报告，或内容值得完整多章节图文时，直接出画布；**禁止**先 `ask_user` 问「要不要出报告」。简单一句问答不必开画布。
2. **取数**：用已有行情/基本面/资讯等工具收集事实；缺失处写明缺口，禁止编造数字。
3. **创建画布**：激活后直接调 `create_canvas` 写入 TSX `source`。仅允许 `import … from 'react'` 与 `import { … } from '@opptrix/canvas'`；用 `Surface` / `Stack` / `H1`–`H3` / `Text` / `Stat` / `Table` / `Chart` / `Callout` / `Quote` 等 curated 组件。
4. **版式**：机构调研报告风格——H1 → 导语 → H2 分章；定量优先 `Chart`；`Table`/`Stat` 作明细与 KPI；须有介绍说明文字；避免 Card 墙与无必要 Divider。
5. **更新**：已有画布时先 `read_canvas`，再 `update_canvas`。
6. **输出边界**：事实与推断分开；**不给出**买卖建议、目标价或仓位建议。

## 禁止

- 外网 CDN、任意第三方 npm/脚本依赖（含直接 `import echarts`）
- 荐股、编造未返回的数据
- 用 `workspace_write` 代替 `create_canvas`
- 把「画个图」误当成完整画布报告

## 与网页技能分工

- 报告型 TSX 画布 → 本技能（`` `@skill:create-canvas` ``）
- 可交互 HTML / 离线图表页 → `` `@skill:create-web` ``（`create_web`）
