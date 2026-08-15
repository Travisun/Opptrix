---
name: lean-drawdown-risk
description: LEAN 启发的回撤风控工作流。用户说「回撤控制」「最大回撤」「drawdown risk」「回撤熔断」「/lean-drawdown-risk」时使用。方法溯源 QuantConnect LEAN 风险管理示例；关注路径回撤规则而非一次性情景冲击。默认 A股适配。默认 create_web。禁止假装跑完整 LEAN 引擎。
license: Apache-2.0
metadata:
  author: opptrix
  version: "1.0"
  title: LEAN回撤风控
  summary: A股持仓路径回撤与T+1执行约束解读
  category: portfolio
  slash-rank: "440"
  default-deliverable: web
  required-packs: portfolio market workspace artifacts
allowed-tools: get_portfolio_holdings portfolio_summary get_instrument_chart ask_user opptrix_run workspace_write workspace_read create_web update_web read_web list_web_vendor
---

# LEAN 回撤风控

方法溯源 **QuantConnect LEAN** 中基于最大回撤 / 路径风险的风控与仓位缩放思路；本技能做**回撤度量与规则状态解读**，**禁止假装跑完整 LEAN 引擎**。

## 何时使用

用户要在 **A股/场内 ETF** 持仓或标的上关注**历史或当前路径回撤**、回撤阈值、减仓/熔断类规则是否触发（LEAN 方法溯源，非美股原版照搬）。

边界：一次性显式情景冲击（指数跌 X%）用 `@skill:stress-test`；稳健性参数网格用 `@skill:robustness-check`；正式策略回测 KPI 用 `@skill:run-backtest`。默认交付网页。

## A股适配（默认）

- 默认市场 **CN（A股 / 场内 ETF）**。用户点名美股/港股再切换，并声明数据口径与微观结构差异。
- 组合默认 **CN 持仓/关注列表**；回撤规则在 T+1 与涨跌停下可能无法按美股假设即时减仓，须声明执行缺口。
- 不做空对冲假设。
- 不可硬适配或数据缺口时：首页横幅写清完整度（**partial** 或更严）+ 必要时 `ask_user`。

## 分析架构（投研方法）

- **问题/假设**：在约定净值/价格路径上，最大回撤与当前回撤深度如何？是否触及用户阈值？
- **证据清单**：净值或价格路径（事实）、阈值与规则（假设）、是否应缩放仓位的叙述（推断）
- **多维交叉验证**：峰值日期 vs 谷底；单票回撤 vs 组合回撤（若有持仓）
- **结论与不确定**：窗口选择敏感；未建模流动性
- **风险与缺口**：无路径数据、阈值未定义
- **微观/制度风险**：涨跌停钝化、T+1、ST/停牌、融券受限（及相关会计口径差异）；不得按美股连续可成交或自由做空假设叙事
- **事实 | 假设 | 推断** 分栏强制

## 数据维度

| 维度 | 取数方向 | 缺失时 |
|------|----------|--------|
| 标的/组合 | `ask_user` / `get_portfolio_holdings` | 先确认对象 |
| 价格/净值路径 | `get_instrument_chart` / 用户提供序列 | not-feasible |
| 回撤阈值 | `ask_user` | 显式默认并标假设 |
| 计算 | `opptrix_run` / `workspace_write` | 手工表并说明 |
| 交付 | `list_web_vendor` → `create_web` | 可跳过口头要点 |
| A股持仓微观结构 | CN 组合行情序列 | 无持仓清单 → ask_user |


## 步骤

1. **确认默认 CN**：标的/宇宙为 A股或场内 ETF（用户点名其他市场再切换并声明差异）。应用涨跌停/T+1/融券受限等微观约束（见 A股适配）。
2. **确认分析对象**（单标的净值路径或组合近似）与回撤阈值。
3. **声明非 LEAN Runtime**；与压力测试边界写清。
4. **计算峰值—谷底回撤与当前深度**。
5. **对照规则状态**（是否触发）；不做下单。
6. **分栏结论** → 默认 `create_web`。

## 网页报告建议目录

1. 范围：默认 A股/场内 ETF + LEAN 溯源
2. 回撤定义与阈值（假设）  
3. 最大回撤与当前深度（事实）  
4. 规则触发状态  
5. 事实 / 假设 / 推断  
6. 与情景压力测试的差异说明  
7. A股适配与限制（默认 CN；微观结构/代理/完整度）
8. 免责声明（风控规则解读≠买卖建议）

## 禁止

- 荐股；把「触及阈值」写成强制卖出指令  
- **禁止假装跑完整 LEAN 引擎**  
- 用情景冲击替代路径回撤却不声明（应转 `@skill:stress-test`）  
- **禁止无交付就结束**（默认 web）  
- 编造未计算的回撤数字
- 禁止把美股成分/ETF 清单不经映射直接当 A股结果
- 禁止假设可自由融券做空
