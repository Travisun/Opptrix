---
name: run-backtest
description: 策略回测工作流（run_backtest）。用户说「回测」「跑一下回测」「历史回测」「验证策略」「run_backtest」「/run-backtest」时使用。调用 run_backtest 解读收益与风险；默认用 create_web 交付可预览 HTML 回测报告；不做买卖建议。
license: Apache-2.0
metadata:
  author: opptrix
  version: "2.0"
  title: 策略回测
  summary: 历史回测结果与风险指标解读
  category: strategy
  slash-rank: "100"
  default-deliverable: web
  required-packs: strategy_extra artifacts
allowed-tools: run_backtest create_web update_web read_web list_web_vendor create_canvas create_mindmap
---

# 策略回测

## 何时使用

用户要对某套规则/策略做**历史回测验证**（不是只要现价或定性评论）。默认交付**可预览网页报告**。

## 分析架构（投研方法）

- **问题/假设**：在给定参数下，策略历史表现与风险特征如何？是否稳健？
- **证据清单**：`run_backtest` 返回的收益、回撤、胜率、交易统计等
- **多维交叉验证**：收益 vs 最大回撤；胜率 vs 盈亏比；样本外/参数敏感（若工具未提供则标明无法验证）
- **结论与不确定**：历史结果≠未来；过拟合与幸存者偏差须写明
- **风险与缺口**：参数无效、数据不足、区间过短
- **事实与推断必须分开**：禁止「口头回测」冒充工具结果

## 数据维度

| 维度 | 取数方向 | 缺失时 |
|------|----------|--------|
| 参数 | 标的/池、区间、频率、规则（`ask_user` 确认关键项） | 不清则先确认 |
| 回测执行 | `run_backtest` | 写明失败原因，禁止编造曲线 |
| 风险收益 | 工具返回指标 | 只列已返回字段 |
| 交付 | `list_web_vendor` → `create_web` | 用户只要口头要点时可跳过 |

## 步骤

1. **确认参数**：标的/池、区间、频率、入出场规则。
2. **执行** `run_backtest`。
3. **交叉验证与结构化结论**：KPI 表 + 局限与不确定。
4. **交付网页（默认）**：`list_web_vendor` → `create_web`（权益曲线等用本地 vendor）；已有则 `read_web` / `update_web`。
5. **备选**：用户点名画布 / 结构图时改用对应工具。

## 网页报告建议目录

1. 策略与参数摘要  
2. 回测区间与样本说明  
3. 收益与风险 KPI  
4. 关键交易/阶段表现（若有）  
5. 局限：过拟合、数据缺口、不可外推  
6. 免责声明（非投资建议）

## 禁止

- 荐股或暗示必然盈利  
- 编造未返回的回测指标  
- 用文字「口头回测」冒充 `run_backtest`  
- **禁止无交付就结束**（默认须有 web 产物，除非用户明确只要口头要点）
