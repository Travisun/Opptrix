---
name: lean-etf-thematic-baskets
description: LEAN 启发的主题 ETF 篮工作流。用户说「主题 ETF 篮」「主题篮子」「thematic baskets」「/lean-etf-thematic-baskets」时使用。多主题 ETF 对照持仓与重叠；默认 A股适配。默认 create_web。禁止假装 LEAN 引擎。
license: Apache-2.0
metadata:
  author: opptrix
  version: "1.0"
  title: LEAN主题ETF篮
  summary: 国内主题ETF篮对照与暴露重叠
  category: quant
  slash-rank: "470"
  default-deliverable: web
  required-packs: etf market artifacts
allowed-tools: get_etf_list get_etf_profile get_etf_holdings get_etf_nav search_instruments ask_user opptrix_run workspace_write workspace_read create_web update_web read_web list_web_vendor
---

# LEAN 主题ETF篮

方法溯源 **QuantConnect LEAN** 社区算法/示例思路；本技能是**平台工具编排的投研工作流**，**禁止假装跑完整 LEAN 引擎**或输出 LEAN 回测曲线、订单日志冒充引擎结果。实际取数与计算仅限 Opptrix 工具（行情/财务/`opptrix_run` 沙盒等）。

## 何时使用

用户要比较**多个国内主题场内 ETF 篮子**的持仓重叠、集中度与主题一致性（LEAN 方法溯源，非美股原版照搬）。默认交付可预览网页。

边界：单只 ETF 研究用 `@skill:etf-research`；单 ETF 成分宇宙用 `@skill:lean-etf-constituents`；政策主题叙事映射用 `@skill:theme-policy-map`。

## A股适配（默认）

- 默认市场 **CN（A股 / 场内 ETF）**。用户点名美股/港股再切换，并声明数据口径与微观结构差异。
- 主题宇宙：默认 **申万/概念板块**（`get_sector_*`）+ **行业 ETF** 代理，而非美股主题 ETF 清单。
- 用户点名海外主题再切换并声明数据差异。
- 融券受限 → 主题多空改为「多头排序 / 多头+防御 ETF」。
- 不可硬适配或数据缺口时：首页横幅写清完整度（**partial** 或更严）+ 必要时 `ask_user`。

## 分析架构（投研方法）

- **问题/假设**：各主题篮暴露是否重叠？宣称主题与持仓是否一致？
- **证据清单**：多只 ETF 概况与持仓、重叠矩阵（可沙盒算）
- **多维交叉验证**：主题标签 vs 前十大；篮间 Jaccard/权重重叠
- **结论与不确定**：重叠高≠冗余必减仓；主题叙事可漂移
- **微观/制度风险**：涨跌停钝化、T+1、ST/停牌、融券受限（及相关会计口径差异）；不得按美股连续可成交或自由做空假设叙事
- **事实 | 假设 | 推断** 分栏强制

## 数据维度

| 维度 | 取数方向 | 缺失时 |
|------|----------|--------|
| 主题与 ETF 清单 | `ask_user` / `get_etf_list` | 先确认篮定义 |
| 各篮概况/持仓 | `get_etf_profile` / `get_etf_holdings` | 缺持仓的篮单独标注 |
| 重叠计算 | `opptrix_run`（可 `workspace_write`） | 仅列示前十大对照 |
| 交付 | `list_web_vendor` → `create_web` | 可跳过口头要点 |
| A股主题代理 | `get_sector_*` + 行业 ETF | 主题无板块映射则 ask_user / assumption-only |


## 步骤

1. **确认默认 CN**：标的/宇宙为 A股或场内 ETF（用户点名其他市场再切换并声明差异）。应用涨跌停/T+1/融券受限等微观约束（见 A股适配）。
2. **确认主题与 ETF 映射**：每主题至少一只可解析 ETF
3. **LEAN 溯源边界**：灵感来自主题篮/ETF 轮动示例；不跑 LEAN
4. **拉取各篮持仓**：对齐报告日
5. **重叠与集中度**：沙盒算重叠表；事实/推断分栏
6. **交付网页（默认）**：`create_web`

## 网页报告建议目录

1. 范围：默认 A股/场内 ETF + LEAN 溯源
2. 主题→ETF 映射表
3. 各篮持仓与时效
4. 篮间重叠/集中度
5. 主题一致性交叉验证
6. 事实 / 假设 / 推断分栏
7. A股适配与限制（默认 CN；微观结构/代理/完整度）
8. 免责声明（无买卖建议）

## 禁止

- 荐股、目标价、仓位建议；编造未返回数字
- 编造持仓重叠或假装完整主题库
- **禁止假装跑完整 LEAN 引擎**或伪造 LEAN 日志/回测净值
- **禁止无交付就结束**（默认须有 web 产物，除非用户明确只要口头要点）
- 禁止把美股成分/ETF 清单不经映射直接当 A股结果
- 禁止假设可自由融券做空
