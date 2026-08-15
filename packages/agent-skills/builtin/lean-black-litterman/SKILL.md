---
name: lean-black-litterman
description: LEAN 启发的 Black-Litterman 工作流。用户说「Black-Litterman」「黑利特曼」「BL 观点」「/lean-black-litterman」时使用。均衡先验+主观观点假设框架；assumption-only。默认 A股适配。默认 create_web。禁止假装 LEAN 引擎。
license: Apache-2.0
metadata:
  author: opptrix
  version: "1.0"
  title: LEAN黑利特曼
  summary: A股/场内ETF上的BL观点合成假设框架
  category: quant
  slash-rank: "495"
  default-deliverable: web
  required-packs: portfolio market workspace artifacts
allowed-tools: get_portfolio_holdings portfolio_summary search_instruments batch_instrument_snapshots ask_user opptrix_run workspace_write workspace_read create_web update_web read_web list_web_vendor
---

# LEAN 黑利特曼

方法溯源 **QuantConnect LEAN** 社区算法/示例思路；本技能是**平台工具编排的投研工作流**，**禁止假装跑完整 LEAN 引擎**或输出 LEAN 回测曲线、订单日志冒充引擎结果。实际取数与计算仅限 Opptrix 工具（行情/财务/`opptrix_run` 沙盒等）。

> **能力声明（assumption-only）**：无机构级先验/协方差服务；均衡收益、风险厌恶、观点矩阵与 τ 等须 **ask_user 或显式假设**。输出为**教育/示意**，禁止假装已跑卖方 BL 引擎或 LEAN 优化内核。完整度：**assumption-only**。

## 何时使用

用户要在 **A股/场内 ETF** 上用 **Black-Litterman** 把「均衡先验 + 主观观点」合成为后验预期收益/权重示意（LEAN 方法溯源，非美股原版照搬）。默认交付可预览网页。

边界：组合复盘用 `@skill:portfolio-review`；风险平价用 `@skill:lean-risk-parity`；均值方差用 `@skill:lean-mean-variance`。本技能**不**提供机构级协方差估计服务，完整度 **assumption-only**。

## A股适配（默认）

- 默认市场 **CN（A股 / 场内 ETF）**。用户点名美股/港股再切换，并声明数据口径与微观结构差异。
- 默认先验/观点落在 **CN 行业或宽基 ETF**；观点来自用户或可得研究，标 **assumption-only**。
- 后验权重默认多头；融券受限禁止负权重自由做空。
- 不可硬适配或数据缺口时：首页横幅写清完整度（**assumption-only** 或更严）+ 必要时 `ask_user`。

## 分析架构（投研方法）

- **问题/假设**：在显式观点与不确定度下，后验权重如何相对先验移动？
- **证据清单**：资产清单、用户观点、（可选）历史收益协方差沙盒估计
- **多维交叉验证**：观点强度 τ/Ω 敏感；有无观点时权重对比
- **结论与不确定**：示意≠可执行优化器输出
- **微观/制度风险**：涨跌停钝化、T+1、ST/停牌、融券受限（及相关会计口径差异）；不得按美股连续可成交或自由做空假设叙事
- **事实 | 假设 | 推断** 分栏强制

## 数据维度

| 维度 | 取数方向 | 缺失时 |
|------|----------|--------|
| 资产与基准 | `ask_user` / 组合持仓 / `portfolio_summary` / 搜索 | 先确认 |
| 观点 P/Q/Ω | `ask_user`（必须） | 禁止静默编造「市场共识观点」 |
| 协方差示意 | `opptrix_run`（历史收益） | 用对角简化并标假设 |
| 交付 | `list_web_vendor` → `create_web` | 可跳过口头要点 |
| A股观点/先验 | CN 行业/ETF + 用户观点 | 无观点 → ask_user；assumption-only |


## 步骤

1. **确认默认 CN**：标的/宇宙为 A股或场内 ETF（用户点名其他市场再切换并声明差异）。应用涨跌停/T+1/融券受限等微观约束（见 A股适配）。
2. **能力横幅**：assumption-only；非 LEAN/卖方引擎
3. **收集资产与观点**：强度与置信必须显式
4. **先验与后验示意**：沙盒计算；敏感度表
5. **分栏结论**：禁止仓位建议措辞
6. **交付网页（默认）**：`create_web`

## 网页报告建议目录

1. 范围：默认 A股/场内 ETF + LEAN 溯源；assumption-only
2. 资产、先验与观点表
3. 后验预期/权重示意
4. 敏感性（τ / 观点强度）
5. 事实 / 假设 / 推断分栏
6. 局限与不可执行声明
7. A股适配与限制（默认 CN；微观结构/代理/完整度）
8. 免责声明（无仓位建议）

## 禁止

- 荐股、目标价、仓位建议；编造未返回数字
- 假装卖方共识观点或机构 BL 引擎结果
- 把示意权重写成下单清单
- **禁止假装跑完整 LEAN 引擎**或伪造 LEAN 日志/回测净值
- **禁止无交付就结束**（默认须有 web 产物，除非用户明确只要口头要点）
- 禁止把美股成分/ETF 清单不经映射直接当 A股结果
- 禁止假设可自由融券做空
