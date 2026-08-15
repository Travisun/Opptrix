---
name: run-backtest
description: 策略回测工作流（工具 run_backtest）。用户说「回测」「跑一下回测」「历史回测」「验证策略」「run_backtest」「/run-backtest」时使用。激活后直接调用 run_backtest，解读收益与风险指标，不做买卖建议。
license: Apache-2.0
metadata:
  author: opptrix
  version: "1.0"
  required-packs: strategy_extra
allowed-tools: run_backtest
---

# 策略回测

## 何时使用

用户要对某套规则/策略做**历史回测验证**，而不是只要现价或定性评论。

## 步骤

1. **确认参数**：标的/池、区间、频率、入出场规则；不清时用选择题确认关键项。
2. **执行回测**：激活后直接调 `run_backtest`，传入已确认参数。
3. **解读结果**：汇总收益、回撤、胜率等返回指标；区分事实与推断。
4. **缺口说明**：数据不足或参数无效时写明原因，禁止编造曲线或数字。
5. **输出边界**：**不给出**买卖建议、目标价或「照此下单」指引。

## 禁止

- 荐股或暗示必然盈利
- 编造未返回的回测指标
- 用文字「口头回测」冒充 `run_backtest` 结果
