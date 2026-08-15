---
name: lean-param-grid-optimize
description: LEAN 启发的参数网格优化工作流。用户说「参数网格」「网格优化」「param grid」「/lean-param-grid-optimize」时使用。与稳健性/因子研究分工；无 Walk-forward 须写明。默认 A股适配。默认 create_web。禁止假装 LEAN 引擎。
license: Apache-2.0
metadata:
  author: opptrix
  version: "1.0"
  title: LEAN参数网格
  summary: A股策略参数网格示意（无Walk-forward）
  category: quant
  slash-rank: "530"
  default-deliverable: web
  required-packs: instrument_analytics strategy_extra workspace artifacts
allowed-tools: verify_instrument_strategy run_backtest ask_user opptrix_run workspace_write workspace_read create_web update_web read_web list_web_vendor
---

# LEAN 参数网格

方法溯源 **QuantConnect LEAN** 社区算法/示例思路；本技能是**平台工具编排的投研工作流**，**禁止假装跑完整 LEAN 引擎**或输出 LEAN 回测曲线、订单日志冒充引擎结果。实际取数与计算仅限 Opptrix 工具（行情/财务/`opptrix_run` 沙盒等）。

## 何时使用

用户要对 **A股/场内 ETF** 策略/信号参数做**网格搜索示意**并汇总热力/表，关注过拟合风险（LEAN 方法溯源，非美股原版照搬）。默认交付可预览网页。

边界：稳健性扰动检验用 `@skill:robustness-check`；因子历史有效性用 `@skill:factor-research`。本技能侧重**参数网格设计与结果汇总**；**默认不包含 Walk-forward**，若未做必须在报告首页写明。

## A股适配（默认）

- 默认市场 **CN（A股 / 场内 ETF）**。用户点名美股/港股再切换，并声明数据口径与微观结构差异。
- 参数网格默认在 **CN 标的/宇宙** 上示意；须声明未做 Walk-forward 时为 **assumption-only** 教育示意。
- 涨跌停/T+1 改变可成交路径 → 网格「最优」不可直接当交易参数。
- 禁止假设可自由做空的目标函数。
- 不可硬适配或数据缺口时：首页横幅写清完整度（**partial** 或更严）+ 必要时 `ask_user`。

## 分析架构（投研方法）

- **问题/假设**：参数邻域内指标如何分布？最优格点是否孤立尖峰？
- **证据清单**：网格定义、`opptrix_run`/`verify_instrument_strategy`/`run_backtest` 结果
- **多维交叉验证**：最优 vs 邻域中位数；有无样本外（若无则声明）
- **结论与不确定**：网格最优≠可上线；无 WF 时过拟合风险更高
- **微观/制度风险**：涨跌停钝化、T+1、ST/停牌、融券受限（及相关会计口径差异）；不得按美股连续可成交或自由做空假设叙事
- **事实 | 假设 | 推断** 分栏强制

## 数据维度

| 维度 | 取数方向 | 缺失时 |
|------|----------|--------|
| 策略与参数维 | `ask_user` | 先确认 |
| 基准验证 | `verify_instrument_strategy` | 说明失败原因 |
| 回测（可选） | `run_backtest` | 仅信号层网格 |
| 网格计算 | `opptrix_run` + `workspace_write` | 稀疏网格并标明非穷尽 |
| 交付 | `list_web_vendor` → `create_web` | 可跳过口头要点 |
| A股约束 | CN 样本 + 多头约束目标 | 样本不足则缩小网格并声明 |


## 步骤

1. **确认默认 CN**：标的/宇宙为 A股或场内 ETF（用户点名其他市场再切换并声明差异）。应用涨跌停/T+1/融券受限等微观约束（见 A股适配）。
2. **确认参数维与度量**：夏普/回撤等
3. **声明验证协议**：**若无 Walk-forward，首页必须写明「未做 Walk-forward / 样本外验证」**
4. **跑网格并落表**：禁止只展示最好看的一格
5. **与 `@skill:robustness-check` / `@skill:factor-research` 对照说明**：分工写清
6. **交付网页（默认）**：`create_web`

## 网页报告建议目录

1. 范围：默认 A股/场内 ETF + LEAN 溯源
2. 验证协议（含：有无 Walk-forward）
3. 结果热力/表（全网格可见）
4. 过拟合与尖峰检查
5. 与稳健性/因子研究边界
6. 事实 / 假设 / 推断分栏
7. A股适配与限制（默认 CN；微观结构/代理/完整度）
8. 免责声明（非投资建议）

## 禁止

- 荐股、目标价、仓位建议；编造未返回数字
- 隐瞒未做 Walk-forward
- 只展示最优格点隐瞒其余
- 假装 LEAN Optimizer 云端结果
- **禁止假装跑完整 LEAN 引擎**或伪造 LEAN 日志/回测净值
- **禁止无交付就结束**（默认须有 web 产物，除非用户明确只要口头要点）
- 禁止把美股成分/ETF 清单不经映射直接当 A股结果
- 禁止假设可自由融券做空
