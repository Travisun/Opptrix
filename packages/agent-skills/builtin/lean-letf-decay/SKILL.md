---
name: lean-letf-decay
description: LEAN 启发的杠杆 ETF 衰减（LETF decay）教育工作流。用户说「杠杆 ETF 衰减」「LETF」「vol decay」「/lean-letf-decay」时使用。机制与路径依赖教育；禁止做空指令。默认 A股适配。默认 create_web。禁止假装 LEAN 引擎。
license: Apache-2.0
metadata:
  author: opptrix
  version: "1.0"
  title: LEAN杠杆衰减
  summary: 杠杆产品路径依赖机制（A股稀缺诚实）
  category: quant
  slash-rank: "490"
  default-deliverable: web
  required-packs: etf market artifacts
allowed-tools: get_etf_list get_etf_profile get_etf_nav get_etf_holdings search_instruments get_instrument_chart ask_user opptrix_run workspace_write workspace_read create_web update_web read_web list_web_vendor
---

# LEAN 杠杆ETF衰减

方法溯源 **QuantConnect LEAN** 社区算法/示例思路；本技能是**平台工具编排的投研工作流**，**禁止假装跑完整 LEAN 引擎**或输出 LEAN 回测曲线、订单日志冒充引擎结果。实际取数与计算仅限 Opptrix 工具（行情/财务/`opptrix_run` 沙盒等）。

## 何时使用

用户要理解**杠杆/反向产品**在 **A股稀缺语境**下的日重置、路径依赖与长期「衰减」机制（教育向；LEAN 方法溯源，非美股 LETF 原版照搬）。默认交付可预览网页。

边界：一般 ETF 研究用 `@skill:etf-research`。本技能是**机制教育**，**禁止**输出做空/做多杠杆 ETF 的交易指令或「衰减套利」下单步骤。

## A股适配（默认）

- 默认市场 **CN（A股 / 场内 ETF）**。用户点名美股/港股再切换，并声明数据口径与微观结构差异。
- 杠杆产品：**A股跨境/杠杆 ETF 稀缺**。优先检索本地可得杠杆/反向产品；若几乎无可交易样本 → 以「机制教育 + 缺口」交付，完整度 **partial / assumption-only**。
- 禁止假装存在 UVXY/美股 3x LETF 等价物；禁止输出做空指令。
- T+1 与涨跌停会改变「日重置路径」可观察性，报告须注明。
- 不可硬适配或数据缺口时：首页横幅写清完整度（**partial** 或更严）+ 必要时 `ask_user`。

## 分析架构（投研方法）

- **问题/假设**：日杠杆重置如何导致与标的多日复合收益偏离？
- **证据清单**：ETF 概况、净值路径、（可选）对照标的走势
- **多维交叉验证**：单日杠杆近似成立 vs 多日复合偏离；高波动区间偏离更大
- **结论与不确定**：教育示例≠预测未来衰减幅度
- **微观/制度风险**：涨跌停钝化、T+1、ST/停牌、融券受限（及相关会计口径差异）；不得按美股连续可成交或自由做空假设叙事
- **事实 | 假设 | 推断** 分栏强制

## 数据维度

| 维度 | 取数方向 | 缺失时 |
|------|----------|--------|
| 杠杆 ETF | `get_etf_list` / `ask_user` | 先确认代码与杠杆倍数 |
| 概况/净值 | `get_etf_profile` / `get_etf_nav` | 仅机制章 |
| 对照标的（可选） | 搜索 + chart | 省略对照图 |
| 路径示意 | `opptrix_run` | 用假想路径表并标「示意」 |
| 交付 | `list_web_vendor` → `create_web` | 可跳过口头要点 |
| A股杠杆代理 | `get_etf_list` 检索可得杠杆/反向产品 | 稀缺则机制教育+缺口；禁止装美股 LETF |


## 步骤

1. **确认默认 CN**：标的/宇宙为 A股或场内 ETF（用户点名其他市场再切换并声明差异）。应用涨跌停/T+1/融券受限等微观约束（见 A股适配）。
2. **确认标的与杠杆倍数**：正向/反向
3. **机制说明**：日重置、波动拖累、路径依赖；教育语气
4. **可选净值对照**：事实带时效；衰减幅度为推断
5. **明确非交易指令**：禁止做空/套利步骤
6. **交付网页（默认）**：`create_web`

## 网页报告建议目录

1. 范围：默认 A股/场内 ETF + LEAN 溯源
2. 日重置与路径依赖机制
3. 示意数值表（标假设）
4. 可选真实净值对照（事实+时效）
5. 事实 / 假设 / 推断分栏
6. 常见误区（含「长期必赚/必亏」）
7. A股适配与限制（默认 CN；微观结构/代理/完整度）
8. 免责声明（无做空/做多指令；非投资建议）

## 禁止

- 荐股、目标价、仓位建议；编造未返回数字
- 输出做空/做多杠杆 ETF 的交易指令或仓位
- 把教育示意写成「保证衰减套利利润」
- **禁止假装跑完整 LEAN 引擎**或伪造 LEAN 日志/回测净值
- **禁止无交付就结束**（默认须有 web 产物，除非用户明确只要口头要点）
- 禁止把美股成分/ETF 清单不经映射直接当 A股结果
- 禁止假设可自由融券做空
