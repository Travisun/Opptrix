---
name: scheduled-jobs
description: 定时任务管理工作流（工具 list_scheduled_jobs / create_scheduled_job / enable_scheduled_job）。用户说「定时任务」「预约任务」「自动化任务」「建个定时」「list_scheduled_jobs」「/scheduled-jobs」时使用。列出、创建或启用定时任务，须用户确认后再写入。
license: Apache-2.0
metadata:
  author: opptrix
  version: "1.0"
  required-packs: automation
allowed-tools: list_scheduled_jobs create_scheduled_job enable_scheduled_job
---

# 定时任务管理

## 何时使用

用户要**查看、创建或启用**投研相关定时任务（如定期简报），而不是立刻跑一次临时分析。

## 步骤

1. **先列出现状**：`list_scheduled_jobs`，避免重复创建。
2. **确认意图**：新建 vs 启用已有；时间表达式、任务内容用 `ask_user` 确认。
3. **创建 / 启用**：确认后 `create_scheduled_job` 或 `enable_scheduled_job`。
4. **回读**：再次列表确认状态；向用户说明下次触发预期（若工具返回）。
5. **输出边界**：说明任务做什么；**不给出**买卖建议；勿在未确认时写入。

## 禁止

- 未获确认就创建/启用任务
- 荐股或把定时任务写成「自动下单」
