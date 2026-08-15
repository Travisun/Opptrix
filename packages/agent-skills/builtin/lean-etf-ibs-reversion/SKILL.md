---
name: lean-etf-ibs-reversion
description: LEAN 启发的 ETF IBS（Internal Bar Strength）回归工作流。用户说「IBS」「Internal Bar Strength」「IBS 回归」「ETF IBS」「/lean-etf-ibs-reversion」时使用。方法溯源 QuantConnect LEAN IBS 类示例；用高低收计算强度状态。默认 A股适配。默认 create_web。禁止假装跑完整 LEAN 引擎。
license: Apache-2.0
metadata:
  author: opptrix
  version: "1.0"
  title: LEAN IBS回归
  summary: 场内 ETF/A股 IBS 位置与回归规则解读
  category: quant
  slash-rank: "450"
  default-deliverable: web
  required-packs: etf market artifacts
allowed-tools: get_etf_list get_etf_nav search_instruments get_instrument_chart get_instrument_snapshot get_etf_profile ask_user opptrix_run workspace_write workspace_read create_web update_web read_web list_web_vendor
---

# LEAN ETF IBS 回归

方法溯源 **QuantConnect LEAN** 社区/文档中常见的 **IBS（Internal Bar Strength）** 均值回归思路：\(IBS = (Close - Low) / (High - Low)\)。本技能做**IBS 状态与阈值规则解读**，**禁止假装跑完整 LEAN 引擎**。

## 何时使用

用户要对 **场内 ETF/A股标的** 计算/解读 IBS，并对照低 IBS「超卖回归」类规则（LEAN 方法溯源，非美股原版照搬）。

边界：RSI 回归用 `@skill:lean-rsi-reversion`；单只 ETF 持仓尽调用 `@skill:etf-research`；指标手册用 `@skill:lean-indicator-playbook`。默认交付网页。

## A股适配（默认）

- 默认市场 **CN（A股 / 场内 ETF）**。用户点名美股/港股再切换，并声明数据口径与微观结构差异。
- 默认标的池：**A股 / 场内 ETF**（`get_etf_list` / `search_instruments`）；用户点名美股再切换。
- IBS + 微观结构：涨跌停或一字板常致 High≈Low → IBS 无定义或信号失效，须剔除/标注；T+1 使「当日 IBS 极端 → 次日开盘交易」叙述须诚实。
- 禁止假设可自由做空；规则默认多头侧或空仓，不做空头 IBS 套利指令。
- 不可硬适配或数据缺口时：首页横幅写清完整度（**partial** 或更严）+ 必要时 `ask_user`。

## 分析架构（投研方法）

- **问题/假设**：在约定 K 线周期下，IBS 是否处于极端低/高区？是否与趋势冲突？
- **证据清单**：OHLC 推得 IBS（事实）、阈值（假设）、回归叙述（推断）
- **多维交叉验证**：IBS vs 多日均值；与均线趋势是否背离
- **结论与不确定**：缺口/涨跌停导致 High=Low；趋势市假信号
- **风险与缺口**：无 OHLC、周期未确认
- **微观/制度风险**：涨跌停钝化、T+1、ST/停牌、融券受限（及相关会计口径差异）；不得按美股连续可成交或自由做空假设叙事
- **事实 | 假设 | 推断** 分栏强制

## 数据维度

| 维度 | 取数方向 | 缺失时 |
|------|----------|--------|
| 标的/ETF | `search_instruments` / `get_etf_list` / `ask_user` | 先确认 |
| OHLC/图表 | `get_instrument_chart` | not-feasible |
| 快照 | `get_instrument_snapshot` | 可选 |
| 净值（ETF） | `get_etf_nav` | 用价格序列并说明 |
| 阈值 | `ask_user` | 显式默认（如 IBS < 0.2）并标假设 |
| 计算 | `opptrix_run` | 手工并披露公式 |
| 交付 | `list_web_vendor` → `create_web` | 可跳过口头要点 |
| 市场/微观结构 | CN 场内 ETF/股票 OHLC；涨跌停日剔除 | High=Low 标无效；样本不足则降级 |


## 步骤

1. **确认默认 CN**：标的/宇宙为 A股或场内 ETF（用户点名其他市场再切换并声明差异）。应用涨跌停/T+1/融券受限等微观约束（见 A股适配）。
2. **确认标的与 K 线周期、IBS 阈值**。
3. **声明非 LEAN Runtime**；写出 IBS 公式。
4. **取 OHLC 计算 IBS**；处理 High=Low 特例。
5. **对照阈值与趋势冲突**。
6. **分栏结论** → 默认 `create_web`。

## 网页报告建议目录

1. 范围：默认 A股/场内 ETF + LEAN 溯源
2. IBS 定义与阈值规则  
3. 当前 IBS 与近期序列（事实）  
4. 与趋势指标的冲突检查  
5. 事实 / 假设 / 推断  
6. 局限（缺口、涨跌停、样本）  
7. A股适配与限制（默认 CN；微观结构/代理/完整度）
8. 免责声明（IBS 状态≠买卖建议）

## 禁止

- 荐股；把低 IBS 写成「抄底」  
- **禁止假装跑完整 LEAN 引擎**或编造历史 IBS 胜率  
- **禁止无交付就结束**（默认 web）  
- 在 High=Low 时强行除零却不披露
- 禁止把美股成分/ETF 清单不经映射直接当 A股结果
- 禁止假设可自由融券做空
