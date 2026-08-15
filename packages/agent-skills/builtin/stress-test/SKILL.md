---
name: stress-test
description: 组合压力测试。用户说「压力测试」「情景冲击」「stress test」「最坏情况」「/stress-test」时使用。assumption-only；情景显式；可用 opptrix_run。默认 create_web。
license: Apache-2.0
metadata:
  author: opptrix
  version: "1.0"
  title: 压力测试
  summary: 显式情景下的组合冲击测算
  category: portfolio
  slash-rank: "235"
  default-deliverable: web
  required-packs: portfolio workspace artifacts
allowed-tools: get_portfolio_holdings portfolio_summary ask_user opptrix_run workspace_write workspace_read create_web update_web read_web list_web_vendor
---

# 压力测试

## 何时使用

用户要对持仓组合做 **显式情景冲击测算**（如指数跌 X%、单票腰斩、板块共振等），而非历史归因或再平衡方案。边界：归因用 `@skill:performance-attribution`；调仓方案用 `@skill:rebalance`。完整度 **assumption-only**：情景参数必须显式（用户给或 ask_user）；可用 `opptrix_run` 计算。

## 分析架构（投研方法）

- **问题/假设**：在约定冲击下，组合市值/盈亏如何变化？集中风险是否放大？
- **证据清单**：持仓权重与市值、用户情景参数、计算结果
- **多维交叉验证**：加总冲击 vs 分项；相关性简化假设是否披露
- **结论与不确定**：结果为情景输出；非预测
- **风险与缺口**：无持仓、情景未定义、忽略流动性
- **事实 | 假设 | 推断** 分栏强制

## 数据维度

| 维度 | 取数方向 | 缺失时 |
|------|----------|--------|
| 持仓 | `get_portfolio_holdings` / `portfolio_summary` | not-feasible |
| 情景参数 | `ask_user`（跌幅、相关性简化等） | **禁止**静默套用「标准危机」冒充事实 |
| 计算 | `opptrix_run` | 手工表并说明 |
| 固化 | `workspace_write` / `workspace_read` | 可选 |
| 交付 | `list_web_vendor` → `create_web` | 用户只要口头要点时可跳过 |

## 步骤

1. **确认组合范围**与持仓快照。
2. **显式情景表**：每个情景名称、冲击规则、相关性假设；`ask_user` 补全。
3. **测算**：`opptrix_run`；记录中间假设。
4. **解读**：最大回撤近似、贡献集中；推断分栏。
5. **交付网页（默认）**：`list_web_vendor` → `create_web`；标注 **assumption-only**。

## 网页报告建议目录

1. 组合快照与时效  
2. 显式情景参数表（假设）  
3. 冲击结果表/图  
4. 分项贡献与集中度  
5. 事实 | 假设 | 推断分栏  
6. 方法局限（线性、忽略流动性等）  
7. 风险与缺口  
8. 免责声明（非预测；无调仓指令）

## 禁止

- 荐股/强平建议；把情景结果写成「将会发生」  
- 隐瞒情景假设  
- **禁止无交付就结束**（默认须有 web 产物，除非用户明确只要口头要点）  
- assumption / not-feasible 须诚实降级  
- 禁止伪造历史危机复现精度
