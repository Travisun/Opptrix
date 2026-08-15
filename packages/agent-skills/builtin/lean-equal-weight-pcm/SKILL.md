---
name: lean-equal-weight-pcm
description: LEAN 启发的等权组合（PCM）工作流。用户说「等权组合」「equal weight」「1/N」「等权再配」「/lean-equal-weight-pcm」时使用。方法溯源 QuantConnect LEAN 等权/组合构建示例；产出目标权重表而非下单。默认 A股适配。默认 create_web。禁止假装跑完整 LEAN 引擎。
license: Apache-2.0
metadata:
  author: opptrix
  version: "1.0"
  title: LEAN等权组合
  summary: A股/场内ETF等权目标权重与偏离
  category: portfolio
  slash-rank: "425"
  default-deliverable: web
  required-packs: portfolio market artifacts
allowed-tools: get_portfolio_holdings portfolio_summary search_instruments batch_instrument_snapshots ask_user opptrix_run workspace_write workspace_read create_web update_web read_web list_web_vendor
---

# LEAN 等权组合（PCM）

方法溯源 **QuantConnect LEAN** 中等权 / Portfolio Construction Model 类思路；本技能产出**等权目标权重与偏离说明**，**禁止假装跑完整 LEAN 引擎**，也**不是下单指令**。

## 何时使用

用户要在 **A股/场内 ETF** 给定成分集合上构建或对照 **1/N 等权**目标（LEAN 方法溯源，非美股原版照搬）。

边界：用户已有任意目标权重、只需差额清单用 `@skill:rebalance`；均值方差优化用 `@skill:lean-mean-variance`；风险平价用 `@skill:lean-risk-parity`。默认交付网页。

## A股适配（默认）

- 默认市场 **CN（A股 / 场内 ETF）**。用户点名美股/港股再切换，并声明数据口径与微观结构差异。
- 默认 CN 股票/场内 ETF 篮子等权；再平衡受 T+1 与涨跌停可成交性约束。
- 禁止假设空头腿等权。
- 不可硬适配或数据缺口时：首页横幅写清完整度（**partial** 或更严）+ 必要时 `ask_user`。

## 分析架构（投研方法）

- **问题/假设**：在等权规则下，各成分目标权重是多少？相对现持仓偏离多少？
- **证据清单**：成分列表与市值/现持仓（事实）、等权规则（假设）、执行路径叙述（推断）
- **多维交叉验证**：权重和=100%；偏离加总与现金项
- **结论与不确定**：未含成本/税/停牌；等权≠最优
- **风险与缺口**：无成分、无市值、无法读持仓
- **微观/制度风险**：涨跌停钝化、T+1、ST/停牌、融券受限（及相关会计口径差异）；不得按美股连续可成交或自由做空假设叙事
- **事实 | 假设 | 推断** 分栏强制

## 数据维度

| 维度 | 取数方向 | 缺失时 |
|------|----------|--------|
| 成分宇宙 | `ask_user` / `search_instruments` | 先确认 |
| 现持仓（可选） | `get_portfolio_holdings` / `portfolio_summary` | 仅出目标权重表 |
| 市值/价格 | `batch_instrument_snapshots` | 标明名义金额不可算 |
| 计算 | `opptrix_run` / `workspace_write` | 手工等权表 |
| 交付 | `list_web_vendor` → `create_web` | 可跳过口头要点 |
| A股组合 | CN 标的清单 + 价格 | ask_user 确认篮子 |


## 步骤

1. **确认默认 CN**：标的/宇宙为 A股或场内 ETF（用户点名其他市场再切换并声明差异）。应用涨跌停/T+1/融券受限等微观约束（见 A股适配）。
2. **确认成分集合**与是否对照现持仓。
3. **声明非 LEAN Runtime / 非下单**。
4. **计算 1/N 目标权重**；有持仓则算偏离。
5. **校验权重和**与缺口。
6. **分栏结论** → 默认 `create_web`。

## 网页报告建议目录

1. 范围：默认 A股/场内 ETF + LEAN 溯源
2. 等权目标权重表（事实计算）  
3. 相对现持仓偏离（若有）  
4. 现金与约束说明（假设）  
5. 事实 / 假设 / 推断  
6. 成本/流动性局限  
7. A股适配与限制（默认 CN；微观结构/代理/完整度）
8. 免责声明（方案≠下单；无荐股）

## 禁止

- 荐股；把等权表写成买卖指令  
- **禁止假装跑完整 LEAN 引擎**  
- 擅自改成非等权却称为等权  
- **禁止无交付就结束**（默认 web）  
- 与 `@skill:rebalance` 混淆：本技能**定义等权目标**；rebalance 吃用户任意目标
- 禁止把美股成分/ETF 清单不经映射直接当 A股结果
- 禁止假设可自由融券做空
