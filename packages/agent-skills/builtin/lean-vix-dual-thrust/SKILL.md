---
name: lean-vix-dual-thrust
description: LEAN 启发的 VIX × Dual Thrust 工作流。用户说「VIX Dual Thrust」「波动 DualThrust」「/lean-vix-dual-thrust」时使用。波动代理过滤的通道突破示意；须声明 VIX 标的可得性。默认 A股适配。默认 create_web。禁止假装 LEAN 引擎。
license: Apache-2.0
metadata:
  author: opptrix
  version: "1.0"
  title: LEAN波动通道
  summary: 波动类标的 Dual Thrust 方法（诚实降级）
  category: quant
  slash-rank: "515"
  default-deliverable: web
  required-packs: market instrument_analytics workspace artifacts
allowed-tools: search_instruments get_instrument_snapshot get_instrument_chart get_instrument_quotes get_instrument_indicators ask_user opptrix_run workspace_write workspace_read create_web update_web read_web list_web_vendor
---

# LEAN VIX DualThrust

方法溯源 **QuantConnect LEAN** 社区算法/示例思路；本技能是**平台工具编排的投研工作流**，**禁止假装跑完整 LEAN 引擎**或输出 LEAN 回测曲线、订单日志冒充引擎结果。实际取数与计算仅限 Opptrix 工具（行情/财务/`opptrix_run` 沙盒等）。

> **能力声明（assumption-only）**：**VIX 及波动标的可得性因市场/数据源而异**。若无法解析 VIX 或等价指数，须改用已实现波动/ATR 等**代理**并在首页声明；禁止假装已接入官方 VIX 期货连续合约。完整度：数据可得时为分析框架，否则 **assumption-only 代理**。

## 何时使用

用户要在 **A股/场内 ETF** 上研究 **Dual Thrust 通道**，并结合波动代理过滤的示意框架（LEAN 方法溯源；通常无 VIX，须诚实降级，非美股原版照搬）。默认交付可预览网页。

边界：一般信号用 `@skill:instrument-signals`；参数网格用 `@skill:lean-param-grid-optimize` 或 `@skill:robustness-check`。

## A股适配（默认）

- 默认市场 **CN（A股 / 场内 ETF）**。用户点名美股/港股再切换，并声明数据口径与微观结构差异。
- **诚实缺口**：本地通常 **无 VIX / UVXY**。若无波动指数或期权隐含波动序列 → 完整度 **not-feasible-now**，或改用本地波动 ETF / 已实现波动 / 50ETF 波动相关产品作代理并声明 **assumption-only**。
- 默认交易标的 CN；Dual Thrust 通道在涨跌停日可能缺口失效；融券受限 → 只做多头突破示意或空仓，禁止自由做空。
- 不可硬适配时：首页横幅 + `ask_user` 确认是否接受代理或终止。
- 不可硬适配或数据缺口时：首页横幅写清完整度（**not-feasible-now** 或更严）+ 必要时 `ask_user`。

## 分析架构（投研方法）

- **问题/假设**：在波动高低分位下，Dual Thrust 触发是否呈现不同频率/方向分布？
- **证据清单**：标的 OHLC、通道参数、VIX 或波动代理序列
- **多维交叉验证**：有无波动过滤对照；参数敏感
- **结论与不确定**：示意≠可交易系统
- **微观/制度风险**：涨跌停钝化、T+1、ST/停牌、融券受限（及相关会计口径差异）；不得按美股连续可成交或自由做空假设叙事
- **事实 | 假设 | 推断** 分栏强制

## 数据维度

| 维度 | 取数方向 | 缺失时 |
|------|----------|--------|
| 交易标的 | `search_instruments` / `ask_user` | 先确认 |
| VIX/代理 | 搜索 VIX 或 `ask_user` 指定代理 | 改用已实现波动并横幅声明 |
| OHLC/指标 | `get_instrument_quotes` / indicators | 样本不足则降级 |
| 通道计算 | `opptrix_run` | 参数标假设 |
| 交付 | `list_web_vendor` → `create_web` | 可跳过口头要点 |
| A股波动代理 | 已实现波动/ATR/本地波动 ETF（若有） | 无 VIX → not-feasible-now 或 assumption-only 代理 + ask_user |


## 步骤

1. **确认默认 CN**：标的/宇宙为 A股或场内 ETF（用户点名其他市场再切换并声明差异）。应用涨跌停/T+1/融券受限等微观约束（见 A股适配）。
2. **确认标的与波动源**：首页写 VIX 可得性/代理
3. **LEAN 溯源边界**：Dual Thrust 社区示例启发；不跑 LEAN
4. **计算通道与触发表**：波动分位过滤对照
5. **分栏结论**：禁止下单指令
6. **交付网页（默认）**：`create_web`

## 网页报告建议目录

1. 范围：默认 A股/场内 ETF + LEAN 溯源；VIX/代理可得性
2. Dual Thrust 参数假设
3. 触发事件表与波动分位
4. 对照（有无过滤）
5. 事实 / 假设 / 推断分栏
6. A股适配与限制（默认 CN；微观结构/代理/完整度）
7. 免责声明（无买卖建议）

## 禁止

- 荐股、目标价、仓位建议；编造未返回数字
- 在无 VIX 数据时假装已用官方 VIX
- 输出开平仓指令
- **禁止假装跑完整 LEAN 引擎**或伪造 LEAN 日志/回测净值
- **禁止无交付就结束**（默认须有 web 产物，除非用户明确只要口头要点）
- 禁止把美股成分/ETF 清单不经映射直接当 A股结果
- 禁止假设可自由融券做空
