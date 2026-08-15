---
name: scheduled-jobs
description: 定时任务管理工作流（list_scheduled_jobs / create_scheduled_job / enable_scheduled_job）。用户说「定时任务」「预约任务」「自动化任务」「建个定时」「list_scheduled_jobs」「/scheduled-jobs」时使用。列出、创建或启用定时任务，须用户确认后再写入；不强迫 create_web。
license: Apache-2.0
metadata:
  author: opptrix
  version: "1.1"
  title: 定时任务
  summary: 查看、创建或启用预约任务
  category: ops
  slash-rank: "910"
  default-deliverable: none
  required-packs: automation
allowed-tools: list_scheduled_jobs create_scheduled_job enable_scheduled_job get_scheduled_job update_scheduled_job disable_scheduled_job
---

# 定时任务管理

## 何时使用

用户要**查看、创建或启用**投研相关定时任务（如定期简报），而不是立刻跑一次临时分析。本技能**不默认**产出 `create_web`。

## 步骤

1. **先列出现状**：`list_scheduled_jobs`，避免重复创建。
2. **确认意图**：新建 / 启用 / 修改 / 停用；写入前须 `ask_user` 确认关键参数（名称、周期、动作）。
3. **执行**：`create_scheduled_job` / `enable_scheduled_job` / `update_scheduled_job` / `disable_scheduled_job` 等。
4. **回报**：列出变更后的任务状态；说明下次触发预期（若工具返回）。

## 禁止

- 未确认就写入或启用任务  
- 荐股或把定时任务伪装成买卖指令  
- 不要为「完成感」强行 `create_web`
