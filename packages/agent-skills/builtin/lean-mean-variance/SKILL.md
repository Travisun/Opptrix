---
name: lean-mean-variance
description: LEAN 启发的均值方差组合工作流。用户说「均值方差」「马科维茨」「mean variance」「有效前沿」「/lean-mean-variance」时使用。方法溯源 QuantConnect LEAN 组合优化思路；assumption-only，收益/协方差须显式。默认 A股适配。默认 create_web。禁止假装跑完整 LEAN 引擎。
license: Apache-2.0
metadata:
  author: opptrix
  version: "1.0"
  title: LEAN均值方差
  summary: A股篮子显式假设下的均值方差框架
  category: portfolio
  slash-rank: "430"
  default-deliverable: web
  required-packs: portfolio market workspace artifacts
allowed-tools: get_portfolio_holdings portfolio_summary search_instruments get_instrument_chart batch_instrument_snapshots ask_user opptrix_run workspace_write workspace_read create_web update_web read_web list_web_vendor
---

# LEAN 均值方差

方法溯源 **QuantConnect LEAN** / 经典马科维茨框架在算法交易中的组合优化思路；本技能为 **assumption-only** 权重框架，**禁止假装跑完整 LEAN 引擎**。

## 何时使用

用户要在 **A股/场内 ETF** 篮子上、在**显式预期收益与风险假设**下得到均值方差型目标权重或有效前沿示意（LEAN 方法溯源，非美股原版照搬）。

边界：等权用 `@skill:lean-equal-weight-pcm`；风险平价用 `@skill:lean-risk-parity`；已有目标只算差额用 `@skill:rebalance`。默认交付网页。

## A股适配（默认）

- 默认市场 **CN（A股 / 场内 ETF）**。用户点名美股/港股再切换，并声明数据口径与微观结构差异。
- 默认 CN 持仓/候选池协方差估计；涨跌停截断收益分布。
- 有效前沿默认 **仅多头约束**（禁止自由做空权重）。
- 不可硬适配或数据缺口时：首页横幅写清完整度（**partial** 或更严）+ 必要时 `ask_user`。

## 分析架构（投研方法）

- **问题/假设**：在约定收益向量与协方差下，目标权重如何？对假设敏感吗？
- **证据清单**：历史收益样本（事实）、预期收益/约束（假设）、「最优」标签（推断，须降级措辞）
- **多维交叉验证**：权重和、边界约束；扰动收益假设看权重漂移
- **结论与不确定**：估计误差大；样本外易崩
- **风险与缺口**：用户拒给预期、样本过短、奇异协方差
- **微观/制度风险**：涨跌停钝化、T+1、ST/停牌、融券受限（及相关会计口径差异）；不得按美股连续可成交或自由做空假设叙事
- **事实 | 假设 | 推断** 分栏强制

## 数据维度

| 维度 | 取数方向 | 缺失时 |
|------|----------|--------|
| 成分 | `ask_user` / `search_instruments` | 先确认 |
| 价格序列 | `get_instrument_chart` / 批量 | 无法估协方差则 not-feasible |
| 预期收益 | `ask_user`（必填或明确用历史均值并标假设） | **禁止**假装「市场共识收益」 |
| 约束 | `ask_user` | 按无约束并说明 |
| 现持仓对照 | `get_portfolio_holdings` | 可选 |
| 计算 | `opptrix_run` + `workspace_write` | 手工示意并标局限 |
| 交付 | `list_web_vendor` → `create_web` | 可跳过口头要点 |
| A股组合约束 | CN 收益协方差；多头约束优化 | 样本不足则降维/缩小池 |


## 步骤

1. **确认默认 CN**：标的/宇宙为 A股或场内 ETF（用户点名其他市场再切换并声明差异）。应用涨跌停/T+1/融券受限等微观约束（见 A股适配）。
2. **确认成分、约束与收益假设来源**（历史均值 vs 用户观点）。
3. **声明非 LEAN Runtime / assumption-only**。
4. **估计或录入协方差与收益向量**；不可行则诚实降级。
5. **求解权重**并做至少一组敏感性。
6. **分栏结论** → 默认 `create_web`。

## 网页报告建议目录

1. 范围：默认 A股/场内 ETF + LEAN 溯源
2. 显式假设表（收益、协方差窗口、约束）  
3. 目标权重结果（模型输出）  
4. 敏感性与估计误差  
5. 事实 / 假设 / 推断  
6. 与等权/风险平价对照（可选）  
7. A股适配与限制（默认 CN；微观结构/代理/完整度）
8. 免责声明（非投资建议；非下单）

## 禁止

- 荐股；把优化权重写成「应买入」  
- **禁止假装跑完整 LEAN 引擎**  
- **禁止假装共识预期收益**  
- **禁止无交付就结束**（默认 web）  
- 无假设表就宣称「最优组合」
- 禁止把美股成分/ETF 清单不经映射直接当 A股结果
- 禁止假设可自由融券做空
