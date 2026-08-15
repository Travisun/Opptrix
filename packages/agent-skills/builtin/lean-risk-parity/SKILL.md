---
name: lean-risk-parity
description: LEAN 启发的风险平价组合工作流。用户说「风险平价」「risk parity」「风险预算」「等风险贡献」「/lean-risk-parity」时使用。方法溯源 QuantConnect LEAN / 风险平价思路；波动与权重须显式假设。默认 A股适配。默认 create_web。禁止假装跑完整 LEAN 引擎。
license: Apache-2.0
metadata:
  author: opptrix
  version: "1.0"
  title: LEAN风险平价
  summary: A股篮子风险贡献目标下的权重框架
  category: portfolio
  slash-rank: "435"
  default-deliverable: web
  required-packs: portfolio market workspace artifacts
allowed-tools: get_portfolio_holdings portfolio_summary search_instruments get_instrument_chart batch_instrument_snapshots ask_user opptrix_run workspace_write workspace_read create_web update_web read_web list_web_vendor
---

# LEAN 风险平价

方法溯源 **QuantConnect LEAN** 与经典风险平价 / 风险预算组合思路；本技能做**风险贡献目标权重框架**，**禁止假装跑完整 LEAN 引擎**。

## 何时使用

用户要在 **A股/场内 ETF** 篮子上按**波动或风险贡献**分配权重（LEAN 方法溯源，非美股原版照搬）。

边界：等权用 `@skill:lean-equal-weight-pcm`；均值方差用 `@skill:lean-mean-variance`；已有目标只算差额用 `@skill:rebalance`。默认交付网页。

## A股适配（默认）

- 默认市场 **CN（A股 / 场内 ETF）**。用户点名美股/港股再切换，并声明数据口径与微观结构差异。
- 默认 CN 资产（股/债/货币 ETF 等）风险平价；杠杆/做空受限时改为「波动倒数加权多头」并声明非经典杠杆 RP。
- 不可硬适配或数据缺口时：首页横幅写清完整度（**partial** 或更严）+ 必要时 `ask_user`。

## 分析架构（投研方法）

- **问题/假设**：在约定波动/协方差估计下，各资产风险贡献是否接近目标预算？
- **证据清单**：收益波动估计（事实/样本）、风险预算（假设）、配置含义（推断）
- **多维交叉验证**：权重和；边际风险贡献加总是否合理；简化对角协方差须披露
- **结论与不确定**：相关突变时失效；杠杆未建模须说明
- **风险与缺口**：样本短、资产过少/过多、无法估波动
- **微观/制度风险**：涨跌停钝化、T+1、ST/停牌、融券受限（及相关会计口径差异）；不得按美股连续可成交或自由做空假设叙事
- **事实 | 假设 | 推断** 分栏强制

## 数据维度

| 维度 | 取数方向 | 缺失时 |
|------|----------|--------|
| 成分 | `ask_user` / `search_instruments` | 先确认 |
| 价格序列 | `get_instrument_chart` | not-feasible |
| 风险预算 | `ask_user` | 默认等风险贡献并标假设 |
| 现持仓 | `get_portfolio_holdings` | 可选对照 |
| 计算 | `opptrix_run` / `workspace_write` | 对角简化并披露 |
| 交付 | `list_web_vendor` → `create_web` | 可跳过口头要点 |
| A股资产代理 | CN 股债货 ETF 波动 | 缺资产类 → ask_user；禁止装美股期货 RP |


## 步骤

1. **确认默认 CN**：标的/宇宙为 A股或场内 ETF（用户点名其他市场再切换并声明差异）。应用涨跌停/T+1/融券受限等微观约束（见 A股适配）。
2. **确认成分与风险预算**（等贡献 vs 自定义）。
3. **声明非 LEAN Runtime**。
4. **估计波动/协方差**；写明窗口与简化。
5. **求解风险平价权重**并校验贡献。
6. **分栏结论** → 默认 `create_web`。

## 网页报告建议目录

1. 范围：默认 A股/场内 ETF + LEAN 溯源
2. 波动与协方差假设表  
3. 目标权重与风险贡献  
4. 与等权对照（可选）  
5. 事实 / 假设 / 推断  
6. 相关突变与杠杆局限  
7. A股适配与限制（默认 CN；微观结构/代理/完整度）
8. 免责声明（方案≠下单；无荐股）

## 禁止

- 荐股；把风险平价权重写成买卖指令  
- **禁止假装跑完整 LEAN 引擎**  
- 隐瞒对角/简化协方差假设  
- **禁止无交付就结束**（默认 web）  
- 与 `@skill:rebalance` 混淆：本技能**生成风险平价目标**；rebalance 执行用户目标差额
- 禁止把美股成分/ETF 清单不经映射直接当 A股结果
- 禁止假设可自由融券做空
