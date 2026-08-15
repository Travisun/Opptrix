---
name: lean-etf-constituents
description: LEAN 启发的 ETF 成分宇宙工作流。用户说「ETF 成分宇宙」「按 ETF 持仓建池」「constituents universe」「/lean-etf-constituents」时使用。用 ETF 持仓作研究宇宙；默认 A股适配。默认 create_web。禁止假装 LEAN 引擎。
license: Apache-2.0
metadata:
  author: opptrix
  version: "1.0"
  title: LEAN ETF成分宇宙
  summary: 以场内ETF持仓构建A股研究宇宙
  category: quant
  slash-rank: "460"
  default-deliverable: web
  required-packs: etf market artifacts
allowed-tools: get_etf_list get_etf_profile get_etf_holdings get_etf_nav search_instruments batch_instrument_snapshots ask_user opptrix_run workspace_write workspace_read create_web update_web read_web list_web_vendor
---

# LEAN ETF成分宇宙

方法溯源 **QuantConnect LEAN** 社区算法/示例思路；本技能是**平台工具编排的投研工作流**，**禁止假装跑完整 LEAN 引擎**或输出 LEAN 回测曲线、订单日志冒充引擎结果。实际取数与计算仅限 Opptrix 工具（行情/财务/`opptrix_run` 沙盒等）。

## 何时使用

用户要以 **场内 ETF（默认 A股）** 持仓作为研究/筛选宇宙（成分+权重事实表），而非单只 ETF 概况尽调（LEAN 方法溯源，非美股原版照搬）。默认交付可预览网页。

边界：单只 ETF 概况/净值/持仓解读用 `@skill:etf-research`；主题多篮对照用 `@skill:lean-etf-thematic-baskets`；条件筛选事实表用 `@skill:universe-screen`。

## A股适配（默认）

- 默认市场 **CN（A股 / 场内 ETF）**。用户点名美股/港股再切换，并声明数据口径与微观结构差异。
- 默认取数优先 `search_instruments` / `get_index_constituents` / `get_sector_*` / `get_etf_*` 及 CN 可用指标与行情工具。
- 默认场内 ETF（如 510300 等由 `ask_user` 确认代码）；用 `get_etf_holdings` / `get_etf_profile` 拉持仓。
- 美股原版 ETF 成分清单仅作溯源对照，禁止把美股持仓硬说成 A 股。
- 微观结构：成分权重与成交额受涨跌停影响时须注明；不做空假设。
- 不可硬适配或数据缺口时：首页横幅写清完整度（**partial** 或更严）+ 必要时 `ask_user`。

## 分析架构（投研方法）

- **问题/假设**：该 ETF 持仓宇宙覆盖哪些标的？权重集中度如何？
- **证据清单**：ETF 概况、持仓表、可选成分快照
- **多维交叉验证**：宣称跟踪主题 vs 前十大；权重和 vs 100%；持仓时效 vs 报告日
- **结论与不确定**：成分表≠可投资组合建议；权重滞后须披露
- **风险与缺口**：缺持仓、联接基金差异、跨境标的不可得
- **微观/制度风险**：涨跌停钝化、T+1、ST/停牌、融券受限（及相关会计口径差异）；不得按美股连续可成交或自由做空假设叙事
- **事实 | 假设 | 推断** 分栏强制

## 数据维度

| 维度 | 取数方向 | 缺失时 |
|------|----------|--------|
| ETF 定位 | `get_etf_list` / `search_instruments` / `ask_user` | 先确认代码 |
| 概况 | `get_etf_profile` | 仅写可得字段 |
| 持仓/权重 | `get_etf_holdings` | 降级为「无持仓」并中止宇宙表 |
| 成分行情（可选） | `batch_instrument_snapshots` | 省略行情列 |
| 固化 | `workspace_write` / `opptrix_run` | 仅聊天表并说明未落盘 |
| 交付 | `list_web_vendor` → `create_web` | 用户只要口头要点时可跳过 |
| A股场内ETF | `get_etf_*` + `ask_user` 确认代码 | 无持仓则 partial + 缺口横幅 |


## 步骤

1. **确认默认 CN**：标的/宇宙为 A股或场内 ETF（用户点名其他市场再切换并声明差异）。应用涨跌停/T+1/融券受限等微观约束（见 A股适配）。
2. **确认 ETF**：一只或多只；多只时说明是并集还是分篮
3. **写清 LEAN 溯源边界**：灵感来自 LEAN ETF Universe Selection 思路；本会话不启动 LEAN Runtime
4. **拉取概况与持仓**：整理成分代码、权重、报告日
5. **可选补行情**：批量快照；缺字段记未知
6. **事实/假设/推断分栏**：权重为事实（带时效）；「代表性宇宙」为推断
7. **交付网页（默认）**：`list_web_vendor` → `create_web`；已有则 `read_web` / `update_web`

## 网页报告建议目录

1. 范围：默认 A股/场内 ETF + LEAN 溯源
2. ETF 卡片与持仓时效
3. 成分与权重表（可排序）
4. 集中度与覆盖统计
5. 可选成分行情摘要
6. 事实 / 假设 / 推断分栏
7. 缺口与后续技能指引
8. A股适配与限制（默认 CN；微观结构/代理/完整度）
9. 免责声明（无买卖建议；非 LEAN 官方回测）

## 禁止

- 荐股、目标价、仓位建议；编造未返回数字
- 把持仓宇宙包装成荐股池或「必配组合」
- **禁止假装跑完整 LEAN 引擎**或伪造 LEAN 日志/回测净值
- **禁止无交付就结束**（默认须有 web 产物，除非用户明确只要口头要点）
- 禁止把美股成分/ETF 清单不经映射直接当 A股结果
- 禁止假设可自由融券做空
