---
name: lean-returns-momentum
description: LEAN 启发的收益动量工作流。用户说「收益动量」「return momentum」「动量排名」「N 日收益」「/lean-returns-momentum」时使用。方法溯源 QuantConnect LEAN 动量类示例；用收益序列做排序/状态解读。默认 A股适配。默认 create_web。禁止假装跑完整 LEAN 引擎。
license: Apache-2.0
metadata:
  author: opptrix
  version: "1.0"
  title: LEAN收益动量
  summary: A股宇宙历史收益窗口动量状态解读
  category: quant
  slash-rank: "415"
  default-deliverable: web
  required-packs: market instrument_analytics artifacts
allowed-tools: search_instruments get_instrument_snapshot get_instrument_chart batch_instrument_snapshots get_index_constituents get_sector_constituents get_sector_list ask_user opptrix_run workspace_write workspace_read create_web update_web read_web list_web_vendor
---

# LEAN 收益动量

方法溯源 **QuantConnect LEAN** 中基于历史收益 / 动量排序的算法思路；本技能用平台行情做**窗口收益与相对强弱解读**，**禁止假装跑完整 LEAN 引擎**。

## 何时使用

用户要在 **A股/场内 ETF** 上看**过去 N 日/周收益**所定义的动量状态，或对小集合做收益排名（LEAN 方法溯源，非美股原版照搬）。

边界：因子历史检验用 `@skill:factor-research`；正式回测用 `@skill:run-backtest`；ETF 全球轮动用 `@skill:lean-etf-global-rotation`。默认交付网页。

## A股适配（默认）

- 默认市场 **CN（A股 / 场内 ETF）**。用户点名美股/港股再切换，并声明数据口径与微观结构差异。
- 默认 CN 宇宙动量排序；涨跌停截断收益；T+1 与不可卖空 → 动量多空改为「多头动量排序」。
- 不可硬适配或数据缺口时：首页横幅写清完整度（**partial** 或更严）+ 必要时 `ask_user`。

## 分析架构（投研方法）

- **问题/假设**：在约定回看窗口下，标的/集合的相对动量如何？是否与波动或回撤不匹配？
- **证据清单**：价格序列推得收益（事实）、窗口与宇宙（假设）、「动量延续」叙述（推断）
- **多维交叉验证**：多窗口一致性；收益 vs 最大回撤（若可估）
- **结论与不确定**：动量拥挤、反转风险、幸存者偏差
- **风险与缺口**：样本短、集合过大无法批取、复权口径不明
- **微观/制度风险**：涨跌停钝化、T+1、ST/停牌、融券受限（及相关会计口径差异）；不得按美股连续可成交或自由做空假设叙事
- **事实 | 假设 | 推断** 分栏强制

## 数据维度

| 维度 | 取数方向 | 缺失时 |
|------|----------|--------|
| 标的/集合 | `search_instruments` / `ask_user` | 先确认宇宙 |
| 快照/批量 | `get_instrument_snapshot` / `batch_instrument_snapshots` | 缩小集合 |
| 价格序列 | `get_instrument_chart` | 标明无法算收益 |
| 窗口参数 | `ask_user` | 显式默认并标假设 |
| 计算 | `opptrix_run` + 可选 `workspace_write` | 手工表并说明 |
| 交付 | `list_web_vendor` → `create_web` | 可跳过口头要点 |
| 市场/微观结构 | CN 收益序列 | 样本/停牌缺口须披露 |


## 步骤

1. **确认默认 CN**：标的/宇宙为 A股或场内 ETF（用户点名其他市场再切换并声明差异）。应用涨跌停/T+1/融券受限等微观约束（见 A股适配）。
2. **确认宇宙与回看窗口**（及是否多窗口）。
3. **声明非 LEAN Runtime**。
4. **取价算收益**；大集合优先批量快照并说明局限。
5. **排序/状态表** + 交叉验证。
6. **分栏结论** → 默认 `create_web`。

## 网页报告建议目录

1. 范围：默认 A股/场内 ETF + LEAN 溯源
2. 收益计算方法与口径  
3. 动量状态或排名表（事实）  
4. 多窗口一致性检查  
5. 事实 / 假设 / 推断  
6. 局限与过拟合警示  
7. A股适配与限制（默认 CN；微观结构/代理/完整度）
8. 免责声明（排名≠荐股）

## 禁止

- 荐股；把高动量写成「必买」  
- **禁止假装跑完整 LEAN 引擎**或口头编造全历史动量曲线  
- **禁止无交付就结束**（默认 web）  
- 把未取得的收益数字当事实
- 禁止把美股成分/ETF 清单不经映射直接当 A股结果
- 禁止假设可自由融券做空
