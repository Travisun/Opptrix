---
name: lean-macro-reit-alpha
description: LEAN 启发的宏观×REIT 工作流。用户说「宏观 REIT」「利率与 REIT」「/lean-macro-reit-alpha」时使用。利率/增长代理与 REIT 收益关系假设；assumption-only。默认 A股适配。默认 create_web。禁止假装 LEAN 引擎。
license: Apache-2.0
metadata:
  author: opptrix
  version: "1.0"
  title: LEAN利率地产
  summary: 利率波动与地产/REITs 映射框架
  category: macro
  slash-rank: "520"
  default-deliverable: web
  required-packs: market news workspace artifacts
allowed-tools: search_instruments get_instrument_quotes get_instrument_snapshot get_instrument_profile get_macro_series get_etf_list get_etf_profile get_etf_nav ask_user opptrix_run workspace_write workspace_read create_web update_web read_web list_web_vendor
---

# LEAN 宏观REIT

方法溯源 **QuantConnect LEAN** 社区算法/示例思路；本技能是**平台工具编排的投研工作流**，**禁止假装跑完整 LEAN 引擎**或输出 LEAN 回测曲线、订单日志冒充引擎结果。实际取数与计算仅限 Opptrix 工具（行情/财务/`opptrix_run` 沙盒等）。

> **能力声明（assumption-only）**：本地**无完整宏观因子/REIT 专业数据库**。利率、CPI、增长等须用用户指定代理或可得指数代替，并标 **assumption-only**。禁止假装机构宏观 REIT Alpha 模型或 LEAN 云端因子库结果。

## 何时使用

用户要在 **A股地产/公募 REITs/相关 ETF** 上探索利率/增长等宏观代理与收益关系的假设框架（LEAN 方法溯源，非美股 REIT 原版照搬）。默认交付可预览网页。

边界：宏观简报用 `@skill:macro-brief`；跨资产对照用 `@skill:cross-asset`。无完整宏观因子库时须诚实降级。

## A股适配（默认）

- 默认市场 **CN（A股 / 场内 ETF）**。用户点名美股/港股再切换，并声明数据口径与微观结构差异。
- 默认「利率 / 地产链」→ **A股地产、公募 REITs、相关 ETF**（`search_instruments` / `get_etf_*`）；美股 REIT 仅用户点名。
- 无房贷利率/完整宏观序列时：优先 `get_macro_series`（若工具可用）或 `ask_user` 指定代理；完整度 **assumption-only**。
- 禁止假装机构宏观 REIT 因子库；不做空假设。
- 不可硬适配或数据缺口时：首页横幅写清完整度（**assumption-only** 或更严）+ 必要时 `ask_user`。

## 分析架构（投研方法）

- **问题/假设**：所选宏观代理与 REIT 收益是否同向/反向、滞后几期？
- **证据清单**：REIT 标的序列、宏观代理序列、相关/回归示意
- **多维交叉验证**：不同利率口径；股权 REIT vs 抵押 REIT（若可分）
- **结论与不确定**：宏观叙事易过拟合
- **微观/制度风险**：涨跌停钝化、T+1、ST/停牌、融券受限（及相关会计口径差异）；不得按美股连续可成交或自由做空假设叙事
- **事实 | 假设 | 推断** 分栏强制

## 数据维度

| 维度 | 取数方向 | 缺失时 |
|------|----------|--------|
| REIT 标的 | `search_instruments` / `ask_user` | 先确认 |
| 宏观代理 | `ask_user`（必须写清代理定义） | 禁止静默用「共识预测」 |
| 序列与回归 | `get_instrument_quotes` + `opptrix_run` | 仅定性对照 |
| 交付 | `list_web_vendor` → `create_web` | 可跳过口头要点 |
| A股地产/REITs代理 | 地产股/REITs/相关 ETF + 宏观代理 | 无利率序列 → get_macro_series / ask_user；assumption-only |


## 步骤

1. **确认默认 CN**：标的/宇宙为 A股或场内 ETF（用户点名其他市场再切换并声明差异）。应用涨跌停/T+1/融券受限等微观约束（见 A股适配）。
2. **能力横幅**：assumption-only；非机构库
3. **确认 REIT 与宏观代理**：样本期
4. **相关/回归示意**：敏感与分段
5. **分栏结论**：禁止仓位建议
6. **交付网页（默认）**：`create_web`

## 网页报告建议目录

1. 范围：默认 A股/场内 ETF + LEAN 溯源；assumption-only
2. REIT 与宏观代理定义
3. 相关/回归示意表
4. 分段与敏感性
5. 事实 / 假设 / 推断分栏
6. A股适配与限制（默认 CN；微观结构/代理/完整度）
7. 免责声明（无买卖建议）

## 禁止

- 荐股、目标价、仓位建议；编造未返回数字
- 假装机构宏观因子库或卖方 REIT 模型
- **禁止假装跑完整 LEAN 引擎**或伪造 LEAN 日志/回测净值
- **禁止无交付就结束**（默认须有 web 产物，除非用户明确只要口头要点）
- 禁止把美股成分/ETF 清单不经映射直接当 A股结果
- 禁止假设可自由融券做空
