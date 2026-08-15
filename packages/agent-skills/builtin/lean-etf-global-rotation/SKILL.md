---
name: lean-etf-global-rotation
description: LEAN 启发的 ETF 全球/跨市场轮动工作流。用户说「ETF 轮动」「全球 ETF 配置」「global rotation」「国家/行业 ETF 轮换」「/lean-etf-global-rotation」时使用。方法溯源 QuantConnect LEAN 轮动示例；对比相对强弱而非单只 ETF 尽调。默认 A股适配。默认 create_web。禁止假装跑完整 LEAN 引擎。
license: Apache-2.0
metadata:
  author: opptrix
  version: "1.0"
  title: LEAN ETF轮动
  summary: 国内宽基/行业/债基相对强弱轮动
  category: quant
  slash-rank: "420"
  default-deliverable: web
  required-packs: etf market artifacts
allowed-tools: get_etf_list get_etf_profile get_etf_nav search_instruments get_instrument_chart batch_instrument_snapshots ask_user opptrix_run workspace_write workspace_read create_web update_web read_web list_web_vendor
---

# LEAN ETF 全球轮动

方法溯源 **QuantConnect LEAN** 中常见的多 ETF / 跨市场相对强弱轮动思路；本技能做**候选池相对强弱与规则状态解读**，**禁止假装跑完整 LEAN 引擎**。

## 何时使用

用户要在 **A股/场内 ETF**（国内宽基/行业/债基等）上做相对强弱、动量或简单轮动规则对照（LEAN 方法溯源，非美股全球篮原版照搬）。

边界：单只 ETF 概况/净值/持仓尽调用 `@skill:etf-research`；收益动量单技能用 `@skill:lean-returns-momentum`；风格叙事用 `@skill:style-rotation`。默认交付网页。

## A股适配（默认）

- 默认市场 **CN（A股 / 场内 ETF）**。用户点名美股/港股再切换，并声明数据口径与微观结构差异。
- 默认取数优先 `search_instruments` / `get_index_constituents` / `get_sector_*` / `get_etf_*` 及 CN 可用指标与行情工具。
- 默认代理篮：**国内宽基 / 行业 / 债基 / 货币 ETF** 轮动（如沪深300、中证500、行业 ETF、国债/货币 ETF）；全球国家篮子仅用户点名后再用，并声明跨境数据差异。
- 微观结构：T+1 对「日频轮动」执行假设有影响；涨跌停可致信号日无法成交。融券/做空受限 → 轮动模板默认「多头 Top-N + 空仓/防御 ETF」，禁止自由做空空头腿。
- 完整度：**partial**（国内篮可跑；全球篮依赖用户指定与数据可得）。
- 不可硬适配或数据缺口时：首页横幅写清完整度（**partial** 或更严）+ 必要时 `ask_user`。

## 分析架构（投研方法）

- **问题/假设**：在约定窗口与候选池下，谁相对强/弱？轮动规则当前指向何处？
- **证据清单**：净值/价格序列与相对收益（事实）、池与规则（假设）、配置含义叙述（推断）
- **多维交叉验证**：多窗口排名一致性；费用/跟踪误差 vs 相对强弱（若有概况）
- **结论与不确定**：汇率、时差、交易时段；历史轮动≠未来
- **风险与缺口**：候选池未确认、缺净值、跨市场不可比
- **微观/制度风险**：涨跌停钝化、T+1、ST/停牌、融券受限（及相关会计口径差异）；不得按美股连续可成交或自由做空假设叙事
- **事实 | 假设 | 推断** 分栏强制

## 数据维度

| 维度 | 取数方向 | 缺失时 |
|------|----------|--------|
| 候选 ETF | `ask_user` / `get_etf_list` / `search_instruments` | 先确认池 |
| 概况 | `get_etf_profile` | 跳过费用章 |
| 净值/走势 | `get_etf_nav` / `get_instrument_chart` | 标明缺口 |
| 批量对照 | `batch_instrument_snapshots` | 缩小池 |
| 规则参数 | `ask_user` | 显式默认并标假设 |
| 计算 | `opptrix_run` / `workspace_write` | 可选 |
| 交付 | `list_web_vendor` → `create_web` | 可跳过口头要点 |
| A股代理篮 | `get_etf_*` / 宽基·行业·债·货币 ETF 池 | 全球篮仅用户点名；否则维持国内代理并声明 |


## 步骤

1. **确认默认 CN**：标的/宇宙为 A股或场内 ETF（用户点名其他市场再切换并声明差异）。应用涨跌停/T+1/融券受限等微观约束（见 A股适配）。
2. **确认候选 ETF 池与轮动规则**（窗口、持有 Top-N 等）。
3. **声明非 LEAN Runtime**。
4. **拉取净值/价格**，计算相对强弱表。
5. **交叉验证**多窗口；注明数据缺口。
6. **分栏结论** → 默认 `create_web`。

## 网页报告建议目录

1. 范围：默认 A股/场内 ETF + LEAN 溯源
2. 数据口径与时效  
3. 相对强弱 / 排名表（事实）  
4. 规则当前状态（假设驱动）  
5. 事实 / 假设 / 推断  
6. 缺口、汇率与跟踪风险  
7. A股适配与限制（默认 CN；微观结构/代理/完整度）
8. 免责声明（轮动状态≠买卖建议）

## 禁止

- 荐股或「应买入某国 ETF」式建议  
- **禁止假装跑完整 LEAN 引擎**  
- 用单只 `@skill:etf-research` 路径冒充轮动结论却不给对照表  
- **禁止无交付就结束**（默认 web）
- 禁止把美股成分/ETF 清单不经映射直接当 A股结果
- 禁止假设可自由融券做空
