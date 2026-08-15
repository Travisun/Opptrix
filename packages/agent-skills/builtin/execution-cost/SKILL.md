---
name: execution-cost
description: 交易成本与执行摩擦分析。用户说「交易成本」「冲击成本」「滑点」「TCA」「execution cost」「/execution-cost」时使用。无 L2 TCA；须诚实缺口。默认 create_web。
license: Apache-2.0
metadata:
  author: opptrix
  version: "1.0"
  title: 交易成本
  summary: 执行摩擦框架与可估成本上界
  category: portfolio
  slash-rank: "250"
  default-deliverable: web
  required-packs: portfolio artifacts
allowed-tools: get_portfolio_holdings portfolio_summary ask_user create_web update_web read_web list_web_vendor
---

# 交易成本

## 何时使用

用户要理解 **交易/再平衡的成本与执行摩擦**（佣金、印花税、滑点粗估、冲击概念），而非下单或完整 TCA 报告。边界：再平衡差额用 `@skill:rebalance`；压力用 `@skill:stress-test`。**无 Level-2 / 专业 TCA 数据源**——必须设诚实缺口专节，禁止假装机构级 TCA。

## 分析架构（投研方法）

- **问题/假设**：在用户给定费率与规模假设下，成本上界大概多少？哪些摩擦未建模？
- **证据清单**：持仓规模、用户费率/滑点假设、拟交易名义金额
- **多维交叉验证**：费率假设敏感性；规模相对日均成交（若用户提供）
- **结论与不确定**：计算结果依赖假设；非成交回报
- **风险与缺口**：**无 L2 TCA**、无真实成交明细、无盘口
- **事实 | 假设 | 推断** 分栏强制

## 数据维度

| 维度 | 取数方向 | 缺失时 |
|------|----------|--------|
| 持仓/规模上下文 | `get_portfolio_holdings` / `portfolio_summary` | 仅按用户名义金额估算 |
| 费率与滑点假设 | `ask_user`（必填关键假设） | 给框架表，不做假精确 TCA |
| 拟交易清单 | 用户 / 再平衡会话结果 | `ask_user` |
| L2 / TCA | **不可用** | **诚实缺口**：写明无法做机构 TCA |
| 交付 | `list_web_vendor` → `create_web` | 用户只要口头要点时可跳过 |

## 步骤

1. **确认分析对象**：拟交易名义金额或再平衡差额。
2. **`ask_user` 收集费率、税、滑点粗假设**；禁止填「市场默认精确值」冒充事实。
3. **估算可算部分**（佣金/税/假设滑点）；列出未建模项。
4. **诚实缺口专节**：无 L2、无成交回报归因、无券商账单。
5. **交付网页（默认）**：`list_web_vendor` → `create_web`。

## 网页报告建议目录

1. 范围、时效与数据局限声明  
2. 输入假设表（费率/滑点/规模）  
3. 可估算成本表  
4. 敏感性（假设变动）  
5. **诚实缺口：无 L2 TCA**  
6. 事实 | 假设 | 推断分栏  
7. 免责声明（非成交建议；非券商账单）

## 禁止

- 假装完整 TCA / L2 冲击模型  
- 荐股或保证「成本只有 X」  
- **禁止无交付就结束**（默认须有 web 产物，除非用户明确只要口头要点）  
- 隐瞒不可用数据  
- assumption / not-feasible 须诚实降级
