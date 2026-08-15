---
name: lean-capm-alpha-rank
description: LEAN 启发的 CAPM Alpha 排序工作流。用户说「CAPM alpha」「Alpha 排序」「残差收益」「/lean-capm-alpha-rank」时使用。相对基准的回归残差/Alpha 示意；assumption-only。默认 A股适配。默认 create_web。禁止假装 LEAN 引擎。
license: Apache-2.0
metadata:
  author: opptrix
  version: "1.0"
  title: LEAN相对基准Alpha
  summary: 相对沪深300等基准的回归截距排序
  category: quant
  slash-rank: "505"
  default-deliverable: web
  required-packs: market fundamentals workspace artifacts
allowed-tools: search_instruments get_instrument_quotes get_instrument_snapshot batch_instrument_snapshots get_index_constituents get_sector_constituents get_sector_list ask_user opptrix_run workspace_write workspace_read create_web update_web read_web list_web_vendor
---

# LEAN CAPM Alpha

方法溯源 **QuantConnect LEAN** 社区算法/示例思路；本技能是**平台工具编排的投研工作流**，**禁止假装跑完整 LEAN 引擎**或输出 LEAN 回测曲线、订单日志冒充引擎结果。实际取数与计算仅限 Opptrix 工具（行情/财务/`opptrix_run` 沙盒等）。

## 何时使用

用户要在 **A股/场内 ETF** 样本期内对一篮子标的做 **相对基准（如沪深300）的 CAPM/单因子回归 Alpha（残差）排序示意**（LEAN 方法溯源，非美股原版照搬）。默认交付可预览网页。

边界：因子研究回测用 `@skill:factor-research`；组合暴露用 `@skill:factor-exposure`。本技能是**教育/示意排序**，非完整多因子归因。

## A股适配（默认）

- 默认市场 **CN（A股 / 场内 ETF）**。用户点名美股/港股再切换，并声明数据口径与微观结构差异。
- 默认基准与宇宙：沪深300/中证500 等 CN 指数成分；Beta/残差相对 CN 基准估计。
- 融券受限 → Alpha 多空改为「多头高 Alpha 排序」或「多头+空仓」。
- 涨跌停日收益截断会影响 Beta 估计，样本须注明。
- 不可硬适配或数据缺口时：首页横幅写清完整度（**partial** 或更严）+ 必要时 `ask_user`。

## 分析架构（投研方法）

- **问题/假设**：相对选定基准，谁在样本期呈现更高回归截距/残差均值为正？
- **证据清单**：标的与基准收益序列、回归表、排序
- **多维交叉验证**：全样本 vs 分段；Beta 稳定否
- **结论与不确定**：历史 Alpha≠未来；无成本/无停牌处理须披露
- **微观/制度风险**：涨跌停钝化、T+1、ST/停牌、融券受限（及相关会计口径差异）；不得按美股连续可成交或自由做空假设叙事
- **事实 | 假设 | 推断** 分栏强制

## 数据维度

| 维度 | 取数方向 | 缺失时 |
|------|----------|--------|
| 标的与基准 | `ask_user` / 搜索 | 先确认 |
| 收益序列 | `get_instrument_quotes` | 样本不足则降级 |
| 回归/排序 | `opptrix_run` | 简化 OLS 并标假设 |
| 交付 | `list_web_vendor` → `create_web` | 可跳过口头要点 |
| A股基准/宇宙 | CN 指数成分 + 行情估计 Beta | 无基准序列则 ask_user / partial |


## 步骤

1. **确认默认 CN**：标的/宇宙为 A股或场内 ETF（用户点名其他市场再切换并声明差异）。应用涨跌停/T+1/融券受限等微观约束（见 A股适配）。
2. **确认宇宙、基准、样本期**：无风险利率假设显式
3. **LEAN 溯源边界**：灵感来自 Alpha 排序示例；不跑 LEAN
4. **回归并排序**：输出 Alpha/Beta/R² 表
5. **过拟合警示**：分段对照若可
6. **交付网页（默认）**：`create_web`

## 网页报告建议目录

1. 范围：默认 A股/场内 ETF + LEAN 溯源
2. LEAN 溯源与「非引擎」声明
3. Alpha/Beta 排序表
4. 分段稳健性（若有）
5. 事实 / 假设 / 推断分栏
6. A股适配与限制（默认 CN；微观结构/代理/完整度）
7. 免责声明（非荐股；历史≠未来）

## 禁止

- 荐股、目标价、仓位建议；编造未返回数字
- 把历史 Alpha 写成「持续跑赢保证」
- **禁止假装跑完整 LEAN 引擎**或伪造 LEAN 日志/回测净值
- **禁止无交付就结束**（默认须有 web 产物，除非用户明确只要口头要点）
- 禁止把美股成分/ETF 清单不经映射直接当 A股结果
- 禁止假设可自由融券做空
