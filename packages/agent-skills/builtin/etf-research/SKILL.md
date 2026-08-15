---
name: etf-research
description: ETF 研究工作流（get_etf_list / get_etf_nav / get_etf_holdings / get_etf_profile）。用户说「ETF」「场内基金」「看一下 ETF」「净值」「持仓」「ETF 对比」「/etf-research」时使用。收集概况/净值/持仓证据后结构化输出；默认用 create_web 交付可预览 HTML。
license: Apache-2.0
metadata:
  author: opptrix
  version: "2.0"
  title: ETF研究
  summary: ETF 概况、净值与持仓结构一页通
  category: equity
  slash-rank: "80"
  default-deliverable: web
  required-packs: etf artifacts
allowed-tools: get_etf_list get_etf_nav get_etf_holdings get_etf_profile create_web update_web read_web list_web_vendor create_canvas create_mindmap
---

# ETF 研究

## 何时使用

用户要了解 **ETF/场内基金** 的概况、净值走势或持仓结构（不是个股尽调，也不是全市场早报）。默认交付**可预览网页**。

## 分析架构（投研方法）

- **问题/假设**：该 ETF 跟踪什么、暴露什么风险？持仓是否与宣称主题一致？
- **证据清单**：列表定位、概况（指数/规模/费用）、净值序列、持仓与行业分布
- **多维交叉验证**：概况跟踪指数 vs 持仓前十大；净值波动 vs 持仓集中度
- **结论与不确定**：结构事实优先；「适合/不适合某场景」须标推断且不构成建议
- **风险与缺口**：缺净值、持仓延迟、场外联接差异
- **事实与推断必须分开**

## 数据维度

| 维度 | 取数方向 | 缺失时 |
|------|----------|--------|
| 定位 | `get_etf_list` / 搜索 | 多候选请用户选择 |
| 概况 | `get_etf_profile` | 仅写可得字段 |
| 净值 | `get_etf_nav` | 省略净值图 |
| 持仓 | `get_etf_holdings` | 省略持仓章并说明 |
| 交付 | `list_web_vendor` → `create_web` | 用户只要口头要点时可跳过 |

## 步骤

1. **确认 ETF 代码/名称**（可对比多只时先确认清单）。
2. **按维度取数**：概况 → 净值 → 持仓。
3. **交叉验证与结构化结论**：概况 → 净值要点 → 持仓/行业 → 局限。
4. **交付网页（默认）**：`list_web_vendor` → `create_web`（净值可用本地 vendor 图表）；已有则 `read_web` / `update_web`。
5. **备选**：用户点名画布 / 结构图时改用对应工具。

## 网页报告建议目录

1. ETF 卡片：代码、名称、跟踪指数  
2. 规模、费用与关键概况字段  
3. 净值走势要点（图/表）  
4. 持仓与行业分布  
5. 结构风险与数据局限  
6. 免责声明（无买卖建议）

## 禁止

- 荐股或编造持仓/净值  
- **禁止无交付就结束**（默认须有 web 产物，除非用户明确只要口头要点）  
- 把个股尽调流程硬套到 ETF（用户明确要个股时转 `@skill:equity-deep-dive`）
