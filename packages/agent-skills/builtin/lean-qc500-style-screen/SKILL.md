---
name: lean-qc500-style-screen
description: LEAN 启发的 QC500 式流动性宇宙筛选。用户说「QC500」「类 QC500 筛选」「流动性大盘池」「/lean-qc500-style-screen」时使用。A 股等市场仅为近似规则；禁止称「这就是 QC500」。默认 A股适配。默认 create_web。禁止假装 LEAN 引擎。
license: Apache-2.0
metadata:
  author: opptrix
  version: "1.0"
  title: LEAN流动性筛选
  summary: 宽基成分上的成交额与规模启发式筛选
  category: quant
  slash-rank: "465"
  default-deliverable: web
  required-packs: industry fundamentals market artifacts
allowed-tools: get_index_constituents get_sector_constituents get_sector_list batch_instrument_snapshots get_instrument_financials search_instruments ask_user opptrix_run workspace_write workspace_read create_web update_web read_web list_web_vendor
---

# LEAN QC500式筛选

方法溯源 **QuantConnect LEAN** 社区算法/示例思路；本技能是**平台工具编排的投研工作流**，**禁止假装跑完整 LEAN 引擎**或输出 LEAN 回测曲线、订单日志冒充引擎结果。实际取数与计算仅限 Opptrix 工具（行情/财务/`opptrix_run` 沙盒等）。

> **能力声明（assumption-only）**：本技能在非美股（尤其 **A 股**）上仅为 **QC500 风格近似规则**，**不是** QuantConnect 官方 QC500 成分、也**不是**「这就是 QC500」。规则、阈值与字段口径须在报告首页声明。完整度：**assumption-only**。

## 何时使用

用户要在 **A股宽基成分**上做流动性/规模启发式筛选，得到可复核候选表（LEAN QC500 风格溯源，非官方 QC500、非美股原版照搬）。默认交付可预览网页。

边界：一般成分条件筛选用 `@skill:universe-screen`；本技能专指 **QC500 风格规则**（成交额/市值/排除壳等启发式）。**禁止**声称输出「官方 QC500 成分」或「这就是 QC500」。

## A股适配（默认）

- 默认市场 **CN（A股 / 场内 ETF）**。用户点名美股/港股再切换，并声明数据口径与微观结构差异。
- 默认取数优先 `search_instruments` / `get_index_constituents` / `get_sector_*` / `get_etf_*` 及 CN 可用指标与行情工具。
- **禁止称「这就是 QC500」**：A 股路径仅为「宽基 + 成交额 + 财务/市值」启发式近似，完整度 **assumption-only**。
- 示例宇宙：`get_index_constituents` 沪深300 / 中证500 / 创业板指成分；再叠加成交额与财务过滤。
- 微观结构：涨跌停可能导致流动性/成交额失真；融券受限 → 筛选结果只做多头候选，禁止假设可自由做空对冲。
- 代理映射：美股 QC500 官方成分本地不可得 → 用上述指数池近似；不可硬适配处首页横幅 + `ask_user`。
- 不可硬适配或数据缺口时：首页横幅写清完整度（**assumption-only** 或更严）+ 必要时 `ask_user`。

## 分析架构（投研方法）

- **问题/假设**：在本地可得数据下，哪些标的近似满足「高流动性大盘」筛选？
- **证据清单**：指数/板块成分、批量快照、可选财务/市值字段
- **多维交叉验证**：规则命中数 vs 表行；缺失字段不得当通过
- **结论与不确定**：近似≠官方 QC500；跨市场规则不可直接搬用
- **风险与缺口**：无美股专属 QC500 成分源、A 股字段口径差异
- **微观/制度风险**：涨跌停钝化、T+1、ST/停牌、融券受限（及相关会计口径差异）；不得按美股连续可成交或自由做空假设叙事
- **事实 | 假设 | 推断** 分栏强制

## 数据维度

| 维度 | 取数方向 | 缺失时 |
|------|----------|--------|
| 宇宙基底 | `get_index_constituents` / `get_sector_constituents` / 用户清单 | 先确认基底 |
| 筛选规则 | `ask_user`（成交额、市值分位、排除条件等） | 用书面默认启发式并标假设 |
| 批量行情 | `batch_instrument_snapshots` | 缩小池或降级 |
| 财务/规模 | `get_instrument_financials`（按需） | 跳过该条件并标明 |
| 交付 | `list_web_vendor` → `create_web` | 可跳过口头要点 |
| A股代理 / 市场 | 沪深300/中证500/创业板指 + 成交额/财务启发式 | 横幅 assumption-only；禁止称 QC500；`ask_user` 确认基底 |


## 步骤

1. **确认默认 CN**：标的/宇宙为 A股或场内 ETF（用户点名其他市场再切换并声明差异）。应用涨跌停/T+1/融券受限等微观约束（见 A股适配）。
2. **确认市场与基底**：指数/板块/自建池；写明非官方 QC500
3. **声明近似规则**：首页横幅：A 股/其他市场为风格近似
4. **拉取成分与快照**：应用硬性过滤；缺字段=未知
5. **输出候选表**：含规则命中统计；入选≠看好
6. **交付网页（默认）**：见 `@skill:create-web`

## 网页报告建议目录

1. 范围：默认 A股/场内 ETF + LEAN 溯源；非官方 QC500
2. 方法溯源（LEAN）与「非引擎」声明
3. 基底宇宙与规则表（假设）
4. 筛选结果表与命中统计
5. 数据缺口与口径差异
6. 事实 / 假设 / 推断分栏
7. A股适配与限制（默认 CN；微观结构/代理/完整度）
8. 免责声明（非荐股池；非官方 QC500）

## 禁止

- 荐股、目标价、仓位建议；编造未返回数字
- 声称「这就是 QC500」或官方成分同步
- 把筛选结果包装成荐股池
- **禁止假装跑完整 LEAN 引擎**或伪造 LEAN 日志/回测净值
- **禁止无交付就结束**（默认须有 web 产物，除非用户明确只要口头要点）
- 禁止把美股成分/ETF 清单不经映射直接当 A股结果
- 禁止假设可自由融券做空
- 禁止声称官方 QC500 或「这就是 QC500」
