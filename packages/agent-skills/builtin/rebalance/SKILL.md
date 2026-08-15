---
name: rebalance
description: 再平衡方案（非下单）。用户说「再平衡」「调仓方案」「目标权重」「rebalance」「/rebalance」时使用。目标权重须用户给出；方案非下单指令。默认 create_web。
license: Apache-2.0
metadata:
  author: opptrix
  version: "1.0"
  title: 再平衡方案
  summary: 相对目标权重的调仓差额清单
  category: portfolio
  slash-rank: "240"
  default-deliverable: web
  required-packs: portfolio workspace artifacts
allowed-tools: get_portfolio_holdings portfolio_summary ask_user workspace_write workspace_read create_web update_web read_web list_web_vendor
---

# 再平衡方案

## 何时使用

用户已有 **目标权重**，需要计算与当前持仓的差额、得到再平衡清单。边界：压力测试用 `@skill:stress-test`；组合结构复盘用 `@skill:portfolio-review`。**目标权重必须由用户给出**；输出是 **方案说明，不是下单指令**。

## 分析架构（投研方法）

- **问题/假设**：相对目标权重，各标的超配/低配多少？需要多少名义买卖差额？
- **证据清单**：当前持仓与市值、用户目标权重、可选约束（现金、单票上限）
- **多维交叉验证**：权重和是否为 100%；差额加总与现金项
- **结论与不确定**：差额为计算事实；执行路径为假设（未含成本/税）
- **风险与缺口**：无目标权重、无市值、停牌等未建模
- **事实 | 假设 | 推断** 分栏强制

## 数据维度

| 维度 | 取数方向 | 缺失时 |
|------|----------|--------|
| 当前持仓 | `get_portfolio_holdings` / `portfolio_summary` | not-feasible |
| 目标权重 | `ask_user`（必填） | **禁止**擅自设定目标 |
| 约束 | `ask_user` / workspace | 按无约束简化并说明 |
| 落盘 | `workspace_write` | 可选 |
| 交付 | `list_web_vendor` → `create_web` | 用户只要口头要点时可跳过 |

## 步骤

1. **读取当前持仓权重**。
2. **`ask_user` 获取目标权重**（及总资产/现金假设若需要）。
3. **计算差额表**：标的、当前%、目标%、差额%、近似名义金额。
4. **约束检查**：无法满足则标 not-feasible 项。
5. **交付网页（默认）**：`list_web_vendor` → `create_web`；明确 **非下单指令**。

## 网页报告建议目录

1. 组合快照与时效  
2. 目标权重来源（用户假设）  
3. 再平衡差额表  
4. 现金与约束说明  
5. 事实 | 假设 | 推断分栏  
6. 未建模因素（成本、税、流动性）  
7. 免责声明（**非下单指令**；无投资建议）

## 禁止

- 擅自编造目标权重或仓位建议  
- 输出可直接理解为券商下单的指令口吻  
- **禁止无交付就结束**（默认须有 web 产物，除非用户明确只要口头要点）  
- assumption / not-feasible 须诚实降级  
- 禁止承诺成交价格
