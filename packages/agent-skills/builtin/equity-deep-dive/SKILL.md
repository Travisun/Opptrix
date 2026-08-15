---
name: equity-deep-dive
description: 个股深度分析 / 尽调工作流。用户说「深度分析」「全面研究」「帮我看看这只股票怎么样」「个股尽调」时使用。按快照→基本面→资金/资讯收集证据后结构化结论；默认用 create_web 交付可预览 HTML 尽调报告（用户点名画布才用 create_canvas）。
license: Apache-2.0
metadata:
  author: opptrix
  version: "2.0"
  title: 个股尽调
  summary: 多维证据交叉验证，交付尽调报告
  category: equity
  slash-rank: "40"
  default-deliverable: web
  required-packs: fundamentals market instrument_analytics artifacts
allowed-tools: get_instrument_profile get_instrument_financials get_instrument_money_flow get_instrument_chart get_instrument_snapshot create_web update_web read_web list_web_vendor create_canvas create_mindmap
---

# 个股深度分析

## 何时使用

用户要对**单只股票/标的**做较完整的投研解读（非只要现价）。默认交付**可预览 HTML 尽调报告**。

## 分析架构（投研方法）

- **问题/假设**：商业模式是否清晰？增长与盈利质量是否匹配估值叙事？资金与舆情是否支持或证伪？
- **证据清单**：快照/行情、公司概况、财务、资金流向、图表结构、（按需）资讯/公告
- **多维交叉验证**：财务趋势 vs 价格位置；资金流 vs 价格涨跌；披露事实 vs 市场叙事
- **结论与不确定**：分「事实摘要 / 推断与假设 / 风险」三块；置信度随数据完整度下降
- **风险与缺口**：缺财务、缺资金流、跨市场字段差异
- **事实与推断必须分开**：禁止把推断写成「公司将…」的既定事实

## 数据维度

| 维度 | 取数方向 | 缺失时 |
|------|----------|--------|
| 标的定位 | `search_instruments` / 快照 | 多候选时 `ask_user` 确认 |
| 行情快照 | `get_instrument_snapshot` / 报价工具 | 标明无实时价 |
| 公司概况 | `get_instrument_profile` | 跳过概况章 |
| 财务 | `get_instrument_financials`（及利润/资产负债/现金流按需） | 明确「暂无该期数据」 |
| 资金 | `get_instrument_money_flow` | 省略资金章 |
| 图表结构 | `get_instrument_chart` | 仅文字描述区间，勿画假图 |
| 交付 | `list_web_vendor` → `create_web` | 用户只要口头要点时可跳过 |

## 步骤

1. **确认标的**：定位 `instrument`；多候选请用户确认。
2. **按维度取数**：快照 → 概况/财务 → 资金/图表；可并行独立调用。
3. **交叉验证与结构化结论**：事实摘要（带时效）→ 推断与假设 → 风险与不确定性。
4. **交付网页（默认）**：`list_web_vendor` → `create_web` 完整 HTML 报告页（可用本地 vendor 图表）。已有则 `read_web` / `update_web`。完整 HTML 规范见 `@skill:create-web`。
5. **备选**：用户明确要「画布/一页式机构报告」用 `create_canvas`（`@skill:create-canvas`）；只要结构图用 `create_mindmap`。

## 网页报告建议目录

1. 标的卡片：代码、名称、价格与时效  
2. 投资问题与分析框架  
3. 公司与业务概况  
4. 财务与盈利质量  
5. 行情与资金面  
6. 交叉验证结论（事实 / 推断分栏）  
7. 风险、缺口与后续观察清单  
8. 免责声明（无买卖建议）

## 禁止

- 荐股、目标价、仓位建议；编造未返回数字  
- **禁止无交付就结束**（默认须有 web 产物，除非用户明确只要口头要点）  
- 降级/兜底数据须标注可信度受限
